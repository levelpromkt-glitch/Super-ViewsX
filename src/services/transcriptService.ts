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
      let errorMessage = 'Erro ao obter legendas. Verifique a disponibilidade de legendas fechadas no vídeo.';
      const errorCode = result.error || 'SERVER_ERROR';

      if (errorCode === 'NO_CAPTIONS') {
        errorMessage = 'Legendas desativadas ou indisponíveis para este vídeo.';
      } else if (errorCode === 'TRANSCRIPT_PROCESSING_TIMEOUT' || errorCode === 'TIMEOUT') {
        errorMessage = 'Tempo limite excedido ao processar as legendas. Tente novamente.';
      } else if (errorCode !== 'SERVER_ERROR') {
        // Se houver alguma outra mensagem amigável no erro, pode usá-la, caso contrário fallback
        errorMessage = `Falha na transcrição (${errorCode}).`;
      }

      throw new TranscriptError(errorMessage, errorCode);
    }

    // Como o executor agora retorna apenas as linhas, podemos inferir que o source é o novo fluxo
    return { videoId, lines: result.lines as TranscriptLine[], source: 'TranscriptJobExecutor' };
  }
};
