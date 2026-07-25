import { MetadataProvider, TranscriptMetadata } from '../types';

export class OEmbedMetadataProvider implements MetadataProvider {
  name = 'OEmbed';

  async getMetadata(videoId: string): Promise<TranscriptMetadata> {
    try {
      const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const res = await fetch(url);
      
      if (!res.ok) {
        return {};
      }

      const data = await res.json();
      
      return {
        title: data.title || null,
        channelTitle: data.author_name || null,
        channelId: data.author_url ? data.author_url.split('/').pop() : null,
        thumbnail: data.thumbnail_url || null,
        // oEmbed do YouTube não retorna duration nem language
        duration: null,
        language: null,
        publishedAt: null,
      };
    } catch (e) {
      // Falha silenciosa para metadados, retorna tudo nulo
      return {};
    }
  }
}
