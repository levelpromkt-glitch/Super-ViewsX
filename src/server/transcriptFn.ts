import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { YoutubeTranscript } from "youtube-transcript";

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export const fetchYoutubeTranscriptFn = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(async ({ data: videoId }) => {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      
      const lines = transcript.map((t) => ({
        time: formatTime(t.offset / 1000),
        seconds: Math.floor(t.offset / 1000),
        text: t.text,
        start: t.offset / 1000,
        duration: t.duration / 1000,
      }));
      
      return { success: true, lines };
    } catch (error: any) {
      const msg = error.message || "";
      if (msg.includes("Transcript is disabled") || msg.includes("No transcripts")) {
        return { success: false, error: "Legendas desativadas ou indisponíveis para este vídeo", code: "NO_CAPTIONS" };
      }
      return { success: false, error: "Erro ao acessar o YouTube", code: "SERVER_ERROR" };
    }
  });
