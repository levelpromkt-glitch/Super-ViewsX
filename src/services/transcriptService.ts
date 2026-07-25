import { supabase } from "@/lib/supabase";
import { fetchYoutubeTranscriptFn } from "@/server/transcriptFn";

export type TranscriptLine = { time: string; seconds: number; text: string; start: number; duration: number };

export type TranscriptResult = {
  videoId: string;
  lines: TranscriptLine[];
  source: "cache" | "youtube-transcript" | "whisper" | "deepgram";
};

export class TranscriptError extends Error {
  constructor(message: string, public code: "NO_CAPTIONS" | "INVALID_URL" | "SERVER_ERROR") {
    super(message);
    this.name = "TranscriptError";
  }
}

export const TranscriptService = {
  /**
   * Obtém a transcrição de um vídeo, verificando primeiro o cache no Supabase.
   * Em caso de falha, retorna TranscriptError.
   */
  async getTranscript(videoId: string): Promise<TranscriptResult> {
    // 1. Verificar Cache
    try {
      const { data: cached, error: cacheError } = await supabase
        .from("transcripts")
        .select("lines")
        .eq("videoId", videoId)
        .maybeSingle();

      if (cached && cached.lines) {
        return { videoId, lines: cached.lines as TranscriptLine[], source: "cache" };
      }
    } catch (e) {
      console.warn("Erro ao buscar no cache, ignorando...", e);
    }

    // 2. Buscar da Origem (Server Function)
    const result = await fetchYoutubeTranscriptFn({ data: videoId });
      
    if (!result.success || !result.lines) {
      throw new TranscriptError(
        result.error || "Erro ao obter legendas",
        (result.code as any) || "SERVER_ERROR"
      );
    }

    const lines = result.lines as TranscriptLine[];

    // 3. Salvar no Cache de forma assíncrona (não bloqueia a resposta)
    supabase.from("transcripts").insert({
      videoId,
      lines,
    }).then(({ error }) => {
      if (error) console.error("Erro ao salvar no cache da transcrição:", error);
    });

    return { videoId, lines, source: "youtube-transcript" };
  }
};
