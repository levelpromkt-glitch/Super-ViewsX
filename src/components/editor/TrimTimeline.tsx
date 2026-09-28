import { useEffect, useRef, useState } from "react";

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// A simple trim bar: click/drag anywhere to scrub, drag the two green handles
// to set the in/out points that will actually be cut on render. The native
// <video> element's own controls still handle play/pause/volume — this is
// only for scrubbing and trimming, not a full transport replacement.
export function TrimTimeline({
  durationSec,
  currentTime,
  trimStart,
  trimEnd,
  onSeek,
  onTrimChange,
}: {
  durationSec: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  onSeek: (t: number) => void;
  onTrimChange: (start: number, end: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | "playhead" | null>(null);

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
      if (dragging === "start") onTrimChange(Math.min(t, trimEnd - 0.2), trimEnd);
      else if (dragging === "end") onTrimChange(trimStart, Math.max(t, trimStart + 0.2));
      else onSeek(t);
    };
    const handleUp = () => setDragging(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, trimStart, trimEnd, durationSec]);

  const pct = (t: number) => (durationSec > 0 ? (t / durationSec) * 100 : 0);

  return (
    <div>
      <div
        className="ed-timeline-track"
        ref={trackRef}
        onMouseDown={(e) => {
          if (dragging) return;
          onSeek(timeFromClientX(e.clientX));
        }}
      >
        <div className="ed-timeline-dim" style={{ left: 0, width: `${pct(trimStart)}%` }} />
        <div className="ed-timeline-dim" style={{ left: `${pct(trimEnd)}%`, width: `${100 - pct(trimEnd)}%` }} />
        <div
          className="ed-timeline-trim"
          style={{ left: `${pct(trimStart)}%`, width: `${Math.max(0, pct(trimEnd) - pct(trimStart))}%` }}
        />
        <div
          className="ed-timeline-handle"
          style={{ left: `${pct(trimStart)}%` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDragging("start");
          }}
        />
        <div
          className="ed-timeline-handle"
          style={{ left: `${pct(trimEnd)}%` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDragging("end");
          }}
        />
        <div className="ed-timeline-playhead" style={{ left: `${pct(currentTime)}%` }} />
      </div>
      <div className="ed-timeline-labels">
        <span>{formatTime(trimStart)}</span>
        <span>{formatTime(Math.max(0, trimEnd - trimStart))} selecionado</span>
        <span>{formatTime(trimEnd)}</span>
      </div>
    </div>
  );
}
