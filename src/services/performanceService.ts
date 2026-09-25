import { supabase } from "@/lib/supabase";
import { readEdgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

export type PerformanceTopClip = {
  platform: string;
  accountLabel: string;
  title: string;
  views: number;
  url: string | null;
  publishedAt: string;
};

export type PerformanceSeriesPoint = { date: string; views: number };

export type PerformanceOverview = {
  totalViews: number;
  postsCount: number;
  accountsCount: number;
  series: PerformanceSeriesPoint[];
  topClip: PerformanceTopClip | null;
  accountErrors: Array<{ accountId: string; platform: string; label: string; message: string }>;
};

export class PerformanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PerformanceError";
  }
}

export const PerformanceService = {
  async getOverview(): Promise<PerformanceOverview> {
    const { data, error } = await supabase.functions.invoke("social-performance", { body: {} });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao carregar desempenho.");
      throw new PerformanceError(message);
    }
    if (!data?.success) {
      throw new PerformanceError(data?.message || "Erro ao carregar desempenho.");
    }
    return data as PerformanceOverview;
  },
};
