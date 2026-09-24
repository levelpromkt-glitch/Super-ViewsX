import { supabase } from "@/lib/supabase";

export class ClipDownloadError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ClipDownloadError";
  }
}

export type ClipSource = { videoId: string } | { storagePath: string } | { r2Key: string };

export const ClipDownloadService = {
  async downloadClip(
    source: ClipSource,
    start: number,
    end: number,
    filename: string,
    vertical = false,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token || anonKey;

    // The VM cuts the clip and uploads it straight to Cloudflare R2, handing
    // back a signed URL instead of the file bytes — the Edge Function only
    // ever sees a small JSON payload here, never the video itself. This lets
    // the browser download the final file directly from R2's network instead
    // of relaying it through the VM's own (bandwidth-limited) connection.
    const response = await fetch(`${supabaseUrl}/functions/v1/clip-video`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": anonKey,
        "authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ ...source, start, end, vertical }),
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      // keep payload null, handled below
    }

    if (!response.ok || !payload?.success || !payload?.downloadUrl) {
      throw new ClipDownloadError(payload?.message || "Não foi possível gerar o corte do vídeo.", payload?.code || "CLIP_FAILED");
    }

    const fileResponse = await fetch(payload.downloadUrl);
    if (!fileResponse.ok || !fileResponse.body) {
      throw new ClipDownloadError("Não foi possível baixar o corte gerado.", "DOWNLOAD_FAILED");
    }

    const totalBytes = Number(fileResponse.headers.get("content-length")) || 0;
    const reader = fileResponse.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (totalBytes > 0) onProgress?.(Math.min(100, Math.round((received / totalBytes) * 100)));
    }
    onProgress?.(100);

    const blob = new Blob(chunks as BlobPart[], { type: "video/mp4" });
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
