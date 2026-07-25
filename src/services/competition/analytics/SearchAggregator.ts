import { RawVideoData } from '../types';

export type AggregatedPlayer = {
  channelId: string;
  channelTitle: string;
  avatarUrl: string;
  videos: RawVideoData[];
};

export class SearchAggregator {
  public static aggregate(
    videos: RawVideoData[],
    channelsInfo: Record<string, { avatarUrl: string }>
  ): AggregatedPlayer[] {
    const map = new Map<string, AggregatedPlayer>();

    for (const video of videos) {
      if (!map.has(video.channelId)) {
        map.set(video.channelId, {
          channelId: video.channelId,
          channelTitle: video.channelTitle,
          avatarUrl: channelsInfo[video.channelId]?.avatarUrl || '',
          videos: [],
        });
      }
      map.get(video.channelId)!.videos.push(video);
    }

    return Array.from(map.values());
  }
}
