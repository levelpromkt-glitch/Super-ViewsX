import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Film, Loader2, Upload, X } from "lucide-react";

function formatSize(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatLength(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Reads the duration and grabs a frame straight from the chosen file, so the
// card can confirm "yes, this is the right video" without uploading anything.
function useVideoInfo(file: File | null) {
  const [info, setInfo] = useState<{ thumbnail: string | null; duration: number | null }>({ thumbnail: null, duration: null });

  useEffect(() => {
    setInfo({ thumbnail: null, duration: null });
    if (!file) return;

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
      setInfo({ thumbnail, duration });
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    const timer = setTimeout(() => finish(null, null), 10000);

    video.onerror = () => {
      clearTimeout(timer);
      finish(null, null);
    };
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      video.onseeked = () => {
        clearTimeout(timer);
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

    return () => {
      clearTimeout(timer);
      done = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return info;
}

// Progress card shown while a source is being processed: the file name (or link),
// what is happening right now and a bar. `percent` null = no real percentage
// (transcription/analysis have no measurable progress), so the bar just animates.
export function SourceProgress({
  title,
  status,
  percent,
  thumbnail,
}: {
  title: string;
  status: string;
  percent: number | null;
  thumbnail?: string | null;
}) {
  return (
    <div className="mm-progress" role="status" aria-live="polite">
      <div className="mm-progress-top">
        {thumbnail ? <img className="mm-progress-thumb" src={thumbnail} alt="" /> : <Loader2 size={18} className="tr-spin mm-progress-spin" />}
        <span className="mm-progress-title" title={title}>
          {title}
        </span>
        {percent !== null && <span className="mm-progress-pct">{percent}%</span>}
      </div>
      <div className="mm-progress-bar" data-indeterminate={percent === null}>
        <span style={percent !== null ? { width: `${percent}%` } : undefined} />
      </div>
      <span className="mm-progress-status">{status}</span>
    </div>
  );
}

export function VideoPicker({
  file,
  onPick,
  onRemove,
  hint,
  disabled,
  progress,
}: {
  file: File | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  hint?: string;
  disabled?: boolean;
  // While set, the picked file is being processed: show the progress card instead of the actions.
  progress?: { status: string; percent: number | null } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { thumbnail, duration } = useVideoInfo(file);

  return (
    <div className="mm-picker">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onPick(picked);
          e.target.value = "";
        }}
      />

      {!file ? (
        <button type="button" className="mm-pick-empty" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Upload size={20} className="mm-pick-icon" />
          <span className="mm-pick-text">
            <strong>Clique ou arraste um arquivo</strong>
            <span className="mm-muted">{hint}</span>
          </span>
        </button>
      ) : progress ? (
        <SourceProgress title={file.name} status={progress.status} percent={progress.percent} thumbnail={thumbnail} />
      ) : (
        <div className="mm-file-card">
          <div className="mm-file-thumb">
            {thumbnail ? <img src={thumbnail} alt="" /> : <Film size={22} />}
            {duration !== null && <span className="mm-file-dur">{formatLength(duration)}</span>}
          </div>
          <div className="mm-file-info">
            <span className="mm-file-ok">
              <CheckCircle2 size={13} /> Vídeo selecionado
            </span>
            <span className="mm-file-name" title={file.name}>
              {file.name}
            </span>
            <span className="mm-muted">
              {formatSize(file.size)}
              {duration !== null ? ` · ${formatLength(duration)}` : ""}
            </span>
          </div>
          <div className="mm-file-actions">
            <button type="button" className="hs-btn-ghost" onClick={() => inputRef.current?.click()}>
              <Upload size={12} /> Trocar
            </button>
            <button type="button" className="hs-btn-ghost" onClick={onRemove} aria-label="Remover vídeo">
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
