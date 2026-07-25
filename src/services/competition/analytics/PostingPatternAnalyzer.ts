import { RawVideoData } from '../types';

export class PostingPatternAnalyzer {
  public static analyze(videos: RawVideoData[], periodDays: number) {
    const posts = videos.length;
    const effectiveDays = Math.max(1, periodDays);
    const postsPerDay = Math.round((posts / effectiveDays) * 10) / 10;

    const hourCounts = new Map<number, number>();
    let mostRecentDate = new Date(0);

    for (const video of videos) {
      const date = new Date(video.publishedAt);
      if (date > mostRecentDate) {
        mostRecentDate = date;
      }
      const hour = date.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }

    // Sort hours by count descending
    const sortedHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    // Format top 3 hours (e.g. "18h", "19h")
    const topHours = sortedHours.slice(0, 3).map(h => `${h}h`);
    const bestHour = topHours.length > 0 ? topHours[0] : 'N/A';

    let lastVideoAgo = 'N/A';
    if (mostRecentDate.getTime() > 0) {
      const hoursAgo = Math.floor((Date.now() - mostRecentDate.getTime()) / (1000 * 60 * 60));
      if (hoursAgo < 24) {
        lastVideoAgo = `há ${hoursAgo}h`;
      } else {
        const daysAgo = Math.floor(hoursAgo / 24);
        lastVideoAgo = `há ${daysAgo}d`;
      }
    }

    return {
      postsPerDay,
      topHours,
      bestHour,
      lastVideoAgo,
    };
  }
}
