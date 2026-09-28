import type { CaptionWord } from "@/services/captionEditorService";

// Click a word to jump the preview there; words outside the current trim
// range show struck-through/dimmed as a preview of what will get cut.
export function WordList({
  words,
  currentTime,
  trimStart,
  trimEnd,
  onSeek,
}: {
  words: CaptionWord[];
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  onSeek: (t: number) => void;
}) {
  return (
    <div className="ed-words">
      {words.map((w, i) => {
        const active = currentTime >= w.start && currentTime < w.end;
        const cut = w.start < trimStart || w.end > trimEnd;
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
