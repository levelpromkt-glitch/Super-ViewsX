import { youtubeClient } from "../clients/youtubeClient.ts";
import { processRawVideos } from "../processors/dataProcessor.ts";
import { mapToVideo } from "../mappers/videoMapper.ts";
import { analyzeViralPotential } from "../analyzers/viralAnalyzer.ts";
import { YOUTUBE_CONSTANTS } from "../constants/youtube.ts";

export const youtubeService = {
  searchVideos: async (parsedQuery: string, publishedAfter: string, maxResults: number, minViews: number) => {
    // 1. Fetch Search Results
    const searchData = await youtubeClient.searchVideos(parsedQuery, publishedAfter, maxResults);
    
    const videoIds = (searchData.items || [])
      .map((item: any) => item.id?.videoId)
      .filter(Boolean);

    if (videoIds.length === 0) {
      return { videos: [], quotaUsed: YOUTUBE_CONSTANTS.QUOTA_SEARCH };
    }

    // 2. Fetch Detailed Stats
    const statsData = await youtubeClient.getVideosStats(videoIds);
    const rawVideos = statsData.items || [];
    const quotaUsed = YOUTUBE_CONSTANTS.QUOTA_SEARCH + YOUTUBE_CONSTANTS.QUOTA_VIDEO;

    // 3. Pipeline
    const processedRaw = processRawVideos(rawVideos);
    let mappedVideos = processedRaw.map(mapToVideo);
    
    if (minViews > 0) {
      mappedVideos = mappedVideos.filter(v => v.views >= minViews);
    }

    const analyzedVideos = mappedVideos.map(analyzeViralPotential);
    analyzedVideos.sort((a, b) => b.viralMetrics.score - a.viralMetrics.score);

    return {
      videos: analyzedVideos,
      quotaUsed,
    };
  }
};
