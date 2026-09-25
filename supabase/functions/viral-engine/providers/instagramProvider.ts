import { apifyClient } from "../clients/apifyClient.ts";
import { SocialProvider, ProviderResponse, ViralVideo } from "../types/provider.ts";
import { analyzeViralPotential } from "../analyzers/viralAnalyzer.ts";
import { logger } from "../utils/logger.ts";

// Apify's actor runs are async: trigger -> poll -> read dataset. We reuse the
// existing "cursor" field as the Apify runId so the frontend's existing
// polling loop (already built for exactly this shape, see dashboard.hashtag.tsx)
// works without any changes on that side.
export const instagramProvider: SocialProvider = {
  searchByHashtag: async (
    parsedQuery: string,
    publishedAfter: string,
    maxResults: number,
    minViews: number,
    cursor?: string
  ): Promise<ProviderResponse> => {
    // No runId yet -> start a new Apify run and report back "polling".
    if (!cursor) {
      logger.info(`Triggering Apify run for Instagram hashtag: ${parsedQuery}`);
      const runId = await apifyClient.triggerInstagramHashtag(parsedQuery, maxResults || 30);
      return { videos: [], status: "polling", nextCursor: runId };
    }

    // We have a runId -> check if it's done yet.
    const runStatus = await apifyClient.getRunStatus(cursor);
    if (runStatus.status === "running") {
      return { videos: [], status: "polling", nextCursor: cursor };
    }

    const items = await apifyClient.getDatasetItems(runStatus.defaultDatasetId!);
    const publishedAfterDate = new Date(publishedAfter);

    let mappedVideos: ViralVideo[] = items.map((post: any) => {
      const id = post.id || post.shortCode || String(Math.random());
      const author = post.ownerUsername || post.ownerFullName || "";
      const titleDesc = post.caption || "";
      const thumb = post.displayUrl || post.thumbnailSrc || "";
      const url = post.url || (post.shortCode ? `https://www.instagram.com/p/${post.shortCode}/` : "");
      const publishedAt = post.timestamp ? new Date(post.timestamp).toISOString() : new Date().toISOString();
      const hashtags = (titleDesc.match(/#[\w]+/g) || []).map((h: string) => h.replace('#', ''));

      return {
        id,
        title: titleDesc,
        channel: author,
        thumbnail: thumb,
        url,
        description: titleDesc,
        publishedAt,
        views: post.videoViewCount || post.videoPlayCount || 0,
        likes: post.likesCount || 0,
        comments: post.commentsCount || 0,
        duration: post.videoDuration ? String(post.videoDuration) : "",
        hashtags,
        platform: "instagram",
        viralMetrics: { score: 0, reasons: [] },
      };
    });

    const validVideos = mappedVideos.filter(v => new Date(v.publishedAt) >= publishedAfterDate && v.views >= minViews);
    const analyzedVideos = validVideos.map(analyzeViralPotential);
    analyzedVideos.sort((a, b) => b.views - a.views);
    if (analyzedVideos.length > maxResults) analyzedVideos.length = maxResults;

    return {
      videos: analyzedVideos,
      status: "ready",
      nextCursor: undefined,
      meta: { source: "apify", totalExtracted: items.length, debug_first_item: items[0] || null },
    };
  }
};
