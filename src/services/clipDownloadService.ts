import { supabase } from "@/lib/supabase";

export class ClipDownloadError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ClipDownloadError";
  }
}

export type ClipSource = { videoId: string } | { storagePath: string } | { r2Key: string };

export const ClipDownloadService = {
  async downloadClip(source: ClipSource, start: number, end: number, filename: string, vertical = false): Promise<void> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token || anonKey;

    // supabase-js's functions.invoke() decides how to parse the response body
    // from its content-type, which is unreliable for a binary video/mp4
    // response — it's not guaranteed to hand back a Blob. Fetch directly so
    // we control exactly how the response is read.
    const response = await fetch(`${supabaseUrl}/functions/v1/clip-video`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": anonKey,
        "authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ ...source, start, end, vertical }),
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || contentType.includes("json")) {
      let message = "Não foi possível gerar o corte do vídeo.";
      try {
        const parsed = await response.json();
        if (parsed?.message) message = parsed.message;
      } catch {
        // keep default message
      }
      throw new ClipDownloadError(message, "CLIP_FAILED");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  },
};
