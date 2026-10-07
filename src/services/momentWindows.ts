import type { ProjectTranscript } from "./momentProjectsService";

// Pure helpers of the moment search (no network), kept apart so they can be tested on their own.

export const WINDOW_SEC = 600;
export const OVERLAP_SEC = 90;
export const SINGLE_WINDOW_MAX_SEC = 900; // up to 15 min: one call
export const MIN_LAST_WINDOW_SEC = 150; // a shorter tail is absorbed by the previous window

export type Range = { start: number; end: number };
export type Win = { start: number; end: number; lines: ProjectTranscript["lines"]; words?: [string, number, number][] };

// Share of the shorter of the two ranges that both cover (0 to 1).
export const overlapRatio = (a: Range, b: Range) =>
  Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) / Math.max(1, Math.min(a.end - a.start, b.end - b.start));

// Keeps the highest-scored of any two moments that share more than `limit` of the shorter one.
export function dedupeByOverlap<T extends Range & { score: number }>(list: T[], limit = 0.5): T[] {
  const out: T[] = [];
  for (const m of [...list].sort((a, b) => b.score - a.score)) {
    if (!out.some((u) => overlapRatio(u, m) > limit)) out.push(m);
  }
  return out;
}

// ~10 minute windows with some overlap; a short video is a single window.
export function buildWindows(transcript: ProjectTranscript): Win[] {
  const { lines, words } = transcript;
  if (lines.length === 0) return [];
  const total = Math.max(...lines.map((l) => l.start + l.duration));
  if (total <= SINGLE_WINDOW_MAX_SEC) return [{ start: 0, end: total, lines, words }];

  const stride = WINDOW_SEC - OVERLAP_SEC;
  const windows: Win[] = [];
  for (let s = 0; s < total; s += stride) {
    let e = Math.min(total, s + WINDOW_SEC);
    if (total - e < MIN_LAST_WINDOW_SEC) e = total;
    const sub = lines.filter((l) => l.start + l.duration > s && l.start < e);
    if (sub.length > 0) {
      const subStart = sub[0].start;
      const subEnd = sub[sub.length - 1].start + sub[sub.length - 1].duration;
      windows.push({
        start: s,
        end: e,
        lines: sub,
        words: words?.filter((w) => w[2] >= subStart - 1 && w[1] <= subEnd + 1),
      });
    }
    if (e >= total) break;
  }
  return windows;
}
