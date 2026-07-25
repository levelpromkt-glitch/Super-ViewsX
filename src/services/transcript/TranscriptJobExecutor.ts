import { supabase } from '@/lib/supabase';
import { TranscriptProvider, MetadataProvider, TranscriptLine, ProviderResult } from './types';
import { getProviderConfig } from './providerConfig';
import { shouldReplaceTranscript } from './utils';

export class TranscriptJobExecutor {
  private providers: TranscriptProvider[];
  private metadataProvider: MetadataProvider;
  private MAX_POLLING_TIME_MS = 15000;
  private POLLING_INTERVAL_MS = 1000;
  private LOCK_EXPIRATION_MINUTES = 2;

  constructor(providers: TranscriptProvider[], metadataProvider: MetadataProvider) {
    // Ordena provedores pela prioridade (maior prioridade primeiro)
    this.providers = providers.sort((a, b) => {
      const pA = getProviderConfig(a.name).priority;
      const pB = getProviderConfig(b.name).priority;
      return pB - pA;
    });
    this.metadataProvider = metadataProvider;
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private async logEvent(
    requestId: string,
    videoId: string,
    provider: string,
    status: string,
    startTime: number
  ) {
    const responseTimeMs = Math.round(performance.now() - startTime);
    await supabase.from('transcript_logs').insert({
      request_id: requestId,
      video_id: videoId,
      provider,
      status,
      response_time_ms: responseTimeMs,
    });
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getActiveLockOrCache(videoId: string) {
    const { data } = await supabase
      .from('transcripts')
      .select('*')
      .eq('videoId', videoId)
      .single();
    return data;
  }

  public async execute(videoId: string): Promise<TranscriptLine[]> {
    const requestId = this.generateRequestId();
    const globalStartTime = performance.now();

    try {
      // 1. Controle de Concorrência e Polling
      const pollingStartTime = performance.now();
      
      while (true) {
        const cache = await this.getActiveLockOrCache(videoId);
        
        if (cache) {
          if (cache.status === 'completed' && cache.lines) {
            // Cache Hit
            await supabase
              .from('transcripts')
              .update({
                hit_count: (cache.hit_count || 0) + 1,
                last_accessed_at: new Date().toISOString(),
              })
              .eq('videoId', videoId);
            
            this.logEvent(requestId, videoId, cache.provider_name || 'cache', 'CACHE_HIT', globalStartTime);
            return cache.lines as TranscriptLine[];
          }

          if (cache.status === 'processing') {
            const startedAt = new Date(cache.processing_started_at).getTime();
            const now = Date.now();
            const lockAgeMinutes = (now - startedAt) / 1000 / 60;

            if (lockAgeMinutes > this.LOCK_EXPIRATION_MINUTES) {
              // Lock órfão quebrado, podemos assumir o processamento
              break;
            } else {
              // Lock ativo, faz polling
              if (performance.now() - pollingStartTime > this.MAX_POLLING_TIME_MS) {
                throw new Error('TRANSCRIPT_PROCESSING_TIMEOUT');
              }
              await this.sleep(this.POLLING_INTERVAL_MS);
              continue;
            }
          }
        }
        
        // Se não tem cache ou o lock foi quebrado, saímos do while para processar
        break;
      }

      this.logEvent(requestId, videoId, 'system', 'CACHE_MISS', globalStartTime);

      // 2. Adquire o Lock
      await supabase.from('transcripts').upsert({
        videoId,
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      }, { onConflict: 'videoId' });

      // 3. Execução Iterativa e Retry Inteligente
      let bestResult: ProviderResult | null = null;
      let winningProvider: TranscriptProvider | null = null;

      for (const provider of this.providers) {
        const config = getProviderConfig(provider.name);
        if (!config.enabled) continue;

        const providerStartTime = performance.now();
        let result = await this.runWithTimeout(provider.getTranscript(videoId), config.timeoutMs);
        
        // Smart Retry para erros transitórios
        if (!result.success && ['network_error', 'timeout', 'provider_unavailable'].includes(result.reason)) {
          this.logEvent(requestId, videoId, provider.name, `RETRY_${result.reason}`, providerStartTime);
          const retryStartTime = performance.now();
          result = await this.runWithTimeout(provider.getTranscript(videoId), config.timeoutMs);
          this.logEvent(requestId, videoId, provider.name, result.success ? 'PROVIDER_SUCCESS' : `PROVIDER_FAILURE_${result.reason}`, retryStartTime);
        } else {
          this.logEvent(requestId, videoId, provider.name, result.success ? 'PROVIDER_SUCCESS' : `PROVIDER_FAILURE_${result.reason}`, providerStartTime);
        }

        if (result.success) {
          bestResult = result;
          winningProvider = provider;
          break; // Sucesso na maior prioridade (já estão ordenados)
        } else if (['invalid_video', 'no_captions'].includes(result.reason)) {
          // Erros definitivos param o processamento
          break;
        }
      }

      if (!bestResult || !bestResult.success || !winningProvider) {
        // Remove o lock caso tudo falhe
        await supabase.from('transcripts').delete().eq('videoId', videoId);
        throw new Error('NO_CAPTIONS');
      }

      // 4. Salva Metadados e Upsert
      const metadata = await this.metadataProvider.getMetadata(videoId);
      
      const upsertData = {
        videoId,
        title: metadata.title,
        channel: metadata.channelTitle,
        language: metadata.language,
        duration: metadata.duration,
        thumbnail: metadata.thumbnail,
        lines: bestResult.lines,
        cache_version: 1,
        provider_version: '1.0',
        provider_name: winningProvider.name,
        quality_score: bestResult.qualityScore,
        raw_response: bestResult.rawResponse,
        status: 'completed',
        cached_at: new Date().toISOString(),
      };

      // Recupera pra ver se precisamos substituir (no caso de uma corrida race condition)
      const currentCache = await this.getActiveLockOrCache(videoId);
      
      if (
        !currentCache || 
        currentCache.status !== 'completed' || 
        shouldReplaceTranscript({
          quality_score: currentCache.quality_score || 0,
          provider_name: currentCache.provider_name || '',
          provider_version: currentCache.provider_version || '1.0',
        }, bestResult, getProviderConfig(winningProvider.name).priority)
      ) {
         await supabase.from('transcripts').upsert(upsertData, { onConflict: 'videoId' });
      }

      this.logEvent(requestId, videoId, 'system', 'COMPLETED', globalStartTime);
      return bestResult.lines;

    } catch (error: any) {
      if (error.message !== 'TRANSCRIPT_PROCESSING_TIMEOUT' && error.message !== 'NO_CAPTIONS') {
         this.logEvent(requestId, videoId, 'system', 'FAILED', globalStartTime);
      }
      throw error;
    }
  }

  private runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('TIMEOUT'));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timer);
    });
  }
}
