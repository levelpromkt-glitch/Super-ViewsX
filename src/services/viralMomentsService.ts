import { supabase } from "@/lib/supabase";
import { readEdgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import type { TranscriptLine } from "./transcript/types";

export type DurationPreset = "10-30" | "30-60" | "60-120" | "120-180";

export type NarrativeProfile = "fast_answer" | "contrarian" | "money" | "story" | "humor" | "transformation";

export type ViralMoment = {
  id: string;
  start: number;
  end: number;
  title: string;
  titles: string[];
  profile?: NarrativeProfile;
  reason: string;
  hookStart?: number;
  hookReason?: string;
  score: number;
  // First-pass transcript context ("start|end|text"), only used to feed the judge pass.
  slice?: string[];
  // A candidate that did not make the recommended list (kept so the creator can still judge it).
  other?: boolean;
  rejectReason?: string;
};

export class ViralMomentsError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ViralMomentsError";
  }
}

export type FindBestMomentsResult = {
  moments: ViralMoment[];
  videoTopic?: string;
};

// Auxiliary hints extracted from the raw audio (loudness spikes, overlapping
// speech) that the transcript text alone doesn't capture. Only available for
// the upload path (the VM has the audio); passed to viral-moments as extra
// context so the AI can factor in tension/energy it can't read from words.
export type AudioSignal = { time: number; type: "energy_peak" | "interruption"; detail?: string };

export type TranscribeUploadResult = {
  lines: TranscriptLine[];
  videoDurationSec: number;
  audioSignals?: AudioSignal[];
  // [word, start, end] of every spoken word — lets the server cut on sentence boundaries.
  words?: [string, number, number][];
};

export const ViralMomentsService = {
  // Uploads a source video directly to Cloudflare R2 (bypassing Supabase
  // Storage's 50MB free-tier project-wide cap, which a bucket-level limit
  // can't override). Returns the R2 object key to use as the clip source.
  async uploadSourceVideoToR2(file: File, onProgress?: (percent: number) => void): Promise<string> {
    const ext = file.name.split(".").pop() || "mp4";
    const { data, error } = await supabase.functions.invoke("r2-upload-url", {
      body: { ext },
    });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao preparar o upload.");
      throw new ViralMomentsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new ViralMomentsError(data?.message || "Erro ao preparar o upload.", data?.code || "UNKNOWN_ERROR");
    }

    // XMLHttpRequest instead of fetch: it is the only way to get upload progress.
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", data.uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.min(100, Math.floor((e.loaded / e.total) * 100)));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new ViralMomentsError("Falha ao enviar o vídeo.", "UPLOAD_FAILED"));
      xhr.onerror = () => reject(new ViralMomentsError("Falha ao enviar o vídeo. Verifique a conexão.", "UPLOAD_FAILED"));
      xhr.send(file);
    });
    onProgress?.(100);

    return data.key as string;
  },

  async transcribeUpload(source: { storagePath: string } | { r2Key: string }): Promise<TranscribeUploadResult> {
    const { data, error } = await supabase.functions.invoke("transcribe-upload", {
      body: source,
    });

    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao transcrever o vídeo enviado.");
      throw new ViralMomentsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new ViralMomentsError(data?.message || "Erro ao transcrever o vídeo.", data?.code || "UNKNOWN_ERROR");
    }
    return { lines: data.lines as TranscriptLine[], videoDurationSec: data.videoDurationSec || 0 };
  },

  // Enqueues a transcription job the VM itself picks up and processes on its
  // own time — not bound by a Supabase Edge Function's 150s wall-clock
  // limit, which a long podcast can easily exceed.
  async enqueueTranscriptionJob(r2Key: string): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new ViralMomentsError("Sessão inválida.", "UNAUTHENTICATED");

    const { data, error } = await supabase
      .from("video_jobs")
      .insert({ user_id: user.id, source: { r2Key } })
      .select("id")
      .single();
    if (error) throw new ViralMomentsError(error.message, "INSERT_FAILED");
    return data.id as string;
  },

  // Polls the job row until the VM marks it completed/failed.
  async pollTranscriptionJob(
    jobId: string,
    onTick?: (elapsedMs: number) => void
  ): Promise<TranscribeUploadResult> {
    const intervalMs = 4000;
    const timeoutMs = 30 * 60 * 1000; // 30 minutes — generous ceiling for very long videos
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const { data, error } = await supabase
        .from("video_jobs")
        .select("status, result, error_message")
        .eq("id", jobId)
        .single();
      if (error) throw new ViralMomentsError(error.message, "QUERY_FAILED");

      if (data.status === "completed") {
        const result = data.result as TranscribeUploadResult;
        const rawWords = (result as unknown as { words?: { word: string; start: number; end: number }[] }).words;
        const words = Array.isArray(rawWords)
          ? rawWords.map((w) => [String(w.word), Math.round(w.start * 100) / 100, Math.round(w.end * 100) / 100] as [string, number, number])
          : undefined;
        return { lines: result.lines, videoDurationSec: result.videoDurationSec || 0, audioSignals: result.audioSignals, words };
      }
      if (data.status === "failed") {
        throw new ViralMomentsError(data.error_message || "Falha ao transcrever o vídeo.", "JOB_FAILED");
      }

      onTick?.(Date.now() - start);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new ViralMomentsError("A transcrição demorou demais. Tente novamente.", "TIMEOUT");
  },

  async findBestMoments(
    videoId: string,
    title: string,
    lines: TranscriptLine[],
    duration: DurationPreset,
    audioSignals?: AudioSignal[],
    refresh = false,
    words?: [string, number, number][],
    // Passages the creator already has cuts of: the AI must look for other moments.
    exclude?: { start: number; end: number }[],
    // The transcript is only one window of a longer video (the AI is told to look just there).
    windowed = false
  ): Promise<FindBestMomentsResult> {
    const { data, error } = await supabase.functions.invoke("viral-moments", {
      body: { videoId, title, lines, duration, audioSignals, refresh, words, exclude, windowed },
    });

    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao buscar os melhores momentos.");
      throw new ViralMomentsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new ViralMomentsError(data?.message || "Erro ao analisar o vídeo.", data?.code || "UNKNOWN_ERROR");
    }
    return { moments: data.moments as ViralMoment[], videoTopic: data.meta?.videoTopic };
  },

  // Second pass: a stricter model re-reads each candidate's exact text, drops the
  // weak ones, moves the cut to open on the hook / close on the payoff and
  // rewrites the headlines from what is really said inside the cut.
  async judgeMoments(
    videoId: string,
    duration: DurationPreset,
    videoTopic: string | undefined,
    candidates: ViralMoment[],
    refresh = false
  ): Promise<{ moments: ViralMoment[]; rejected: ViralMoment[] }> {
    const { data, error } = await supabase.functions.invoke("viral-judge", {
      body: {
        videoId,
        duration,
        videoTopic,
        refresh,
        candidates: candidates.map((c) => ({
          id: c.id,
          start: c.start,
          end: c.end,
          title: c.title,
          titles: c.titles,
          profile: c.profile,
          reason: c.reason,
          score: c.score,
          slice: c.slice,
        })),
      },
    });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao refinar os cortes.");
      throw new ViralMomentsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new ViralMomentsError(data?.message || "Erro ao refinar os cortes.", data?.code || "UNKNOWN_ERROR");
    }
    return { moments: data.moments as ViralMoment[], rejected: (data.rejected ?? []) as ViralMoment[] };
  },
};
