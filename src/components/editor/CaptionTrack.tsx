import type { CaptionWord } from "@/services/captionEditorService";

// The caption "layer" — one block per phrase chunk (same grouping the live
// preview and the real render use), laid out along the same time axis as the
// video track above it. Click a block to jump the preview there.
export function CaptionTrack({
  durationSec,
  chunks,
  currentTime,
  onSeek,
}: {
  durationSec: number;
  chunks: CaptionWord[][];
  currentTime: number;
  onSeek: (t: number) => void;
}) {
  const pct = (t: number) => (durationSec > 0 ? (t / durationSec) * 100 : 0);

  return (
    <div className="ed-caption-track">
      {chunks.map((chunk, i) => {
        const start = chunk[0].start;
        const end = chunk[chunk.length - 1].end;
        const active = currentTime >= start && currentTime <= end;
        const text = chunk.map((w) => w.word).join(" ");
        return (
          <button
            key={i}
            type="button"
            className={`ed-caption-block${active ? " active" : ""}`}
            style={{ left: `${pct(start)}%`, width: `${Math.max(1.2, pct(end) - pct(start))}%` }}
            onClick={() => onSeek(start)}
            title={text}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
