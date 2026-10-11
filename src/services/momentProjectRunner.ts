import { useSyncExternalStore } from "react";
import { TranscriptService, TranscriptError } from "./transcriptService";
import { ViralMomentsService, ViralMomentsError, type DurationPreset } from "./viralMomentsService";
import {
  MomentProjectsService,
  type MomentJob,
  type MomentProject,
  type MomentRun,
  type ProjectStage,
  type ProjectTranscript,
} from "./momentProjectsService";
import {
  extractYouTubeId,
  generateMomentThumbnails,
  parsePastedTranscript,
  readVideoInfo,
} from "@/components/melhores-momentos/momentUtils";

// Runs the "video -> moments" pipeline outside of any React component, so the work keeps going
// while the user moves between the project list and a project page. Only the upload needs this
// browser tab. Transcription runs on the video server and the AI search runs in the
// `moment-jobs` edge function: here we just create the job and watch it (the user may even close
// the tab and find the cuts ready later). Progress that matters (stage, transcript, runs) is saved
// to the database; what only exists while the page is open (upload percentage, status text)
// lives in `states`.

export type RunnerState = {
  stage: ProjectStage;
  // Real percentage (upload only); null = nothing measurable, the bar just animates.
  percent: number | null;
  status: string;
  error?: string;
  // Shown once a round finishes without adding cuts (e.g. nothing new left in the video).
  notice?: string;
  // "initial": first pass of a new project. "extra": another duration on a finished project.
  kind: "initial" | "extra";
};

const states = new Map<string, RunnerState>();
const active = new Set<string>();
// The picked file, kept for this session only: lets later rounds on the same project cut covers.
const sessionFiles = new Map<string, File>();
const listeners = new Set<() => void>();
// version: any change (also progress ticks). dataVersion: something saved to the database changed,
// so a page showing the project should load it again.
let version = 0;
let dataVersion = 0;

const emit = () => {
  version += 1;
  listeners.forEach((fn) => fn());
};
const emitData = () => {
  dataVersion += 1;
  emit();
};

const setState = (projectId: string, patch: Partial<RunnerState> & { stage: ProjectStage }) => {
  const prev = states.get(projectId);
  states.set(projectId, { percent: null, status: "", kind: "initial", ...prev, notice: undefined, ...patch });
  if (!prev || prev.stage !== patch.stage || (patch.kind && prev.kind !== patch.kind)) dataVersion += 1;
  emit();
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const getRunnerState = (projectId: string) => states.get(projectId);
export const isRunnerActive = (projectId: string) => active.has(projectId);

// The upload runs inside this browser tab: closing or reloading it stops it. (Transcription and
// the AI search run on the server, so they survive.) Ask the browser to confirm first.
const hasWorkThatDiesWithTheTab = () => {
  for (const id of active) {
    if (states.get(id)?.stage === "uploading") return true;
  }
  return false;
};
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (!hasWorkThatDiesWithTheTab()) return;
    e.preventDefault();
    e.returnValue = ""; // required by some browsers to show the confirmation
  });
}
export const clearRunnerState = (projectId: string) => {
  states.delete(projectId);
  emit();
};

// Re-renders the caller whenever any project's progress changes.
export function useRunnerVersion() {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}
export const getRunnerDataVersion = () => dataVersion;

const errorMessage = (error: unknown) => {
  if (error instanceof ViralMomentsError || error instanceof TranscriptError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Ocorreu um erro inesperado ao analisar o vídeo.";
};

// ---------------------------------------------------------------------------
// Finding the moments
//
// The `moment-jobs` edge function does the work (it reads the transcript in ~10 minute windows,
// has a second AI judge the candidates and saves the result as a run). The browser only creates
// the job row and then polls it for progress, so closing the tab does not stop anything.
// ---------------------------------------------------------------------------

const POLL_MS = 3000;
const MAX_POLL_ERRORS = 20;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const jobStatusText = (job: MomentJob) => job.status_text || "Analisando os melhores momentos com IA...";

// Covers for the cards come from the file picked in this session; saved with the run
// so they are still there when the project is reopened later.
async function addThumbnails(file: File, runId: string, addedIds: string[], projectId: string) {
  const videoUrl = URL.createObjectURL(file);
  try {
    const run = (await MomentProjectsService.listRuns(projectId)).find((r) => r.id === runId);
    if (!run) return;
    const ids = new Set(addedIds);
    const fresh = run.moments.filter((m) => ids.has(m.id) && !m.thumb);
    if (fresh.length === 0) return;
    const thumbs = await generateMomentThumbnails(fresh, videoUrl);
    const withThumbs = run.moments.map((m) => (thumbs[m.id] ? { ...m, thumb: thumbs[m.id] } : m));
    await MomentProjectsService.updateRunMoments(runId, withThumbs);
    emitData();
  } catch (error) {
    console.error("Falha ao gerar capas dos cortes", error);
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}

// Watches one job until it ends. Resolves when it finished; throws with its error when it failed.
async function trackJob(projectId: string, jobId: string, kind: "initial" | "extra", file?: File) {
  let errors = 0;
  for (;;) {
    let job: MomentJob | null;
    try {
      job = await MomentProjectsService.getJob(jobId);
      errors = 0;
    } catch (error) {
      // A hiccup in the connection must not drop a job that is still running on the server.
      if (++errors >= MAX_POLL_ERRORS) throw error;
      await sleep(POLL_MS);
      continue;
    }
    if (!job) throw new ViralMomentsError("A análise não foi encontrada.", "JOB_NOT_FOUND");

    if (job.status === "failed") throw new ViralMomentsError(job.error || "Não foi possível concluir a análise.", "JOB_FAILED");

    if (job.status === "done") {
      setState(projectId, { stage: "ready", percent: null, status: "", kind, notice: job.notice || undefined });
      emitData();
      const added = job.added_ids ?? [];
      if (file && job.run_id && added.length > 0) void addThumbnails(file, job.run_id, added, projectId);
      return;
    }

    setState(projectId, { stage: "finding", percent: job.progress, status: jobStatusText(job), kind });
    await sleep(POLL_MS);
  }
}

// Creates the job on the server and follows it. For a first pass the project is marked as finding.
async function analyze(
  project: Pick<MomentProject, "id">,
  duration: DurationPreset,
  opts: {
    kind: "initial" | "extra";
    file?: File;
    // An earlier round with this same duration: the new one looks for OTHER moments
    // and its cuts are added to that round instead of repeating it.
    existing?: MomentRun | null;
  }
) {
  const { id } = project;
  if (opts.kind === "initial") {
    await MomentProjectsService.update(id, { stage: "finding", requested_duration: duration, error: null });
  }
  setState(id, { stage: "finding", percent: 0, status: "Iniciando a análise...", kind: opts.kind });
  const jobId = await MomentProjectsService.createJob({
    projectId: id,
    duration,
    kind: opts.kind,
    existingRun: opts.existing ?? null,
  });
  await trackJob(id, jobId, opts.kind, opts.file ?? sessionFiles.get(id));
}

const fail = async (projectId: string, error: unknown, kind: "initial" | "extra") => {
  const message = errorMessage(error);
  console.error("moment project failed", projectId, error);
  if (kind === "initial") {
    await MomentProjectsService.update(projectId, { stage: "failed", error: message }).catch(() => {});
  }
  setState(projectId, { stage: "failed", percent: null, status: "", error: message, kind });
};

async function transcribeUpload(projectId: string, r2Key: string, existingJobId?: string | null): Promise<ProjectTranscript> {
  setState(projectId, { stage: "transcribing", percent: null, status: "Na fila de transcrição...", kind: "initial" });
  let jobId = existingJobId ?? null;
  if (!jobId) {
    jobId = await ViralMomentsService.enqueueTranscriptionJob(r2Key);
    await MomentProjectsService.update(projectId, { stage: "transcribing", job_id: jobId });
  }
  const result = await ViralMomentsService.pollTranscriptionJob(jobId, (elapsedMs) => {
    const mins = Math.floor(elapsedMs / 60000);
    setState(projectId, {
      stage: "transcribing",
      percent: null,
      status:
        mins > 0
          ? `Transcrevendo o áudio do vídeo... (${mins} min — vídeos longos demoram mais)`
          : "Transcrevendo o áudio do vídeo...",
      kind: "initial",
    });
  });
  const transcript: ProjectTranscript = { lines: result.lines, audioSignals: result.audioSignals, words: result.words };
  await MomentProjectsService.saveTranscript(projectId, transcript, result.videoDurationSec);
  return transcript;
}

async function transcribeYoutube(projectId: string, videoId: string): Promise<ProjectTranscript> {
  setState(projectId, { stage: "transcribing", percent: null, status: "Transcrevendo o vídeo...", kind: "initial" });
  const result = await TranscriptService.getTranscript(videoId);
  const last = result.lines[result.lines.length - 1];
  const transcript: ProjectTranscript = { lines: result.lines };
  await MomentProjectsService.saveTranscript(projectId, transcript, last ? last.start + last.duration : null);
  return transcript;
}

// Best-effort: the real title of a YouTube video, so the project is not just a link.
async function fetchYoutubeTitle(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.title === "string" ? data.title : null;
  } catch {
    return null;
  }
}

export const MomentProjectRunner = {
  // Creates the project right away (so the page can open on it) and keeps working in the background.
  async startUpload(opts: { file: File; duration: DurationPreset; pastedTranscript?: string }): Promise<string> {
    const { file, duration } = opts;
    const project = await MomentProjectsService.create({
      source_type: "upload",
      title: file.name.replace(/\.[^.]+$/, ""),
      stage: "uploading",
      requested_duration: duration,
    });
    const id = project.id;
    active.add(id);
    sessionFiles.set(id, file);
    setState(id, { stage: "uploading", percent: 0, status: "Enviando o vídeo...", kind: "initial" });

    void (async () => {
      try {
        // Cover and length come from the file itself while it uploads.
        void readVideoInfo(file).then((info) =>
          MomentProjectsService.update(id, {
            thumbnail: info.thumbnail,
            video_duration_sec: info.duration ? Math.round(info.duration) : null,
          })
            .then(emitData)
            .catch(() => {})
        );

        const key = await ViralMomentsService.uploadSourceVideoToR2(file, (percent) =>
          setState(id, { stage: "uploading", percent, status: "Enviando o vídeo...", kind: "initial" })
        );
        await MomentProjectsService.update(id, { source_key: key, stage: "transcribing" });

        const manual = parsePastedTranscript(opts.pastedTranscript || "");
        if (manual.length > 0) await MomentProjectsService.saveTranscript(id, { lines: manual }, null);
        else await transcribeUpload(id, key);

        // From here on the server does the work: the tab may be closed.
        await analyze({ id }, duration, { kind: "initial", file });
      } catch (error) {
        await fail(id, error, "initial");
      } finally {
        active.delete(id);
        emitData();
      }
    })();

    return id;
  },

  // A YouTube video analysed before reuses its saved transcript: only the search runs again.
  async startYoutube(opts: { url: string; duration: DurationPreset }): Promise<string> {
    const videoId = extractYouTubeId(opts.url);
    if (!videoId) throw new ViralMomentsError("URL inválida. Cole um link do YouTube (ex.: https://youtube.com/watch?v=...).", "INVALID_URL");

    const existing = await MomentProjectsService.findYoutube(videoId);
    if (existing && existing.stage !== "failed") {
      void MomentProjectRunner.startRun(existing.id, opts.duration);
      return existing.id;
    }

    const project = await MomentProjectsService.create({
      source_type: "youtube",
      source_key: videoId,
      title: "Vídeo do YouTube",
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      stage: "transcribing",
      requested_duration: opts.duration,
    });
    const id = project.id;
    active.add(id);
    setState(id, { stage: "transcribing", percent: null, status: "Transcrevendo o vídeo...", kind: "initial" });

    void (async () => {
      try {
        void fetchYoutubeTitle(videoId).then((title) => {
          if (title) MomentProjectsService.update(id, { title }).then(emitData).catch(() => {});
        });
        await transcribeYoutube(id, videoId);
        await analyze({ id }, opts.duration, { kind: "initial" });
      } catch (error) {
        await fail(id, error, "initial");
      } finally {
        active.delete(id);
        emitData();
      }
    })();

    return id;
  },

  // Another round on a finished project (e.g. another clip length) — no new upload or transcription.
  async startRun(projectId: string, duration: DurationPreset): Promise<void> {
    if (active.has(projectId)) return;
    active.add(projectId);
    setState(projectId, { stage: "finding", percent: 0, status: "Iniciando a análise...", kind: "extra" });
    try {
      // Already running on the server (e.g. started from another tab): just follow it.
      const running = await MomentProjectsService.latestActiveJob(projectId);
      if (running) {
        await trackJob(projectId, running.id, running.kind, sessionFiles.get(projectId));
        return;
      }
      const runs = await MomentProjectsService.listRuns(projectId);
      await analyze({ id: projectId }, duration, {
        kind: "extra",
        existing: runs.find((r) => r.duration === duration) ?? null,
      });
    } catch (error) {
      await fail(projectId, error, "extra");
    } finally {
      active.delete(projectId);
      emitData();
    }
  },

  // A failed project tries again from the last step that worked (a failed upload cannot).
  async retry(project: MomentProject): Promise<void> {
    if (active.has(project.id) || project.stage !== "failed") return;
    if (project.source_type === "upload" && !project.source_key) return;
    clearRunnerState(project.id);
    await MomentProjectsService.update(project.id, { stage: "transcribing", error: null, job_id: null });
    MomentProjectRunner.resume({ ...project, stage: "transcribing", error: null, job_id: null });
  },

  // The page was reloaded (or opened later) while the project was still being processed:
  // pick up from the last saved step. An interrupted upload cannot be resumed.
  resume(project: MomentProject): void {
    const id = project.id;
    if (active.has(id) || project.stage === "failed") return;

    // Finished project: nothing to redo, but a new round may still be running on the server.
    if (project.stage === "ready") {
      active.add(id);
      void (async () => {
        try {
          const running = await MomentProjectsService.latestActiveJob(id);
          if (running) await trackJob(id, running.id, running.kind, sessionFiles.get(id));
        } catch (error) {
          await fail(id, error, "extra");
        } finally {
          active.delete(id);
          emitData();
        }
      })();
      return;
    }

    if (project.stage === "uploading") {
      void fail(id, new Error("O envio do vídeo foi interrompido. Envie o arquivo novamente."), "initial");
      return;
    }

    active.add(id);
    void (async () => {
      try {
        const duration = project.requested_duration ?? "30-60";
        // The search may already be running on the server (the tab was closed meanwhile).
        const running = project.stage === "finding" ? await MomentProjectsService.latestActiveJob(id) : null;
        if (running) {
          await trackJob(id, running.id, running.kind, sessionFiles.get(id));
          return;
        }
        const transcript = await MomentProjectsService.getTranscript(id);
        if (!transcript) {
          if (project.source_type === "youtube") await transcribeYoutube(id, project.source_key);
          else await transcribeUpload(id, project.source_key, project.job_id);
        }
        await analyze({ id }, duration, { kind: "initial" });
      } catch (error) {
        await fail(id, error, "initial");
      } finally {
        active.delete(id);
        emitData();
      }
    })();
  },
};
