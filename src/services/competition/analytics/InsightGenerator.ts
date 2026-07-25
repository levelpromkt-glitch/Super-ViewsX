import { AggregatedPlayer } from './SearchAggregator';
import { Player, TopVideo } from '../types';
import { EngagementCalculator } from './EngagementCalculator';
import { PostingPatternAnalyzer } from './PostingPatternAnalyzer';
import { GrowthAnalyzer } from './GrowthAnalyzer';
import { RankingCalculator } from './RankingCalculator';

export class InsightGenerator {
  public static generate(
    aggregated: AggregatedPlayer[],
    periodDays: number
  ): Player[] {
    const players: Player[] = aggregated.map(agg => {
      // Ordena vídeos deste canal por views desc para pegar top 5
      const sortedVideos = [...agg.videos].sort((a, b) => b.views - a.views);
      
      let totalViews = 0;
      let bestViews = 0;
      for (const v of agg.videos) {
        totalViews += v.views;
        if (v.views > bestViews) bestViews = v.views;
      }
      
      const posts = agg.videos.length;
      const avgViews = posts > 0 ? Math.round(totalViews / posts) : 0;
      
      const engagement = EngagementCalculator.calculate(agg.videos);
      const pattern = PostingPatternAnalyzer.analyze(agg.videos, periodDays);
      const growth = GrowthAnalyzer.analyze(agg.videos, periodDays);

      const topVideos: TopVideo[] = sortedVideos.slice(0, 5).map(v => {
        const daysAgo = Math.max(0, Math.floor((Date.now() - new Date(v.publishedAt).getTime()) / (1000 * 60 * 60 * 24)));
        const date = new Date(v.publishedAt);
        const postedAt = `${date.getHours()}h${String(date.getMinutes()).padStart(2, '0')}`;
        
        return {
          title: v.title,
          views: v.views,
          likes: v.likes,
          comments: v.comments,
          daysAgo: daysAgo === 0 ? 1 : daysAgo,
          postedAt,
          thumbUrl: v.thumbnailUrl,
          url: v.url
        };
      });

      return {
        id: agg.channelId,
        name: agg.channelTitle,
        avatarUrl: agg.avatarUrl,
        totalViews,
        posts,
        avgViews,
        engagement,
        bestViews,
        postsPerDay: pattern.postsPerDay,
        topHours: pattern.topHours,
        bestHour: pattern.bestHour,
        lastVideoAgo: pattern.lastVideoAgo,
        topVideos,
        growth
      };
    });

    return RankingCalculator.sort(players, 'totalViews');
  }
}
