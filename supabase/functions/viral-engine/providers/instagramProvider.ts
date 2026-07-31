import { brightDataClient } from "../clients/brightDataClient.ts";
import { SocialProvider, ProviderResponse, ViralVideo } from "../types/provider.ts";
import { analyzeViralPotential } from "../analyzers/viralAnalyzer.ts";
import { logger } from "../utils/logger.ts";

const TARGET_VALID_VIDEOS = 50;
const MAX_PAGES_TO_FETCH = 5;

export const instagramProvider: SocialProvider = {
  searchByHashtag: async (
    parsedQuery: string,
    publishedAfter: string,
    maxResults: number,
    minViews: number,
    cursor?: string
  ): Promise<ProviderResponse> => {
    
    let allValidVideos: ViralVideo[] = [];
    let currentCursor = cursor;
    let pagesFetched = 0;
    let hasMore = true;
    const seenIds = new Set<string>();

    const publishedAfterDate = new Date(publishedAfter);

    while (allValidVideos.length < TARGET_VALID_VIDEOS && pagesFetched < MAX_PAGES_TO_FETCH && hasMore) {
      logger.info(`Fetching Instagram page ${pagesFetched + 1} with cursor ${currentCursor || 'none'}`);
      
      const rawData = await brightDataClient.fetchInstagramHashtag(parsedQuery, 100, currentCursor);
      pagesFetched++;

      let rawPosts: any[] = [];
      // Bright Data might return an array directly, or { results: [] }, or [ { results: [] } ]
      if (Array.isArray(rawData)) {
        if (rawData.length > 0 && rawData[0].results) {
          rawPosts = rawData[0].results;
        } else if (rawData.length > 0 && rawData[0].posts) {
          rawPosts = rawData[0].posts;
        } else {
          rawPosts = rawData;
        }
      } else if (rawData.data && rawData.data.posts) {
        rawPosts = Object.values(rawData.data.posts);
      } else {
        rawPosts = rawData.posts || rawData.data || rawData.items || rawData.results || [];
      }

      // Pagination check
      if (rawData.data && rawData.data.cursor) {
        currentCursor = String(rawData.data.cursor);
      } else {
        hasMore = false;
        currentCursor = undefined;
      }

      let mappedVideos: ViralVideo[] = rawPosts.map((post: any) => {
        const views = post.video_view_count || post.play_count || post.view_count || post.views || 0;
        const likes = post.like_count || post.likes || 0;
        const comments = post.comment_count || post.comments || 0;
        
        return {
          id: post.id || post.shortcode || post.post_id,
          title: post.caption || post.text || post.description || "",
          channel: post.owner?.username || post.username || post.author_username || "",
          thumbnail: post.display_url || post.thumbnail_src || post.image_url || post.image || post.thumbnail || "",
          url: post.shortcode ? `https://www.instagram.com/p/${post.shortcode}/` : (post.url || post.link || ""),
          description: post.caption || post.text || post.description || "",
          publishedAt: post.taken_at_timestamp 
            ? new Date(post.taken_at_timestamp * 1000).toISOString() 
            : (post.created_at || post.posted_at || post.timestamp || new Date().toISOString()),
          views,
          likes,
          comments,
          duration: post.video_duration ? String(post.video_duration) : "",
          hashtags: post.hashtags || [],
          platform: "instagram",
          viralMetrics: { score: 0, reasons: [] },
        };
      });

      // Filter by minViews, publishedAfter, and deduplicate
      const validVideos = mappedVideos.filter(v => {
        if (v.views < minViews) return false;
        if (new Date(v.publishedAt) < publishedAfterDate) return false;
        if (seenIds.has(v.id)) return false;
        return true;
      });

      validVideos.forEach(v => seenIds.add(v.id));
      allValidVideos = [...allValidVideos, ...validVideos];

      if (rawPosts.length === 0) {
        hasMore = false; // No more posts returned
      }
    }

    // Analyze Viral Potential
    const analyzedVideos = allValidVideos.map(analyzeViralPotential);
    analyzedVideos.sort((a, b) => b.viralMetrics.score - a.viralMetrics.score);

    // Limit to exactly maxResults if requested (we might have overfetched)
    if (analyzedVideos.length > maxResults) {
       analyzedVideos.length = maxResults;
    }

    return {
      videos: analyzedVideos,
      nextCursor: currentCursor,
      meta: { source: "instagram", pagesFetched }
    };
  }
};
