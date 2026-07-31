import { AppError } from "../utils/errorHandler.ts";
import { YOUTUBE_CONSTANTS } from "../constants/youtube.ts";

export const validateSearchRequest = (body: any) => {
  if (!body || typeof body !== 'object') {
    throw new AppError("Invalid request body.", "INVALID_BODY", 400);
  }
  if (!body.query || typeof body.query !== "string") {
    throw new AppError("A valid query is required.", "INVALID_QUERY", 400);
  }
  
  const maxResults = body.maxResults ? parseInt(body.maxResults) : YOUTUBE_CONSTANTS.DEFAULT_MAX_RESULTS;
  if (maxResults > YOUTUBE_CONSTANTS.MAX_RESULTS_LIMIT) {
    throw new AppError(`Max results cannot exceed ${YOUTUBE_CONSTANTS.MAX_RESULTS_LIMIT}.`, "INVALID_MAX_RESULTS", 400);
  }
  
  const platform = body.platform || "youtube";
  
  return {
    query: body.query,
    period: body.period || "7d",
    minViews: body.minViews ? parseInt(body.minViews) : 0,
    maxResults,
    platform,
  };
};

export const validateYoutubeResponse = (data: any, endpoint: string) => {
  if (data.error) {
    if (data.error.errors && data.error.errors[0]?.reason === 'quotaExceeded') {
      throw new AppError("YouTube API quota exceeded.", "QUOTA_EXCEEDED", 429);
    }
    throw new AppError(data.error.message || `YouTube API error on ${endpoint}`, "YOUTUBE_API_ERROR", 502);
  }
  if (!data.items) {
    throw new AppError(`Invalid response format from YouTube on ${endpoint}.`, "INVALID_YOUTUBE_RESPONSE", 502);
  }
  return data;
};
