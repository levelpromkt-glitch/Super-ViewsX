import type { RefObject } from "react";
import type { CaptionWord } from "@/services/captionEditorService";

// Mirrors caption-editor/templates/karaoke-yellow/index.html's buildCaptions()
// grouping exactly, so what's previewed here in the browser matches what the
// Modal renderer actually burns into the final video.
const MAX_CHUNK_WORDS = 6;
const MAX_GAP_SECONDS = 0.6;

export function groupIntoChunks(words: CaptionWord[]): CaptionWord[][] {
  const chunks: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  for (const w of words) {
    if (current.length === 0) {
      current.push(w);
      continue;
    }
    const prev = current[current.length - 1];
    if (w.start - prev.end > MAX_GAP_SECONDS || current.length >= MAX_CHUNK_WORDS) {
      chunks.push(current);
      current = [w];
    } else {
      current.push(w);
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function CaptionPreview({
  videoUrl,
  chunks,
  currentTime,
  accentColor,
  onTimeUpdate,
  videoRef,
}: {
  videoUrl: string;
  chunks: CaptionWord[][];
  currentTime: number;
  accentColor: string;
  onTimeUpdate: (t: number) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const activeChunk = chunks.find(
    (c) => currentTime >= c[0].start - 0.02 && currentTime <= c[c.length - 1].end + 0.05
  );

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000" }}>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        style={{ width: "100%", maxHeight: 420, display: "block" }}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
      />
      {activeChunk && (
        <div className="ed-caption-overlay">
          <div className="ed-caption-line">
            {activeChunk.map((w, i) => (
              <span
                key={i}
                className="ed-caption-word"
                style={{ color: currentTime >= w.start && currentTime < w.end ? accentColor : "#fff" }}
              >
                {w.word}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
