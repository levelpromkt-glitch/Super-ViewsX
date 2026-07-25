export type MatchMode = 'AND' | 'OR';

export type CompetitionQuery = {
  tag1: string;
  tag2: string;
  periodDays: number;
  matchMode: MatchMode;
  maxPages: number;
  language?: string;
};

export type RawVideoData = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string; // ISO String
  views: number;
  likes: number;
  comments: number;
  url: string;
  thumbnailUrl: string;
};

export type ProviderResult = {
  success: boolean;
  videos: RawVideoData[];
  channels: Record<string, { avatarUrl: string }>;
  reason?: string;
};

export interface CompetitionProvider {
  name: string;
  searchCompetitors(query: CompetitionQuery): Promise<ProviderResult>;
}

export type TopVideo = {
  title: string;
  views: number;
  likes: number;
  comments: number;
  daysAgo: number;
  postedAt: string; // "14h30"
  thumbUrl?: string; // from thumbnailUrl
  thumbHue?: number; // fallback
  url: string;
};

export type Player = {
  id: string;
  name: string;
  avatarUrl?: string; // from channel avatar
  avatarHue?: number; // fallback
  totalViews: number;
  posts: number;
  avgViews: number;
  engagement: number;
  bestViews: number;
  postsPerDay: number;
  topHours: string[];
  bestHour: string;
  lastVideoAgo: string;
  topVideos: TopVideo[];
  growth: number[];
};
