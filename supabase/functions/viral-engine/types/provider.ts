export interface ViralVideo {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
  description: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  duration: string;
  hashtags: string[];
  platform: string;
  viralMetrics: {
    score: number;
    reasons: string[];
  };
}

export interface ProviderResponse {
  videos: ViralVideo[];
  quotaUsed?: number;
  meta?: any;
  nextCursor?: string;
  status?: "polling" | "ready" | "error";
}

export interface SocialProvider {
  searchByHashtag(
    query: string,
    publishedAfter: string,
    maxResults: number,
    minViews: number,
    cursor?: string
  ): Promise<ProviderResponse>;
}
