export interface Video {
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
