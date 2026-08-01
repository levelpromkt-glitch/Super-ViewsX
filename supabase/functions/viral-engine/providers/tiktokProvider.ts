import { sociaVaultClient } from "../clients/sociaVaultClient.ts";
import { SocialProvider, ProviderResponse, ViralVideo } from "../types/provider.ts";
import { analyzeViralPotential } from "../analyzers/viralAnalyzer.ts";
import { logger } from "../utils/logger.ts";

export const tiktokProvider: SocialProvider = {
  searchByHashtag: async (
    parsedQuery: string,
    publishedAfter: string,
    maxResults: number,
    minViews: number,
    cursor?: string
  ): Promise<ProviderResponse> => {
    logger.info(`Starting Social Vault search for hashtag on TikTok: ${parsedQuery}`);
    
    const rawData = await sociaVaultClient.fetchInstagramHashtag(parsedQuery, maxResults || 50);
    
    let rawPosts: any[] = [];
    if (rawData.data && rawData.data.posts) {
      rawPosts = Object.values(rawData.data.posts);
    } else {
      rawPosts = rawData.posts || rawData.data || rawData.items || [];
    }

    const publishedAfterDate = new Date(publishedAfter);
    const seenIds = new Set<string>();

    let mappedVideos: ViralVideo[] = rawPosts.map((post: any) => {
      const views = post.video_view_count || post.play_count || 0;
      const likes = post.like_count || 0;
      const comments = post.comment_count || 0;
      
      return {
        id: post.id || post.shortcode || String(Math.random()),
        title: post.caption || post.text || "",
        channel: post.owner?.username || post.username || "",
        thumbnail: post.display_url || post.thumbnail_src || post.image_url || "",
        url: post.shortcode ? `https://www.instagram.com/p/${post.shortcode}/` : (post.url || ""),
        description: post.caption || post.text || "",
        publishedAt: post.taken_at_timestamp 
          ? new Date(post.taken_at_timestamp * 1000).toISOString() 
          : (post.created_at || new Date().toISOString()),
        views,
        likes,
        comments,
        duration: post.video_duration ? String(post.video_duration) : "",
        hashtags: post.hashtags || [],
        platform: "tiktok",
        viralMetrics: { score: 0, reasons: [] },
      };
    });

    const validVideos = mappedVideos.filter(v => {
      // NOTE: Removed minViews filter for Instagram per user request.
      // if (v.views < minViews) return false;
      if (new Date(v.publishedAt) < publishedAfterDate) return false;
      if (seenIds.has(v.id)) return false;
      
      // Strict filter: only allow videos!
      const rawPost = rawPosts.find((p: any) => p.id === v.id || p.shortcode === v.id);
      let isVideo = false;
      if (rawPost) {
        const isVideoFlag = rawPost.is_video === true;
        const typeStr = String(rawPost.type || "").toLowerCase();
        const pTypeStr = String(rawPost.product_type || "").toLowerCase();
        
        isVideo = 
          isVideoFlag ||
          typeStr === "video" || 
          pTypeStr === "clips" || 
          pTypeStr === "igtv" || 
          !!rawPost.video_url || 
          !!rawPost.video_view_count;
      }
      
      if (!isVideo) return false;

      // Strict hashtag filter: Social Vault API might return unrelated trending posts
      const lowerQuery = parsedQuery.toLowerCase();
      const hasHashtag = 
        (v.description && v.description.toLowerCase().includes(lowerQuery)) ||
        (v.hashtags && v.hashtags.some((h: string) => h.toLowerCase().includes(lowerQuery)));

      if (!hasHashtag) return false;

      seenIds.add(v.id);
      return true;
    });

    const analyzedVideos = validVideos.map(analyzeViralPotential);
    analyzedVideos.sort((a, b) => b.viralMetrics.score - a.viralMetrics.score);

    if (analyzedVideos.length > maxResults) {
       analyzedVideos.length = maxResults;
    }

    return {
      videos: analyzedVideos,
      status: "ready",
      nextCursor: undefined, 
      meta: { source: "socialvault", totalExtracted: rawPosts.length, debug_first_item: rawPosts[0] || null }
    };
  }
};
