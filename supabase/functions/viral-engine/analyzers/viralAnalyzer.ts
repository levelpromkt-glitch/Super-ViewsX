import { ViralVideo } from "../types/provider.ts";

export const analyzeViralPotential = (video: ViralVideo): ViralVideo => {
  let score = 0;
  const reasons: string[] = [];
  
  if (video.views > 100000) {
    score += 40;
    reasons.push("Alto volume de visualizações (>100k)");
  } else if (video.views > 10000) {
    score += 20;
    reasons.push("Bom volume de visualizações (>10k)");
  }

  if (video.views > 0) {
    const engagement = (video.likes / video.views) * 100;
    if (engagement > 5) {
      score += 30;
      reasons.push("Taxa de curtidas excelente (>5%)");
    } else if (engagement > 2) {
      score += 15;
      reasons.push("Boa taxa de curtidas");
    }
  }

  const hoursSincePublished = (new Date().getTime() - new Date(video.publishedAt).getTime()) / (1000 * 60 * 60);
  if (hoursSincePublished < 48) {
    score += 30;
    reasons.push("Publicado muito recentemente (<48h)");
  } else if (hoursSincePublished < 24 * 7) {
    score += 10;
    reasons.push("Publicado na última semana");
  }

  score = Math.min(score, 99);

  return {
    ...video,
    viralMetrics: {
      score,
      reasons,
    }
  };
};
