import { supabase } from "@/lib/supabase";
import { readEdgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

export type CaptionWord = { word: string; start: number; end: number };

export type BrandKit = {
  accent_color: string;
  logo_r2_key: string | null;
  default_template: string;
};

export class CaptionEditorError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "CaptionEditorError";
  }
}

export const CaptionEditorService = {
  // Transcribes an already-resolved video URL (e.g. a clip clip-video just
  // cut and uploaded to R2) and returns word-level timings for the karaoke
  // captions, alongside the same line-level shape used elsewhere.
  async transcribeSourceUrl(sourceUrl: string): Promise<{ words: CaptionWord[]; videoDurationSec: number }> {
    const { data, error } = await supabase.functions.invoke("transcribe-upload", {
      body: { sourceUrl },
    });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao transcrever o vídeo.");
      throw new CaptionEditorError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new CaptionEditorError(data?.message || "Erro ao transcrever o vídeo.", data?.code || "UNKNOWN_ERROR");
    }
    return { words: (data.words || []) as CaptionWord[], videoDurationSec: data.videoDurationSec || 0 };
  },

  async startRender(params: {
    sourceVideoUrl: string;
    words: CaptionWord[];
    durationSec: number;
    accentColor?: string;
    logoUrl?: string;
    template?: string;
  }): Promise<string> {
    const { data, error } = await supabase.functions.invoke("caption-render-start", { body: params });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao iniciar a renderização.");
      throw new CaptionEditorError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new CaptionEditorError(data?.message || "Erro ao iniciar a renderização.", data?.code || "UNKNOWN_ERROR");
    }
    return data.jobId as string;
  },

  // Polls our own caption_jobs row — the VM finishes the job in the
  // background (checks Modal, copies the result into R2) independently of
  // whether anyone is watching.
  async pollRenderJob(jobId: string, onTick?: (elapsedMs: number) => void): Promise<string> {
    const intervalMs = 4000;
    const timeoutMs = 10 * 60 * 1000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const { data, error } = await supabase
        .from("caption_jobs")
        .select("status, result, error_message")
        .eq("id", jobId)
        .single();
      if (error) throw new CaptionEditorError(error.message, "QUERY_FAILED");

      if (data.status === "completed") return data.result?.downloadUrl as string;
      if (data.status === "failed") throw new CaptionEditorError(data.error_message || "Falha ao renderizar o vídeo.", "JOB_FAILED");

      onTick?.(Date.now() - start);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new CaptionEditorError("A renderização demorou demais. Tente novamente.", "TIMEOUT");
  },

  async getBrandKit(): Promise<BrandKit | null> {
    const { data, error } = await supabase.from("brand_kits").select("*").maybeSingle();
    if (error) throw new CaptionEditorError(error.message, "QUERY_FAILED");
    return data as BrandKit | null;
  },

  async saveBrandKit(kit: BrandKit): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new CaptionEditorError("Sessão inválida.", "UNAUTHENTICATED");
    const { error } = await supabase.from("brand_kits").upsert({ user_id: user.id, ...kit, updated_at: new Date().toISOString() });
    if (error) throw new CaptionEditorError(error.message, "SAVE_FAILED");
  },
};
