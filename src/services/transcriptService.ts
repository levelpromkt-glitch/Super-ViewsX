import { supabase } from "@/lib/supabase";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { YoutubeTranscript } from "youtube-transcript";

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

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export const fetchYoutubeTranscriptFn = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(async ({ data: videoId }) => {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      
      const lines = transcript.map((t) => ({
        time: formatTime(t.offset / 1000),
        seconds: Math.floor(t.offset / 1000),
        text: t.text,
        start: t.offset / 1000,
        duration: t.duration / 1000,
      }));
      
      return { success: true, lines };
    } catch (error: any) {
      const msg = error.message || "";
      if (msg.includes("Transcript is disabled") || msg.includes("No transcripts")) {
        return { success: false, error: "Legendas desativadas ou indisponíveis para este vídeo", code: "NO_CAPTIONS" };
      }
      return { success: false, error: "Erro ao acessar o YouTube", code: "SERVER_ERROR" };
    }
  });


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
