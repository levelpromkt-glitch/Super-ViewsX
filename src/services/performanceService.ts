import { supabase } from "@/lib/supabase";
import { readEdgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

export type PerformancePeriod = "24h" | "48h" | "72h" | "7d" | "30d";

export type PerformanceTopClip = {
  platform: string;
  title: string;
  views: number;
  url: string | null;
  publishedAt: string;
};

export type PerformanceSeriesPoint = {
  bucket: string;
  views: number;
  posts: number;
  tiktok: number;
  youtube: number;
  instagram: number;
};

export type PerformancePost = {
  platform: string;
  accountLabel: string;
  title: string;
  views: number;
  url: string | null;
  publishedAt: string;
};

export type PerformanceAccountBreakdown = {
  accountId: string;
  label: string;
  platform: string;
  views: number;
  posts: number;
};

export type PerformanceAccountOption = {
  id: string;
  label: string;
  platform: string;
  platformLabel: string;
};

export type PerformanceOverview = {
  period: PerformancePeriod;
  accountId: string; // 'all' or a specific account id
  totalViews: number;
  postsCount: number;
  topClip: PerformanceTopClip | null;
  posts: PerformancePost[];
  series: PerformanceSeriesPoint[];
  byAccount: PerformanceAccountBreakdown[];
  accounts: PerformanceAccountOption[];
};

export class PerformanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PerformanceError";
  }
}

export const PerformanceService = {
  async getOverview(period: PerformancePeriod, accountId: string): Promise<PerformanceOverview> {
    const { data, error } = await supabase.functions.invoke("social-performance", { body: { period, accountId } });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao carregar desempenho.");
      throw new PerformanceError(message);
    }
    if (!data?.success) {
      throw new PerformanceError(data?.message || "Erro ao carregar desempenho.");
    }
    return data as PerformanceOverview;
  },

  // Triggers a fresh pull from TikTok/YouTube/Instagram for just this user's
  // accounts. The page itself never calls this on load — it always reads the
  // cached table (getOverview above), which is what keeps it fast.
  async syncNow(): Promise<void> {
    const { data, error } = await supabase.functions.invoke("social-performance-sync", { body: {} });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao atualizar desempenho.");
      throw new PerformanceError(message);
    }
    if (!data?.success) {
      throw new PerformanceError(data?.message || "Erro ao atualizar desempenho.");
    }
  },
};
