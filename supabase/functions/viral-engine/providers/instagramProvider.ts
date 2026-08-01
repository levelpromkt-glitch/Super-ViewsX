import { apifyClient } from "../clients/apifyClient.ts";
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
    
    // If no cursor is provided (or it's an old Bright Data/Sociavault cursor), it's a NEW search.
    const isNewSearch = !cursor || cursor === 'page1' || cursor.startsWith("snap_") || cursor.startsWith("gd_") || cursor.startsWith("c_") || cursor.startsWith("sd_");

    if (isNewSearch) {
      logger.info(`Starting new async Apify search for hashtag: ${parsedQuery}`);
      const runId = await apifyClient.triggerInstagramHashtag(parsedQuery, maxResults || 30);
      
      return {
        videos: [],
        status: "polling",
        nextCursor: runId,
        meta: { source: "apify_async", message: "Job started" }
      };
    }

    // It's a polling request! Check the Apify run status.
    logger.info(`Polling Apify run: ${cursor}`);
    const runStatus = await apifyClient.getRunStatus(cursor);

    if (runStatus.status === "running") {
      return {
        videos: [],
        status: "polling",
        nextCursor: cursor,
        meta: { source: "apify_async", message: "Job still running" }
      };
    }

    // It's ready! Process the dataset.
    const datasetId = runStatus.defaultDatasetId;
    if (!datasetId) {
      throw new Error("Apify run succeeded but no datasetId was returned.");
    }

    logger.info(`Fetching items from Apify dataset: ${datasetId}`);
    const rawPosts = await apifyClient.getDatasetItems(datasetId);

    const publishedAfterDate = new Date(publishedAfter);
    const seenIds = new Set<string>();

    let mappedVideos: ViralVideo[] = rawPosts.map((post: any) => {
      // Apify hashtag scraper often doesn't return view counts in the grid feed, only likes.
      // If views are 0, we estimate them based on likes (typically 10x to 20x for Reels).
      let views = post.videoPlayCount || post.videoViewCount || post.playCount || post.viewCount || 0;
      const likes = post.likesCount || post.edge_media_preview_like?.count || 0;
      
      if (views === 0 && likes > 0) {
         views = likes * 15; // Conservative estimate for virality filtering
      }
      
      const comments = post.commentsCount || 0;
      
      return {
        id: post.id || post.shortCode || String(Math.random()),
        title: post.caption || post.text || "",
        channel: post.ownerUsername || post.ownerFullName || "",
        thumbnail: post.displayUrl || post.thumbnailUrl || "",
        url: post.url || (post.shortCode ? `https://www.instagram.com/p/${post.shortCode}/` : ""),
        description: post.caption || post.text || "",
        publishedAt: post.timestamp 
          ? new Date(post.timestamp).toISOString() 
          : new Date().toISOString(),
        views,
        likes,
        comments,
        duration: post.videoDuration ? String(post.videoDuration) : "",
        hashtags: post.hashtags || [],
        platform: "instagram",
        viralMetrics: { score: 0, reasons: [] },
      };
    });

    const validVideos = mappedVideos.filter(v => {
      // NOTE: Removed minViews filter for Instagram per user request.
      // if (v.views < minViews) return false;
      if (new Date(v.publishedAt) < publishedAfterDate) return false;
      if (seenIds.has(v.id)) return false;
      
      // Strict filter: only allow videos! (Images don't have videoUrl or duration)
      const rawPost = rawPosts.find((p: any) => p.id === v.id || p.shortCode === v.id);
      
      let isVideo = false;
      if (rawPost) {
        const typeStr = String(rawPost.type || "").toLowerCase();
        const pTypeStr = String(rawPost.productType || "").toLowerCase();
        
        isVideo = 
          typeStr === "video" || 
          pTypeStr === "clips" || 
          pTypeStr === "igtv" || 
          !!rawPost.videoUrl ||
          (rawPost.childPosts && Array.isArray(rawPost.childPosts) && rawPost.childPosts.some((c: any) => c.videoUrl || String(c.type).toLowerCase() === "video"));
      }
      
      if (!isVideo) return false;

      // Apify already filters by hashtag strictly since we gave it the exact URL,
      // but we keep a light filter just in case.
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
      nextCursor: undefined, 
      meta: { source: "apify_async_ready", totalExtracted: rawPosts.length, rawSample: rawPosts[0] || null }
    };
  }
};
