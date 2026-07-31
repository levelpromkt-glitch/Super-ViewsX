import { ViralVideo } from "../types/provider.ts";

export const mapToVideo = (processedRawVideo: any): ViralVideo => {
  const snippet = processedRawVideo.snippet || {};
  const stats = processedRawVideo.statistics || {};
  const contentDetails = processedRawVideo.contentDetails || {};

  // Find best thumbnail
  const thumbnails = snippet.thumbnails || {};
  const bestThumbnail = thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || "";

  return {
    id: processedRawVideo.id,
    title: snippet.title || "",
    channel: snippet.channelTitle || "",
    thumbnail: bestThumbnail,
    url: `https://www.youtube.com/watch?v=${processedRawVideo.id}`,
    description: snippet.description || "",
    publishedAt: snippet.publishedAt || "",
    views: stats.viewCount ? parseInt(stats.viewCount) : 0,
    likes: stats.likeCount ? parseInt(stats.likeCount) : 0,
    comments: stats.commentCount ? parseInt(stats.commentCount) : 0,
    duration: contentDetails.duration || "",
    hashtags: processedRawVideo.extractedHashtags || [],
    platform: "youtube",
    viralMetrics: { score: 0, reasons: [] },
  };
};
