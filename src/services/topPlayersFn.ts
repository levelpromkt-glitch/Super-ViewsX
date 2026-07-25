import { createServerFn } from '@tanstack/start';
import { CompetitionEngine } from './competition/CompetitionEngine';
import { YoutubeCompetitionProvider } from './competition/providers/YoutubeCompetitionProvider';
import { MatchMode, Player } from './competition/types';

export const getTopPlayersFn = createServerFn({ method: 'GET' })
  .validator((d: { tag1: string; tag2: string; periodDays: number; matchMode?: MatchMode; maxPages?: number }) => d)
  .handler(async (ctx) => {
    const { tag1, tag2, periodDays, matchMode = 'AND', maxPages = 2 } = ctx.data;

    if (!tag1 || !tag2) {
      throw new Error('Ambas as hashtags são obrigatórias.');
    }

    // Instancia o Provider e a Engine
    const provider = new YoutubeCompetitionProvider();
    const engine = new CompetitionEngine(provider);

    try {
      const players = await engine.getRanking({
        tag1,
        tag2,
        periodDays,
        matchMode,
        maxPages
      });

      return {
        success: true,
        players
      };
    } catch (error: any) {
      console.error('[getTopPlayersFn]', error);
      return {
        success: false,
        players: [] as Player[],
        error: error.message
      };
    }
  });
