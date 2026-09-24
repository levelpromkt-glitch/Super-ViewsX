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
  async transcribeUpload(storagePath: string): Promise<TranscribeUploadResult> {
    const { data, error } = await supabase.functions.invoke("transcribe-upload", {
      body: { storagePath },
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
