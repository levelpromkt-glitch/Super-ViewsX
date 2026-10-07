import type { TranscriptLine } from "@/services/transcript/types";
import type { DurationPreset, NarrativeProfile, ViralMoment } from "@/services/viralMomentsService";

export const DURATIONS: { id: DurationPreset; label: string }[] = [
  { id: "auto", label: "Automático (a IA decide)" },
  { id: "10-30", label: "10s a 30s (competição)" },
  { id: "30-60", label: "30s a 1 minuto" },
  { id: "60-120", label: "1 a 2 minutos" },
  { id: "120-180", label: "2 a 3 minutos" },
];

export const durationLabel = (id: string) => DURATIONS.find((d) => d.id === id)?.label ?? id;
// Without the parenthesis: "Automático", "10s a 30s"
export const shortDurationLabel = (id: string) => durationLabel(id).replace(/ \(.*\)$/, "");

export const SCORE_FILTERS: { value: number; label: string }[] = [
  { value: 0, label: "Todos" },
  { value: 70, label: "70+ viral" },
  { value: 85, label: "85+ altamente viral" },
];

export const PROFILE_LABELS: Record<NarrativeProfile, string> = {
  fast_answer: "Resposta rápida",
  contrarian: "Contraintuitivo",
  money: "Dinheiro",
  story: "História",
  humor: "Humor",
  transformation: "Transformação",
};

export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => ["embed", "shorts", "live"].includes(p));
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch {
    return null;
  }
  return null;
}

export function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function formatDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// 1:05:30 / 30:19 — length of a whole video.
export function formatVideoLength(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function slugifyFilename(text: string) {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return slug || "corte";
}

// Parses a pasted transcript where a timestamp sits alone on its own line
// (mm:ss or hh:mm:ss) followed by one or more lines of text, e.g. the format
// youtubetotranscript.com and similar tools export with "Timestamp ON".
// Lets the user skip the Deepgram call entirely when they already have this.
export function parsePastedTranscript(raw: string): TranscriptLine[] {
  const TS_RE = /^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?$/;
  const rawLines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  type Entry = { seconds: number; text: string[] };
  const entries: Entry[] = [];
  let current: Entry | null = null;

  for (const line of rawLines) {
    const match = line.match(TS_RE);
    if (match) {
      const seconds = match[3] !== undefined
        ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
        : Number(match[1]) * 60 + Number(match[2]);
      current = { seconds, text: [] };
      entries.push(current);
    } else if (current) {
      current.text.push(line);
    }
  }

  return entries
    .map((entry, i) => {
      const start = entry.seconds;
      const nextStart = entries[i + 1]?.seconds ?? start + 3;
      const duration = Math.max(1, nextStart - start);
      const mm = String(Math.floor(start / 60)).padStart(2, "0");
      const ss = String(start % 60).padStart(2, "0");
      return { time: `${mm}:${ss}`, seconds: start, text: entry.text.join(" ").trim(), start, duration };
    })
    .filter((l) => l.text.length > 0);
}

// Reads the duration and grabs a frame straight from a picked file (client-side),
// so the project gets a cover and a length without any server round trip.
export function readVideoInfo(file: File): Promise<{ thumbnail: string | null; duration: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    let done = false;
    const finish = (thumbnail: string | null, duration: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve({ thumbnail, duration });
    };
    const timer = setTimeout(() => finish(null, null), 10000);

    video.onerror = () => finish(null, null);
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = Math.round(320 * ((video.videoHeight || 9) / (video.videoWidth || 16)));
          canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL("image/jpeg", 0.7), duration);
        } catch {
          finish(null, duration);
        }
      };
      video.currentTime = Math.min(1, Math.max(0, (duration ?? 2) / 2));
    };
  });
}

// Grabs one frame per moment directly from the uploaded video file (client-side,
// via a hidden <video>+<canvas>) so upload-mode cards get a real thumbnail.
// Seeks are sequential because a single <video> element can only be at one
// currentTime at a time.
export async function generateMomentThumbnails(
  momentsList: ViralMoment[],
  videoUrl: string
): Promise<Record<string, string>> {
  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Falha ao carregar o vídeo para gerar capas."));
  });

  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = Math.round(320 * ((video.videoHeight || 9) / (video.videoWidth || 16)));
  const ctx = canvas.getContext("2d");
  if (!ctx) return {};

  const thumbnails: Record<string, string> = {};
  for (const m of momentsList) {
    const seekTime = Math.min(m.start, Math.max(0, video.duration - 0.1));
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = seekTime;
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    thumbnails[m.id] = canvas.toDataURL("image/jpeg", 0.6);
  }
  return thumbnails;
}

export const STAGE_LABELS: Record<string, string> = {
  uploading: "Enviando",
  transcribing: "Transcrevendo",
  finding: "Procurando momentos",
  ready: "Pronto",
  failed: "Falhou",
};

export const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
