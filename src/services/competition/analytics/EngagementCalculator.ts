import { AggregatedPlayer } from './SearchAggregator';
import { RawVideoData } from '../types';

export class EngagementCalculator {
  public static calculate(videos: RawVideoData[]): number {
    let totalViews = 0;
    let totalEngagements = 0;

    for (const video of videos) {
      totalViews += video.views;
      totalEngagements += video.likes + video.comments;
    }

    if (totalViews === 0) return 0;
    
    // Calcula em % (ex: 12.5 para 12.5%)
    const rawRatio = (totalEngagements / totalViews) * 100;
    
    // Arredonda para 1 casa decimal
    return Math.round(rawRatio * 10) / 10;
  }
}
