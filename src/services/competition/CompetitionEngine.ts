import { supabase } from '../../../lib/supabase';
import { CompetitionProvider, CompetitionQuery, Player } from './types';
import { SearchAggregator } from './analytics/SearchAggregator';
import { InsightGenerator } from './analytics/InsightGenerator';

export class CompetitionEngine {
  constructor(private provider: CompetitionProvider) {}

  public async getRanking(query: CompetitionQuery): Promise<Player[]> {
    // 1. Monta a chave de cache ultra-inteligente
    const cacheKey = `${this.provider.name}|${query.tag1.toLowerCase()}|${query.tag2.toLowerCase()}|${query.matchMode}|${query.periodDays}d|${query.language || 'none'}|${query.maxPages}`;
    
    // 2. Verifica no Supabase
    const { data: cacheData, error: cacheError } = await supabase
      .from('competition_cache')
      .select('*')
      .eq('cache_key', cacheKey)
      .single();

    if (cacheData && new Date(cacheData.expires_at) > new Date()) {
      // Cache HIT
      const aggregated = SearchAggregator.aggregate(cacheData.raw_results, cacheData.channels_info);
      return InsightGenerator.generate(aggregated, query.periodDays);
    }

    // 3. Cache MISS: Busca no provedor real
    const result = await this.provider.searchCompetitors(query);
    if (!result.success) {
      throw new Error(`Falha ao buscar no provedor: ${result.reason}`);
    }

    // 4. Salva no Supabase (Cache de 2 horas para economizar cota)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 2);

    await supabase.from('competition_cache').upsert({
      cache_key: cacheKey,
      query_tags: [query.tag1, query.tag2],
      period_days: query.periodDays,
      match_mode: query.matchMode,
      language: query.language,
      platform: this.provider.name,
      expires_at: expiresAt.toISOString(),
      raw_results: result.videos,
      channels_info: result.channels,
    });

    // 5. Calcula Insights
    const aggregated = SearchAggregator.aggregate(result.videos, result.channels);
    return InsightGenerator.generate(aggregated, query.periodDays);
  }
}
