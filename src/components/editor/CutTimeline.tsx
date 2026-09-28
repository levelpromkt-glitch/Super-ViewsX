import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export type Cut = { id: string; start: number; end: number };

export function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// The video track: marks pieces to REMOVE (dimmed red zones with draggable
// edges) instead of a single keep-range — "remove a piece from the middle,"
// as many times as needed. Drag a cut's edges to resize it, or click its ×
// to undo it. Pure track — no header/toolbar; the parent lays those out
// alongside the other tracks (caption, ruler) in the shared timeline panel.
export function CutTimeline({
  durationSec,
  currentTime,
  cuts,
  onSeek,
  onUpdateCut,
  onRemoveCut,
}: {
  durationSec: number;
  currentTime: number;
  cuts: Cut[];
  onSeek: (t: number) => void;
  onUpdateCut: (id: string, start: number, end: number) => void;
  onRemoveCut: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ id: string; edge: "start" | "end" } | "playhead" | null>(null);

  const timeFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * durationSec;
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const t = timeFromClientX(e.clientX);
      if (dragging === "playhead") {
        onSeek(t);
        return;
      }
      const cut = cuts.find((c) => c.id === dragging.id);
      if (!cut) return;
      if (dragging.edge === "start") onUpdateCut(cut.id, Math.min(t, cut.end - 0.2), cut.end);
      else onUpdateCut(cut.id, cut.start, Math.max(t, cut.start + 0.2));
    };
    const handleUp = () => setDragging(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, cuts, durationSec]);

  const pct = (t: number) => (durationSec > 0 ? (t / durationSec) * 100 : 0);

  return (
    <div
      className="ed-timeline-track"
      ref={trackRef}
      onMouseDown={(e) => {
        if (dragging) return;
        onSeek(timeFromClientX(e.clientX));
      }}
    >
      {cuts.map((cut) => (
        <div key={cut.id}>
          <div
            className="ed-timeline-cut-zone"
            style={{ left: `${pct(cut.start)}%`, width: `${Math.max(0, pct(cut.end) - pct(cut.start))}%` }}
          />
          <button
            type="button"
            className="ed-timeline-cut-remove"
            style={{ left: `${pct((cut.start + cut.end) / 2)}%` }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveCut(cut.id);
            }}
            title="Desfazer este corte"
          >
            <X size={10} />
          </button>
          <div
            className="ed-timeline-handle cut"
            style={{ left: `${pct(cut.start)}%` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragging({ id: cut.id, edge: "start" });
            }}
          />
          <div
            className="ed-timeline-handle cut"
            style={{ left: `${pct(cut.end)}%` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragging({ id: cut.id, edge: "end" });
            }}
          />
        </div>
      ))}
      <div className="ed-timeline-playhead" style={{ left: `${pct(currentTime)}%` }} />
    </div>
  );
}
