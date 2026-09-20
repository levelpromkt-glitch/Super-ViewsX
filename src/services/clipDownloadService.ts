import { supabase } from "@/lib/supabase";
import { readEdgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

export class ClipDownloadError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ClipDownloadError";
  }
}

export const ClipDownloadService = {
  async downloadClip(videoId: string, start: number, end: number, filename: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke("clip-video", {
      body: { videoId, start, end },
    });

    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao gerar o corte.");
      throw new ClipDownloadError(message, "FUNCTION_ERROR");
    }

    // On failure the function returns a JSON error body instead of a video blob.
    if (!(data instanceof Blob) || data.type.includes("json")) {
      let message = "Não foi possível gerar o corte do vídeo.";
      try {
        const text = data instanceof Blob ? await data.text() : JSON.stringify(data);
        const parsed = JSON.parse(text);
        if (parsed?.message) message = parsed.message;
      } catch {
        // keep default message
      }
      throw new ClipDownloadError(message, "CLIP_FAILED");
    }

    const objectUrl = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  },
};
