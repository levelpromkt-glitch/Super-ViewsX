export type PostDraft = {
  id: string;
  file: File;
  previewUrl: string;
  thumbnail: string | null;
  duration: number | null;
  caption: string;
  accountIds: string[];
  mode: "now" | "schedule";
  scheduledAt: string; // datetime-local value, "" when unset
};

const pad = (n: number) => String(n).padStart(2, "0");

export function toLocalInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${pad(s)}`;
}

// Reads duration and grabs one frame client-side so each dropped video shows
// up as a real card immediately, without uploading anything first.
export function readVideoInfo(previewUrl: string): Promise<{ thumbnail: string | null; duration: number | null }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = previewUrl;

    const finish = (thumbnail: string | null, duration: number | null) => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve({ thumbnail, duration });
    };
    const timer = setTimeout(() => finish(null, null), 8000);

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
      video.currentTime = Math.min(0.5, Math.max(0, (duration ?? 1) / 2));
    };
  });
}

// Fills one date per draft, walking forward day by day through the given
// time slots ("HH:mm"). Slots already in the past today are skipped.
export function distributeDates(count: number, startDate: string, times: string[]): string[] {
  const slots = [...times].sort();
  if (slots.length === 0 || !startDate) return [];
  const today = toLocalInputValue(new Date()).slice(0, 10);
  const [y, mo, d] = (startDate < today ? today : startDate).split("-").map(Number);
  const now = Date.now();
  const result: string[] = [];
  let dayOffset = 0;
  while (result.length < count && dayOffset < 366) {
    for (const t of slots) {
      if (result.length >= count) break;
      const [hh, mm] = t.split(":").map(Number);
      const date = new Date(y, mo - 1, d + dayOffset, hh, mm);
      if (date.getTime() > now) result.push(toLocalInputValue(date));
    }
    dayOffset++;
  }
  return result;
}
