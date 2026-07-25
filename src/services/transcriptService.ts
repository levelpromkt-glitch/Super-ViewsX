import { fetchTranscriptWithFallbackFn } from './transcriptFn';

export type TranscriptLine = { time: string; seconds: number; text: string; start: number; duration: number };

export type TranscriptResult = {
  videoId: string;
  lines: TranscriptLine[];
  source: string; // "cache" | "YoutubeTranscript" | "RapidAPI" | etc
};

export class TranscriptError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'TranscriptError';
  }
}

export const TranscriptService = {
  /**
   * Obtém a transcrição de um vídeo chamando o orquestrador no backend (Server Function).
   * Em caso de falha final, lança um TranscriptError.
   */
  async getTranscript(videoId: string): Promise<TranscriptResult> {
    const result = await fetchTranscriptWithFallbackFn({ data: { videoId } });

    if (!result.success || !result.lines) {
      throw new TranscriptError(
        result.error || 'Erro ao obter legendas. Verifique a disponibilidade de legendas fechadas no vídeo.',
        result.error || 'SERVER_ERROR'
      );
    }

    // Como o executor agora retorna apenas as linhas, podemos inferir que o source é o novo fluxo
    return { videoId, lines: result.lines as TranscriptLine[], source: 'TranscriptJobExecutor' };
  }
};
