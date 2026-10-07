import { useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowRight, ChevronDown, Link2, Loader2, Upload, X } from "lucide-react";
import { MAX_SOURCE_VIDEO_BYTES } from "@/services/postsService";
import type { DurationPreset } from "@/services/viralMomentsService";
import { VideoPicker } from "./VideoPicker";
import { DURATIONS, extractYouTubeId } from "./momentUtils";

type SourceMode = "youtube" | "upload";

// Top of the Melhores Momentos home: a link or a file, plus the clip length.
// Starting hands over to the parent, which opens the project page right away.
export function NewProjectHero({
  onStartUpload,
  onStartYoutube,
}: {
  onStartUpload: (file: File, duration: DurationPreset, pastedTranscript: string) => Promise<void>;
  onStartYoutube: (url: string, duration: DurationPreset) => Promise<void>;
}) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("youtube");
  const [url, setUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [duration, setDuration] = useState<DurationPreset>("30-60");
  const [durationOpen, setDurationOpen] = useState(false);
  const durationRef = useRef<HTMLDivElement>(null);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    if (!durationOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (durationRef.current && !durationRef.current.contains(e.target as Node)) setDurationOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [durationOpen]);

  const currentDurationLabel = DURATIONS.find((d) => d.id === duration)?.label ?? "";
  const maxGb = Math.round(MAX_SOURCE_VIDEO_BYTES / (1024 * 1024 * 1024));

  const handleStart = async () => {
    if (starting) return;
    setError(null);

    if (sourceMode === "youtube") {
      if (!url.trim()) return;
      if (!extractYouTubeId(url)) {
        setError("URL inválida. Cole um link do YouTube (ex.: https://youtube.com/watch?v=...).");
        return;
      }
    } else {
      if (!uploadFile) return;
      if (uploadFile.size > MAX_SOURCE_VIDEO_BYTES) {
        setError(`O vídeo excede o limite de ${maxGb}GB.`);
        return;
      }
    }

    setStarting(true);
    try {
      if (sourceMode === "youtube") await onStartYoutube(url, duration);
      else if (uploadFile) await onStartUpload(uploadFile, duration, pastedTranscript);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível iniciar a análise.");
    } finally {
      setStarting(false);
    }
  };

  // Dropping a video anywhere on the hero attaches it. dragCounterRef tracks nested
  // enter/leave pairs (every child element fires its own dragenter/dragleave) so the
  // highlight doesn't flicker off while the pointer is still over a child.
  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current += 1;
    setIsDraggingFile(true);
  };
  const handleDragOver = (e: DragEvent) => e.preventDefault();
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDraggingFile(false);
  };
  const pickFile = (file: File) => {
    setSourceMode("upload");
    setUrl("");
    setUploadFile(file);
    setError(null);
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);
    const file = Array.from(e.dataTransfer.files || []).find((f) => f.type.startsWith("video/"));
    if (!file) {
      setError("Solte um arquivo de vídeo (MP4, MOV, etc).");
      return;
    }
    pickFile(file);
  };

  return (
    <section
      className={`mm-hero${isDraggingFile ? " tr-dropzone-active" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFile && (
        <div className="tr-dropzone-overlay">
          <Upload size={18} /> Solte o vídeo aqui
        </div>
      )}
      <h1 className="mm-hero-title">Cole o link. A IA acha os cortes virais.</h1>
      <p className="mm-hero-sub">
        Cole um link do YouTube ou envie o vídeo do seu computador. A gente transcreve, procura os trechos com maior potencial e entrega os cortes prontos.
      </p>

      <div className="mm-pill" data-disabled={sourceMode === "upload" || starting}>
        <Link2 size={18} className="mm-pill-icon" />
        <input
          className="mm-pill-input"
          type="url"
          placeholder={sourceMode === "upload" ? "Vídeo do computador selecionado" : "Cole um link do YouTube"}
          value={url}
          disabled={sourceMode === "upload" || starting}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleStart()}
        />
        <div className="hs-period" ref={durationRef}>
          <button
            type="button"
            className="hs-period-btn"
            data-open={durationOpen}
            disabled={starting}
            onClick={() => setDurationOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={durationOpen}
          >
            {currentDurationLabel}
            <ChevronDown size={14} className="hs-period-caret" />
          </button>
          {durationOpen && (
            <div className="hs-period-menu" role="listbox">
              {DURATIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="option"
                  aria-selected={duration === d.id}
                  data-active={duration === d.id}
                  className="hs-period-item"
                  onClick={() => {
                    setDuration(d.id);
                    setDurationOpen(false);
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="btn-primary mm-pill-btn"
          onClick={handleStart}
          disabled={starting || (sourceMode === "youtube" ? !url.trim() : !uploadFile)}
        >
          {starting ? (
            <>
              <Loader2 size={16} className="tr-spin" /> Abrindo
            </>
          ) : (
            <>
              Encontrar momentos <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>

      {(sourceMode === "upload" || !url.trim()) && (
        <VideoPicker
          file={uploadFile}
          onPick={pickFile}
          onRemove={() => {
            setSourceMode("youtube");
            setUploadFile(null);
            setPastedTranscript("");
          }}
          disabled={starting}
          hint={`MP4, MOV, WEBM, MKV ou AVI. Máximo ${maxGb}GB`}
        />
      )}

      {sourceMode === "upload" && uploadFile && (
        <details className="mm-transcript">
          <summary>Já tem a transcrição com timestamp? (opcional)</summary>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 6px" }}>
            <input
              type="file"
              accept=".txt,text/plain"
              id="transcript-txt-input"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPastedTranscript(await file.text());
                e.target.value = "";
              }}
            />
            <label htmlFor="transcript-txt-input" className="hs-btn-ghost" style={{ flex: "none", cursor: "pointer" }}>
              <Upload size={12} /> Anexar arquivo .txt
            </label>
            {pastedTranscript.trim() && (
              <button type="button" className="hs-btn-ghost" style={{ flex: "none" }} onClick={() => setPastedTranscript("")}>
                <X size={12} /> Limpar
              </button>
            )}
          </div>
          <textarea
            className="tr-input"
            style={{ width: "100%", minHeight: 90, resize: "vertical", fontFamily: "inherit", fontSize: ".8rem" }}
            placeholder={"Cole aqui no formato:\n00:00\ntexto da fala\n00:03\ntexto da fala..."}
            value={pastedTranscript}
            onChange={(e) => setPastedTranscript(e.target.value)}
          />
          <span style={{ fontSize: ".75rem", color: "var(--text-muted)" }}>
            {pastedTranscript.trim()
              ? "Vamos usar essa transcrição e pular a transcrição automática."
              : "Deixe em branco para transcrever automaticamente."}
          </span>
        </details>
      )}

      {error && <div className="tr-error mm-error">{error}</div>}
      <p className="mm-foot">
        Use apenas vídeos que você criou ou tem permissão para usar. Evite copiar conteúdos de outros criadores e respeite as diretrizes das plataformas.
      </p>
    </section>
  );
}
