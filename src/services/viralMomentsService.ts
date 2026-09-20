import { supabase } from "@/lib/supabase";
import { readEdgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import type { TranscriptLine } from "./transcript/types";

export type ViralMoment = {
  id: string;
  start: number;
  end: number;
  title: string;
  reason: string;
  score: number;
};

export class ViralMomentsError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ViralMomentsError";
  }
}

export const ViralMomentsService = {
  async findBestMoments(videoId: string, title: string, lines: TranscriptLine[]): Promise<ViralMoment[]> {
    const { data, error } = await supabase.functions.invoke("viral-moments", {
      body: { videoId, title, lines },
    });

    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao buscar os melhores momentos.");
      throw new ViralMomentsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new ViralMomentsError(data?.message || "Erro ao analisar o vídeo.", data?.code || "UNKNOWN_ERROR");
    }
    return data.moments as ViralMoment[];
  },
};
