import { Player } from '../types';

export class RankingCalculator {
  // Ordena a lista baseado em uma métrica (no backend, o default costuma ser totalViews)
  public static sort(players: Player[], sortBy: 'totalViews' | 'posts' | 'avgViews' | 'engagement' = 'totalViews'): Player[] {
    return players.sort((a, b) => b[sortBy] - a[sortBy]);
  }
}
