import { useEffect, useRef, useState } from "react";
import { Scissors, X } from "lucide-react";

export type Cut = { id: string; start: number; end: number };

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Marks pieces of the video to REMOVE (dimmed red zones with draggable
// edges) instead of a single keep-range — "remove a piece from the middle,"
// as many times as needed. Click "Cortar aqui" to mark a ~2s zone around the
// playhead, drag its edges to resize, or click the × to undo that cut.
export function CutTimeline({
  durationSec,
  currentTime,
  cuts,
  onSeek,
  onAddCut,
  onUpdateCut,
  onRemoveCut,
}: {
  durationSec: number;
  currentTime: number;
  cuts: Cut[];
  onSeek: (t: number) => void;
  onAddCut: () => void;
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className="tr-muted" style={{ fontSize: ".78rem" }}>Timeline</span>
        <button type="button" className="hs-btn-ghost" onClick={onAddCut}>
          <Scissors size={12} /> Cortar aqui
        </button>
      </div>
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
      <div className="ed-timeline-labels">
        <span>00:00</span>
        <span>{cuts.length > 0 ? `${cuts.length} corte${cuts.length > 1 ? "s" : ""}` : "Nenhum corte"}</span>
        <span>{formatTime(durationSec)}</span>
      </div>
    </div>
  );
}
