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
    if (rawData.data && rawData.data.aweme_list) {
      rawPosts = Object.values(rawData.data.aweme_list);
    } else if (rawData.aweme_list) {
      rawPosts = Object.values(rawData.aweme_list);
    } else if (rawData.data && rawData.data.posts) {
      rawPosts = Object.values(rawData.data.posts);
    } else {
      rawPosts = rawData.posts || rawData.data || rawData.items || [];
    }

    const publishedAfterDate = new Date(publishedAfter);
    const seenIds = new Set<string>();

    let mappedVideos: ViralVideo[] = rawPosts.map((post: any) => {
      // TikTok mappings (aweme_list)
      const isTikTok = !!post.aweme_id;
      
      const views = isTikTok ? (post.statistics?.play_count || 0) : (post.video_view_count || post.play_count || 0);
      const likes = isTikTok ? (post.statistics?.digg_count || 0) : (post.like_count || 0);
      const comments = isTikTok ? (post.statistics?.comment_count || 0) : (post.comment_count || 0);
      
      const id = post.aweme_id || post.id || post.shortcode || String(Math.random());
      const author = isTikTok ? (post.author?.unique_id || post.author?.nickname) : (post.owner?.username || post.username);
      const titleDesc = post.desc || post.caption || post.text || "";
      const thumb = isTikTok ? (post.video?.cover?.url_list?.[0] || post.video?.origin_cover?.url_list?.[0]) : (post.display_url || post.thumbnail_src || post.image_url);
      const url = isTikTok ? `https://www.tiktok.com/@${author}/video/${id}` : (post.shortcode ? `https://www.instagram.com/p/${post.shortcode}/` : (post.url || ""));
      
      const publishedAt = isTikTok && post.create_time 
        ? new Date(post.create_time * 1000).toISOString()
        : (post.taken_at_timestamp ? new Date(post.taken_at_timestamp * 1000).toISOString() : (post.created_at || new Date().toISOString()));

      // Extract hashtags from description if textChallenge is missing
      const extractedHashtags = (titleDesc.match(/#[\w]+/g) || []).map((h: string) => h.replace('#', ''));
      const hashtags = Array.isArray(post.text_extra) ? post.text_extra.map((e: any) => e.hashtag_name).filter(Boolean) : extractedHashtags;
      
      return {
        id,
        title: titleDesc,
        channel: author || "",
        thumbnail: thumb || "",
        url: url,
        description: titleDesc,
        publishedAt,
        views,
        likes,
        comments,
        duration: isTikTok ? String(post.video?.duration || "") : (post.video_duration ? String(post.video_duration) : ""),
        hashtags: hashtags || [],
        platform: "tiktok",
        viralMetrics: { score: 0, reasons: [] },
      };
    });

    const validVideos = mappedVideos.filter(v => {
      if (new Date(v.publishedAt) < publishedAfterDate) return false;
      if (seenIds.has(v.id)) return false;
      
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
    // User requested sorting by views descending instead of viral score
    analyzedVideos.sort((a, b) => b.views - a.views);

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
