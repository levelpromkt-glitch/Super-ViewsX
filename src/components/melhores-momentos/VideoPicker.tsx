import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Film, Upload, X } from "lucide-react";

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

export function VideoPicker({
  file,
  onPick,
  onRemove,
  hint,
}: {
  file: File | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  hint: string;
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
        <>
          <button type="button" className="mm-pick-empty" onClick={() => inputRef.current?.click()}>
            <Upload size={18} className="tr-icon-lime" />
            <span>
              <strong>Escolher vídeo</strong>
              <span className="mm-muted"> do seu computador</span>
            </span>
          </button>
          <span className="mm-hint">{hint}</span>
        </>
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
