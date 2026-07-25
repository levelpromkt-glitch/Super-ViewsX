import { CompetitionProvider, CompetitionQuery, ProviderResult, RawVideoData } from '../types';

export class YoutubeCompetitionProvider implements CompetitionProvider {
  name = 'YouTube';

  private async fetchWithAuth(url: string) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new Error('YOUTUBE_API_KEY não configurada no servidor.');
    }
    const finalUrl = url.includes('?') ? `${url}&key=${apiKey}` : `${url}?key=${apiKey}`;
    const response = await fetch(finalUrl);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`YouTube API Error: ${response.status} - ${errorText}`);
    }
    return response.json();
  }

  public async searchCompetitors(query: CompetitionQuery): Promise<ProviderResult> {
    try {
      const videos: RawVideoData[] = [];
      const channelIds = new Set<string>();
      let nextPageToken = '';
      
      const maxResultsPerRequest = 50;
      const maxPages = query.maxPages || 2;
      let pagesFetched = 0;

      // Data de corte
      const publishedAfterDate = new Date();
      publishedAfterDate.setDate(publishedAfterDate.getDate() - query.periodDays);
      const publishedAfter = publishedAfterDate.toISOString();

      // Busca usando a hashtag principal (assumimos que tag1 é a principal)
      const searchQuery = encodeURIComponent(`#${query.tag1}`);

      // 1. Buscar os vídeos
      while (pagesFetched < maxPages) {
        const pageTokenParam = nextPageToken ? `&pageToken=${nextPageToken}` : '';
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${searchQuery}&order=date&publishedAfter=${publishedAfter}&maxResults=${maxResultsPerRequest}${pageTokenParam}`;
        
        const searchData = await this.fetchWithAuth(searchUrl);

        if (!searchData.items || searchData.items.length === 0) {
          break;
        }

        const videoIdsBatch: string[] = [];
        
        for (const item of searchData.items) {
          const title = item.snippet.title.toLowerCase();
          const desc = item.snippet.description.toLowerCase();
          
          const hasTag1 = title.includes(`#${query.tag1.toLowerCase()}`) || desc.includes(`#${query.tag1.toLowerCase()}`);
          const hasTag2 = title.includes(`#${query.tag2.toLowerCase()}`) || desc.includes(`#${query.tag2.toLowerCase()}`);

          let isMatch = false;
          if (query.matchMode === 'AND') {
            isMatch = hasTag1 && hasTag2;
          } else {
            isMatch = hasTag1 || hasTag2;
          }

          if (isMatch) {
            videoIdsBatch.push(item.id.videoId);
            channelIds.add(item.snippet.channelId);
          }
        }

        if (videoIdsBatch.length > 0) {
          // Busca os stats reais (views, likes, comments)
          const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIdsBatch.join(',')}`;
          const videosData = await this.fetchWithAuth(videosUrl);

          for (const v of videosData.items) {
            videos.push({
              id: v.id,
              title: v.snippet.title,
              channelId: v.snippet.channelId,
              channelTitle: v.snippet.channelTitle,
              publishedAt: v.snippet.publishedAt,
              views: parseInt(v.statistics.viewCount || '0', 10),
              likes: parseInt(v.statistics.likeCount || '0', 10),
              comments: parseInt(v.statistics.commentCount || '0', 10),
              url: `https://www.youtube.com/watch?v=${v.id}`,
              thumbnailUrl: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url || '',
            });
          }
        }

        nextPageToken = searchData.nextPageToken;
        if (!nextPageToken) {
          break;
        }

        pagesFetched++;
      }

      // 2. Buscar as fotos dos canais
      const channels: Record<string, { avatarUrl: string }> = {};
      const channelIdsArray = Array.from(channelIds);
      
      // Quebrar em lotes de 50 para os canais
      for (let i = 0; i < channelIdsArray.length; i += 50) {
        const batch = channelIdsArray.slice(i, i + 50);
        const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${batch.join(',')}`;
        const channelsData = await this.fetchWithAuth(channelsUrl);

        for (const c of channelsData.items) {
          channels[c.id] = {
            avatarUrl: c.snippet.thumbnails?.default?.url || ''
          };
        }
      }

      return {
        success: true,
        videos,
        channels
      };

    } catch (error: any) {
      console.error('[YoutubeCompetitionProvider]', error);
      return {
        success: false,
        videos: [],
        channels: {},
        reason: error.message || 'Unknown error'
      };
    }
  }
}
