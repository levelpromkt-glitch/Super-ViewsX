import { brightDataClient } from "../clients/brightDataClient.ts";
import { SocialProvider, ProviderResponse, ViralVideo } from "../types/provider.ts";
import { analyzeViralPotential } from "../analyzers/viralAnalyzer.ts";
import { logger } from "../utils/logger.ts";

export const instagramProvider: SocialProvider = {
  searchByHashtag: async (
    parsedQuery: string,
    publishedAfter: string,
    maxResults: number,
    minViews: number,
    cursor?: string
  ): Promise<ProviderResponse> => {
    
    // If no cursor is provided (or it's an old numeric cursor), it's a NEW search.
    // We trigger the async scraper.
    const isNewSearch = !cursor || (cursor.length < 10 && !cursor.startsWith("c_") && !cursor.startsWith("snap_") && !cursor.startsWith("gd_") && !cursor.startsWith("j_"));

    if (isNewSearch) {
      logger.info(`Starting new async Bright Data search for hashtag: ${parsedQuery}`);
      const snapshotId = await brightDataClient.triggerInstagramHashtag(parsedQuery, maxResults || 30);
      
      return {
        videos: [],
        status: "polling",
        nextCursor: snapshotId,
        meta: { source: "instagram_async", message: "Job started" }
      };
    }

    // It's a polling request! Check the snapshot.
    logger.info(`Polling Bright Data snapshot: ${cursor}`);
    const snapshotResult = await brightDataClient.getSnapshot(cursor);

    if (snapshotResult.status === "running") {
      return {
        videos: [],
        status: "polling",
        nextCursor: cursor,
        meta: { source: "instagram_async", message: "Job still running" }
      };
    }

    // It's ready! Process the data.
    const rawData = snapshotResult.data;
    let rawPosts: any[] = [];
    
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

    const publishedAfterDate = new Date(publishedAfter);
    const seenIds = new Set<string>();

    let mappedVideos: ViralVideo[] = rawPosts.map((post: any) => {
      const views = post.video_view_count || post.play_count || post.view_count || post.views || 0;
      const likes = post.like_count || post.likes || 0;
      const comments = post.comment_count || post.comments || 0;
      
      return {
        id: post.id || post.shortcode || post.post_id || String(Math.random()),
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

    const validVideos = mappedVideos.filter(v => {
      if (v.views < minViews) return false;
      if (new Date(v.publishedAt) < publishedAfterDate) return false;
      if (seenIds.has(v.id)) return false;
      seenIds.add(v.id);
      return true;
    });

    // Analyze Viral Potential
    const analyzedVideos = validVideos.map(analyzeViralPotential);
    analyzedVideos.sort((a, b) => b.viralMetrics.score - a.viralMetrics.score);

    if (analyzedVideos.length > maxResults) {
       analyzedVideos.length = maxResults;
    }

    return {
      videos: analyzedVideos,
      status: "ready",
      // Since discover_by_url only fetches the page once, we won't paginate further.
      nextCursor: undefined, 
      meta: { source: "instagram_async_ready", totalExtracted: rawPosts.length }
    };
  }
};
