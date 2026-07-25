import { RawVideoData } from '../types';

export class GrowthAnalyzer {
  public static analyze(videos: RawVideoData[], periodDays: number): number[] {
    // Agrega visualizações por dia
    // Se não houver vídeos o suficiente, criamos um array de zeros e depois substituímos pelos dados reais.
    
    if (videos.length === 0) {
      return Array(Math.max(1, periodDays)).fill(0);
    }

    const viewsByDay = new Map<string, number>();
    
    for (const video of videos) {
      // Ex: "2023-10-25"
      const dateStr = video.publishedAt.split('T')[0];
      viewsByDay.set(dateStr, (viewsByDay.get(dateStr) || 0) + video.views);
    }

    // Ordena as datas do mais antigo pro mais novo para ver o "crescimento"
    const sortedDates = Array.from(viewsByDay.keys()).sort();
    
    // Extrai o array de valores
    const growth = sortedDates.map(date => viewsByDay.get(date)!);
    
    // O gráfico precisa de pelo menos 2 pontos pra renderizar bem, então ajustamos:
    if (growth.length === 1) {
      growth.unshift(0); // Coloca um zero no começo para fazer uma rampa
    }
    
    return growth;
  }
}
