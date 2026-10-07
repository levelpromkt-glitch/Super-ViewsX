import { useSyncExternalStore } from "react";
import { TranscriptService, TranscriptError } from "./transcriptService";
import {
  ViralMomentsService,
  ViralMomentsError,
  type DurationPreset,
  type ViralMoment,
} from "./viralMomentsService";
import {
  MomentProjectsService,
  type MomentProject,
  type ProjectStage,
  type ProjectTranscript,
  type StoredMoment,
} from "./momentProjectsService";
import {
  extractYouTubeId,
  generateMomentThumbnails,
  parsePastedTranscript,
  readVideoInfo,
} from "@/components/melhores-momentos/momentUtils";

// Runs the whole "video -> moments" pipeline outside of any React component, so
// the work keeps going while the user moves between the project list and a
// project page. Progress that matters (stage, transcript, runs) is saved to the
// database; what only exists while the page is open (upload percentage, status
// text) lives in `states`.

export type RunnerState = {
  stage: ProjectStage;
  // Real percentage (upload only); null = nothing measurable, the bar just animates.
  percent: number | null;
  status: string;
  error?: string;
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
  states.set(projectId, { percent: null, status: "", kind: "initial", ...prev, ...patch });
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

// Two passes: a wide first pass over the whole transcript, then a stricter
// judge that keeps only the genuinely strong cuts and fixes their boundaries.
// If the judge itself fails, the first-pass list is still better than nothing.
async function searchMoments(
  key: string,
  transcript: ProjectTranscript,
  duration: DurationPreset,
  refresh: boolean,
  onStatus: (status: string) => void
): Promise<{ moments: ViralMoment[]; videoTopic?: string }> {
  onStatus("Analisando os melhores momentos com IA...");
  const first = await ViralMomentsService.findBestMoments(
    key,
    "",
    transcript.lines,
    duration,
    transcript.audioSignals,
    refresh,
    transcript.words
  );
  const withoutSlices = (list: ViralMoment[]) => list.map(({ slice: _slice, ...rest }) => rest as ViralMoment);
  if (first.moments.length === 0) return { moments: [], videoTopic: first.videoTopic };

  onStatus("Refinando os cortes com uma segunda IA (só os mais virais passam)...");
  try {
    const judged = await ViralMomentsService.judgeMoments(key, duration, first.videoTopic, first.moments, refresh);
    return { moments: withoutSlices(judged), videoTopic: first.videoTopic };
  } catch (error) {
    console.error("Segunda passada falhou, mantendo a primeira", error);
    return { moments: withoutSlices(first.moments), videoTopic: first.videoTopic };
  }
}

// Last step of every flow: find the moments, save them as a run, mark the project ready.
async function analyze(
  project: Pick<MomentProject, "id" | "source_type" | "source_key">,
  transcript: ProjectTranscript,
  duration: DurationPreset,
  opts: { kind: "initial" | "extra"; refresh: boolean; file?: File }
) {
  const { id } = project;
  const searchKey = project.source_key;
  if (opts.kind === "initial") {
    await MomentProjectsService.update(id, { stage: "finding", requested_duration: duration, error: null });
  }
  setState(id, { stage: "finding", percent: null, status: "Analisando os melhores momentos com IA...", kind: opts.kind });

  const result = await searchMoments(searchKey, transcript, duration, opts.refresh, (status) =>
    setState(id, { stage: "finding", percent: null, status, kind: opts.kind })
  );

  const run = await MomentProjectsService.addRun(id, duration, result.moments as StoredMoment[], result.videoTopic);
  await MomentProjectsService.update(id, {
    stage: "ready",
    error: null,
    moments_count: result.moments.length,
    requested_duration: null,
  });
  setState(id, { stage: "ready", percent: null, status: "", kind: opts.kind });

  // Covers for the cards come from the file picked in this session; saved with the run
  // so they are still there when the project is reopened later.
  if (opts.file && result.moments.length > 0) {
    const videoUrl = URL.createObjectURL(opts.file);
    try {
      const thumbs = await generateMomentThumbnails(result.moments, videoUrl);
      const withThumbs = (result.moments as StoredMoment[]).map((m) => ({ ...m, thumb: thumbs[m.id] }));
      await MomentProjectsService.updateRunMoments(run.id, withThumbs);
      emitData();
    } catch (error) {
      console.error("Falha ao gerar capas dos cortes", error);
    } finally {
      URL.revokeObjectURL(videoUrl);
    }
  }
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
        const transcript: ProjectTranscript =
          manual.length > 0
            ? await (async () => {
                const t = { lines: manual };
                await MomentProjectsService.saveTranscript(id, t, null);
                return t;
              })()
            : await transcribeUpload(id, key);

        await analyze({ id, source_type: "upload", source_key: key }, transcript, duration, {
          kind: "initial",
          refresh: false,
          file,
        });
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
        const transcript = await transcribeYoutube(id, videoId);
        await analyze({ id, source_type: "youtube", source_key: videoId }, transcript, opts.duration, {
          kind: "initial",
          refresh: false,
        });
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
  async startRun(projectId: string, duration: DurationPreset, opts: { refresh?: boolean } = {}): Promise<void> {
    if (active.has(projectId)) return;
    active.add(projectId);
    setState(projectId, { stage: "finding", percent: null, status: "Analisando os melhores momentos com IA...", kind: "extra" });
    try {
      const [project, transcript] = await Promise.all([
        MomentProjectsService.get(projectId),
        MomentProjectsService.getTranscript(projectId),
      ]);
      if (!transcript) throw new ViralMomentsError("A transcrição deste projeto não está disponível. Envie o vídeo de novo.", "NO_TRANSCRIPT");
      await analyze(project, transcript, duration, { kind: "extra", refresh: opts.refresh ?? false, file: sessionFiles.get(projectId) });
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
    if (active.has(id) || project.stage === "ready" || project.stage === "failed") return;

    if (project.stage === "uploading") {
      void fail(id, new Error("O envio do vídeo foi interrompido. Envie o arquivo novamente."), "initial");
      return;
    }

    active.add(id);
    void (async () => {
      try {
        const duration = project.requested_duration ?? "30-60";
        let transcript = await MomentProjectsService.getTranscript(id);
        if (!transcript) {
          transcript =
            project.source_type === "youtube"
              ? await transcribeYoutube(id, project.source_key)
              : await transcribeUpload(id, project.source_key, project.job_id);
        }
        await analyze(project, transcript, duration, { kind: "initial", refresh: false });
      } catch (error) {
        await fail(id, error, "initial");
      } finally {
        active.delete(id);
        emitData();
      }
    })();
  },
};
