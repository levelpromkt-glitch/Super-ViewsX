import { YOUTUBE_CONSTANTS } from "../constants/youtube.ts";
import { validateYoutubeResponse } from "../validators/requestValidator.ts";
import { getEnv } from "../config/env.ts";

export const youtubeClient = {
  searchVideos: async (query: string, publishedAfter: string, maxResults: number) => {
    const apiKey = getEnv("YOUTUBE_API_KEY");
    const url = new URL(`${YOUTUBE_CONSTANTS.API_URL}/search`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", maxResults.toString());
    url.searchParams.set("publishedAfter", publishedAfter);
    url.searchParams.set("order", "viewCount");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();
    return validateYoutubeResponse(data, "search");
  },

  getVideosStats: async (videoIds: string[]) => {
    if (videoIds.length === 0) return { items: [] };
    
    const apiKey = getEnv("YOUTUBE_API_KEY");
    const url = new URL(`${YOUTUBE_CONSTANTS.API_URL}/videos`);
    url.searchParams.set("part", "snippet,statistics,contentDetails");
    url.searchParams.set("id", videoIds.join(","));
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();
    return validateYoutubeResponse(data, "videos");
  }
};
