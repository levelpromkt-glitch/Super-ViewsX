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
  type MomentRun,
  type ProjectStage,
  type ProjectTranscript,
  type StoredMoment,
} from "./momentProjectsService";
import { buildWindows, dedupeByOverlap, overlapRatio, type Range } from "./momentWindows";
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
// 1. The transcript is read in ~10 minute windows (each by its own AI call, a few at a time):
//    a model that reads a short stretch carefully finds far more than one that skims an hour.
//    Short videos are a single window.
// 2. Every window's candidates are merged (overlaps removed) and re-read by a stricter judge,
//    in chunks, which keeps the genuinely strong cuts and fixes their start and end.
// 3. What the judge leaves out is not thrown away: the best of it comes back as "other
//    candidates", each with the reason it stayed out.
// ---------------------------------------------------------------------------

const WINDOW_CONCURRENCY = 4;
const CANDIDATES_PER_WINDOW = 9; // when there are several windows
const CANDIDATES_SINGLE_WINDOW = 30;
const MAX_CANDIDATES = 80;
const JUDGE_CHUNK = 24;
const MAX_OTHERS = 40;

const isNoCredits = (error: unknown) => error instanceof Error && /créditos da IA/i.test(error.message);

type SearchResult = { moments: ViralMoment[]; others: ViralMoment[]; videoTopic?: string; warning?: string };

async function searchMoments(
  key: string,
  transcript: ProjectTranscript,
  duration: DurationPreset,
  refresh: boolean,
  exclude: Range[],
  onStatus: (status: string) => void
): Promise<SearchResult> {
  const withoutSlice = (m: ViralMoment): ViralMoment => {
    const { slice: _slice, ...rest } = m;
    return rest as ViralMoment;
  };

  // ---- 1. scan every window
  const windows = buildWindows(transcript);
  if (windows.length === 0) return { moments: [], others: [] };
  const single = windows.length === 1;
  let done = 0;
  const report = () =>
    onStatus(single ? "Analisando os melhores momentos com IA..." : `Lendo o vídeo em partes (${done} de ${windows.length})...`);
  report();

  const results: ({ moments: ViralMoment[]; videoTopic?: string } | null)[] = new Array(windows.length).fill(null);
  const errors: unknown[] = [];
  let next = 0;
  let fatal: unknown = null;

  const worker = async () => {
    while (fatal === null) {
      const i = next++;
      if (i >= windows.length) return;
      const w = windows[i];
      const signals = transcript.audioSignals?.filter((s) => s.time >= w.start && s.time <= w.end);
      const nearby = exclude.filter((r) => r.end >= w.start - 30 && r.start <= w.end + 30);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await ViralMomentsService.findBestMoments(
            key, "", w.lines, duration, signals, refresh, w.words, nearby, !single
          );
          results[i] = { moments: r.moments, videoTopic: r.videoTopic };
          break;
        } catch (error) {
          if (isNoCredits(error)) {
            fatal = error;
            return;
          }
          if (attempt === 1) errors.push(error);
        }
      }
      done++;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(WINDOW_CONCURRENCY, windows.length) }, worker));
  if (fatal) throw fatal;
  if (results.every((r) => r === null)) throw errors[0] ?? new ViralMomentsError("Falha ao analisar o vídeo com IA.", "UNKNOWN_ERROR");
  const failedWindows = results.filter((r) => r === null).length;

  // ---- merge the windows' candidates
  const cap = single ? CANDIDATES_SINGLE_WINDOW : CANDIDATES_PER_WINDOW;
  let candidates: ViralMoment[] = [];
  results.forEach((r, wi) => {
    if (!r) return;
    const best = [...r.moments].sort((a, b) => b.score - a.score).slice(0, cap);
    best.forEach((m) => candidates.push({ ...m, id: `w${wi}-${m.id}` }));
  });
  candidates = dedupeByOverlap(candidates).slice(0, MAX_CANDIDATES);
  const videoTopic = results.find((r) => r?.videoTopic)?.videoTopic;
  const warning =
    failedWindows > 0
      ? `${failedWindows} ${failedWindows === 1 ? "parte do vídeo não pôde" : "partes do vídeo não puderam"} ser analisada${failedWindows === 1 ? "" : "s"}. Rode "Nova análise" para tentar achar os cortes que faltaram.`
      : undefined;
  if (candidates.length === 0) return { moments: [], others: [], videoTopic, warning };

  // ---- 2. judge, in chunks
  onStatus(`Refinando ${candidates.length} candidatos com uma segunda IA (só os mais virais passam)...`);
  const chunks: ViralMoment[][] = [];
  for (let i = 0; i < candidates.length; i += JUDGE_CHUNK) chunks.push(candidates.slice(i, i + JUDGE_CHUNK));
  const judgedChunks = await Promise.allSettled(
    chunks.map((c) => ViralMomentsService.judgeMoments(key, duration, videoTopic, c, refresh))
  );

  const kept: ViralMoment[] = [];
  const others: ViralMoment[] = [];
  let judgeOk = 0;
  judgedChunks.forEach((r, ci) => {
    if (r.status === "fulfilled") {
      judgeOk++;
      kept.push(...r.value.moments);
      others.push(...r.value.rejected);
    } else {
      console.error("Revisão de um grupo de candidatos falhou", r.reason);
      // Never lose them: they come back as candidates the second AI did not get to review.
      others.push(
        ...chunks[ci].map((m) => ({
          ...withoutSlice(m),
          other: true,
          rejectReason: "A segunda IA não conseguiu revisar este candidato. A nota é da primeira análise.",
        }))
      );
    }
  });

  // Judge down entirely: the first-pass list still beats an empty screen.
  if (judgeOk === 0) {
    const firstPass = [...candidates].sort((a, b) => b.score - a.score);
    return {
      moments: firstPass.slice(0, CANDIDATES_SINGLE_WINDOW).map(withoutSlice),
      others: [],
      videoTopic,
      warning: warning ?? "A revisão da segunda IA falhou; estes cortes vêm só da primeira análise.",
    };
  }

  // ---- 3. final lists: recommended first, then the best of the rest
  const finalMoments = dedupeByOverlap(kept).map((m, i) => ({ ...withoutSlice(m), id: `m${i + 1}` }));
  const finalOthers = dedupeByOverlap(others)
    .filter((o) => !finalMoments.some((m) => overlapRatio(m, o) > 0.5))
    .slice(0, MAX_OTHERS)
    .map((o, i) => ({ ...withoutSlice(o), id: `o${i + 1}`, other: true }));
  return { moments: finalMoments, others: finalOthers, videoTopic, warning };
}

const sortStored = (list: StoredMoment[]): StoredMoment[] => [
  ...list.filter((m) => !m.other).sort((a, b) => b.score - a.score),
  ...list.filter((m) => m.other).sort((a, b) => b.score - a.score),
];

// Last step of every flow: find the moments, save them as a run, mark the project ready.
async function analyze(
  project: Pick<MomentProject, "id" | "source_type" | "source_key">,
  transcript: ProjectTranscript,
  duration: DurationPreset,
  opts: {
    kind: "initial" | "extra";
    refresh: boolean;
    file?: File;
    // An earlier round with this same duration: the new one looks for OTHER moments
    // and its cuts are added to that round instead of repeating it.
    existing?: MomentRun | null;
  }
) {
  const { id } = project;
  const searchKey = project.source_key;
  if (opts.kind === "initial") {
    await MomentProjectsService.update(id, { stage: "finding", requested_duration: duration, error: null });
  }
  setState(id, { stage: "finding", percent: null, status: "Analisando os melhores momentos com IA...", kind: opts.kind });

  // Everything already in that round (recommended or not) must not come back.
  const exclude = (opts.existing?.moments ?? []).map((m) => ({ start: m.start, end: m.end }));
  const result = await searchMoments(searchKey, transcript, duration, opts.refresh, exclude, (status) =>
    setState(id, { stage: "finding", percent: null, status, kind: opts.kind })
  );

  // Safety net: the AI may still return part of a passage that was already cut.
  const isNew = (m: Range) => !exclude.some((r) => overlapRatio(m, r) > 0.3);
  const freshMoments = opts.existing ? result.moments.filter(isNew) : result.moments;
  const freshOthers = opts.existing ? result.others.filter(isNew) : result.others;

  let target: MomentRun;
  let added: StoredMoment[];
  let total: number;

  if (opts.existing) {
    if (freshMoments.length + freshOthers.length === 0) {
      setState(id, {
        stage: "ready",
        percent: null,
        status: "",
        kind: opts.kind,
        notice: result.warning ?? "Não encontramos mais cortes novos nesse vídeo com essa duração. Tente outra duração em \"Nova análise\".",
      });
      return;
    }
    // New ids continue after the existing ones so the cards never collide.
    const maxId = (prefix: string) =>
      opts.existing!.moments.filter((m) => m.id.startsWith(prefix)).reduce((max, m) => Math.max(max, Number(m.id.replace(/\D/g, "")) || 0), 0);
    let nm = maxId("m");
    let no = maxId("o");
    added = [
      ...freshMoments.map((m) => ({ ...m, id: `m${++nm}` })),
      ...freshOthers.map((m) => ({ ...m, id: `o${++no}`, other: true })),
    ];
    const merged = sortStored([...opts.existing.moments, ...added]);
    await MomentProjectsService.updateRunMoments(opts.existing.id, merged);
    target = { ...opts.existing, moments: merged };
    total = merged.filter((m) => !m.other).length;
  } else {
    added = sortStored([...result.moments, ...result.others] as StoredMoment[]);
    target = await MomentProjectsService.addRun(id, duration, added, result.videoTopic);
    total = result.moments.length;
  }

  await MomentProjectsService.update(id, { stage: "ready", error: null, moments_count: total, requested_duration: null });
  setState(id, { stage: "ready", percent: null, status: "", kind: opts.kind, notice: result.warning });

  // Covers for the cards come from the file picked in this session; saved with the run
  // so they are still there when the project is reopened later.
  if (opts.file && added.length > 0) {
    const videoUrl = URL.createObjectURL(opts.file);
    try {
      const thumbs = await generateMomentThumbnails(added, videoUrl);
      const addedIds = new Set(added.map((m) => m.id));
      const withThumbs = target.moments.map((m) => (addedIds.has(m.id) ? { ...m, thumb: thumbs[m.id] } : m));
      await MomentProjectsService.updateRunMoments(target.id, withThumbs);
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
      const runs = await MomentProjectsService.listRuns(projectId);
      await analyze(project, transcript, duration, {
        kind: "extra",
        refresh: opts.refresh ?? false,
        file: sessionFiles.get(projectId),
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
