import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { TranscriptJobExecutor } from '../services/transcript/TranscriptJobExecutor';
import { YoutubeTranscriptProvider } from '../services/transcript/providers/YoutubeTranscriptProvider';
import { ExternalTranscriptProvider } from '../services/transcript/providers/ExternalTranscriptProvider';
import { OEmbedMetadataProvider } from '../services/transcript/providers/OEmbedMetadataProvider';
import { TranscriptProvider } from '../services/transcript/types';

export const fetchTranscriptWithFallbackFn = createServerFn({ method: 'POST' })
  .validator((d: { videoId: string }) => d)
  .handler(async (ctx) => {
    const { videoId } = ctx.data;

    // Inicializa a lista de provedores ativos
    const providers: TranscriptProvider[] = [
      new YoutubeTranscriptProvider(),
    ];

    // Aqui usamos variável de ambiente pura do Node, que não vaza pro cliente.
    // Exemplo: process.env.RAPIDAPI_KEY
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (rapidApiKey) {
      providers.push(new ExternalTranscriptProvider(rapidApiKey));
    }

    // Inicializa o provedor de metadados
    const metadataProvider = new OEmbedMetadataProvider();

    // Cria o executor
    const executor = new TranscriptJobExecutor(providers, metadataProvider);

    try {
      const lines = await executor.execute(videoId);
      return { success: true as const, lines };
    } catch (error: any) {
      console.error('Falha final na extração:', error);
      return { 
        success: false as const, 
        error: error.message || 'NO_CAPTIONS'
      };
    }
  });
