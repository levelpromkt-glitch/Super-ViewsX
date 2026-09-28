import type { CaptionWord } from "@/services/captionEditorService";
import type { Cut } from "./CutTimeline";

// Click a word to jump the preview there; words inside any marked cut show
// struck-through/dimmed as a preview of what will get removed.
export function WordList({
  words,
  currentTime,
  cuts,
  onSeek,
}: {
  words: CaptionWord[];
  currentTime: number;
  cuts: Cut[];
  onSeek: (t: number) => void;
}) {
  return (
    <div className="ed-words">
      {words.map((w, i) => {
        const active = currentTime >= w.start && currentTime < w.end;
        const cut = cuts.some((c) => w.start < c.end && w.end > c.start);
        return (
          <button
            key={i}
            type="button"
            className={`ed-word${active ? " active" : ""}${cut ? " cut" : ""}`}
            onClick={() => onSeek(w.start)}
          >
            {w.word}
          </button>
        );
      })}
    </div>
  );
}
