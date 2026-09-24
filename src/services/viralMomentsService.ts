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

export type TranscribeUploadResult = {
  lines: TranscriptLine[];
  videoDurationSec: number;
};

export const ViralMomentsService = {
  // Uploads a source video directly to Cloudflare R2 (bypassing Supabase
  // Storage's 50MB free-tier project-wide cap, which a bucket-level limit
  // can't override). Returns the R2 object key to use as the clip source.
  async uploadSourceVideoToR2(file: File): Promise<string> {
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

    const putResponse = await fetch(data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "video/mp4" },
      body: file,
    });
    if (!putResponse.ok) {
      throw new ViralMomentsError("Falha ao enviar o vídeo.", "UPLOAD_FAILED");
    }

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
        return { lines: result.lines, videoDurationSec: result.videoDurationSec || 0 };
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
    duration: DurationPreset
  ): Promise<FindBestMomentsResult> {
    const { data, error } = await supabase.functions.invoke("viral-moments", {
      body: { videoId, title, lines, duration },
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
};
