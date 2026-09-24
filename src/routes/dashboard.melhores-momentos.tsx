import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Flame,
  Link2,
  Loader2,
  Play,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/melhores-momentos")({
  component: MelhoresMomentosPage,
});

import { TranscriptService, TranscriptError } from "@/services/transcriptService";
import type { TranscriptLine } from "@/services/transcript/types";
import { ViralMomentsService, ViralMomentsError, ViralMoment, DurationPreset, NarrativeProfile } from "@/services/viralMomentsService";
import { ClipDownloadService, ClipDownloadError, ClipSource } from "@/services/clipDownloadService";
import { SocialAccountsService, SocialAccountsError } from "@/services/socialAccountsService";
import { MAX_SOURCE_VIDEO_BYTES } from "@/services/postsService";

const DURATIONS: { id: DurationPreset; label: string }[] = [
  { id: "10-30", label: "10s a 30s (competição)" },
  { id: "30-60", label: "30s a 1 minuto" },
  { id: "60-120", label: "1 a 2 minutos" },
  { id: "120-180", label: "2 a 3 minutos" },
];

const PROFILE_LABELS: Record<NarrativeProfile, string> = {
  fast_answer: "Resposta rápida",
  contrarian: "Contraintuitivo",
  money: "Dinheiro",
  story: "História",
  humor: "Humor",
  transformation: "Transformação",
};

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => ["embed", "shorts", "live"].includes(p));
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch {
    return null;
  }
  return null;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// Parses a pasted transcript where a timestamp sits alone on its own line
// (mm:ss or hh:mm:ss) followed by one or more lines of text, e.g. the format
// youtubetotranscript.com and similar tools export with "Timestamp ON".
// Lets the user skip the Deepgram call entirely when they already have this.
function parsePastedTranscript(raw: string): TranscriptLine[] {
  const TS_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
  const rawLines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  type Entry = { seconds: number; text: string[] };
  const entries: Entry[] = [];
  let current: Entry | null = null;

  for (const line of rawLines) {
    const match = line.match(TS_RE);
    if (match) {
      const seconds = match[3] !== undefined
        ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
        : Number(match[1]) * 60 + Number(match[2]);
      current = { seconds, text: [] };
      entries.push(current);
    } else if (current) {
      current.text.push(line);
    }
  }

  return entries
    .map((entry, i) => {
      const start = entry.seconds;
      const nextStart = entries[i + 1]?.seconds ?? start + 3;
      const duration = Math.max(1, nextStart - start);
      const mm = String(Math.floor(start / 60)).padStart(2, "0");
      const ss = String(start % 60).padStart(2, "0");
      return { time: `${mm}:${ss}`, seconds: start, text: entry.text.join(" ").trim(), start, duration };
    })
    .filter((l) => l.text.length > 0);
}

function slugifyFilename(text: string) {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return slug || "corte";
}

type SourceMode = "youtube" | "upload";

function MelhoresMomentosPage() {
  const [sourceMode, setSourceMode] = useState<SourceMode>("youtube");
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const uploadObjectUrl = useMemo(() => (uploadFile ? URL.createObjectURL(uploadFile) : null), [uploadFile]);
  useEffect(() => {
    return () => { if (uploadObjectUrl) URL.revokeObjectURL(uploadObjectUrl); };
  }, [uploadObjectUrl]);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [moments, setMoments] = useState<ViralMoment[] | null>(null);
  const [videoTopic, setVideoTopic] = useState<string | null>(null);
  const [activeMoment, setActiveMoment] = useState<ViralMoment | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [duration, setDuration] = useState<DurationPreset>("30-60");
  const [durationOpen, setDurationOpen] = useState(false);
  const durationRef = useRef<HTMLDivElement>(null);

  // Per-card choices: which of the 3 headlines is selected, and whether to
  // use the AI's more aggressive hook-cut opening instead of the natural start.
  const [selectedTitle, setSelectedTitle] = useState<Record<string, number>>({});
  const [useHook, setUseHook] = useState<Record<string, boolean>>({});

  const getEffectiveStart = (m: ViralMoment) => (useHook[m.id] && m.hookStart !== undefined ? m.hookStart : m.start);
  const getEffectiveTitle = (m: ViralMoment) => m.titles[selectedTitle[m.id] ?? 0] ?? m.title;

  const [tiktokConnected, setTiktokConnected] = useState<boolean | null>(null);
  const [publishTarget, setPublishTarget] = useState<ViralMoment | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    SocialAccountsService.listConnected()
      .then((accounts) => setTiktokConnected(accounts.some((a) => a.platform === "tiktok")))
      .catch(() => setTiktokConnected(false));
  }, []);

  useEffect(() => {
    if (!durationOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (durationRef.current && !durationRef.current.contains(e.target as Node)) setDurationOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [durationOpen]);

  const currentDurationLabel = DURATIONS.find((d) => d.id === duration)?.label ?? "";

  const handleAnalyzeYoutube = async () => {
    const id = extractYouTubeId(url);
    if (!url.trim()) {
      setUrlError("Por favor, insira uma URL do YouTube.");
      return;
    }
    if (!id) {
      setUrlError("URL inválida. Cole um link do YouTube (ex.: https://youtube.com/watch?v=...).");
      return;
    }

    setUrlError(null);
    setVideoId(id);
    setStoragePath(null);
    setMoments(null);
    setVideoTopic(null);
    setActiveMoment(null);
    setSelectedTitle({});
    setUseHook({});
    setLoading(true);
    setLoadingStatus("Transcrevendo o vídeo...");

    try {
      const transcript = await TranscriptService.getTranscript(id);
      setLoadingStatus("Analisando os melhores momentos com IA...");
      const result = await ViralMomentsService.findBestMoments(id, "", transcript.lines, duration);
      setMoments(result.moments);
      setVideoTopic(result.videoTopic || null);
    } catch (error: any) {
      if (error instanceof TranscriptError) {
        setUrlError(error.message);
      } else if (error instanceof ViralMomentsError) {
        setUrlError(error.message);
      } else {
        setUrlError("Ocorreu um erro inesperado ao analisar o vídeo.");
      }
      setVideoId(null);
    } finally {
      setLoading(false);
      setLoadingStatus("");
    }
  };

  const handleAnalyzeUpload = async () => {
    if (!uploadFile) {
      setUrlError("Escolha um vídeo do seu computador.");
      return;
    }
    if (uploadFile.size > MAX_SOURCE_VIDEO_BYTES) {
      setUrlError(`O vídeo excede o limite de ${Math.round(MAX_SOURCE_VIDEO_BYTES / (1024 * 1024 * 1024))}GB.`);
      return;
    }

    setUrlError(null);
    setVideoId(null);
    setStoragePath(null);
    setMoments(null);
    setVideoTopic(null);
    setActiveMoment(null);
    setSelectedTitle({});
    setUseHook({});
    setLoading(true);
    setLoadingStatus("Enviando vídeo...");

    try {
      const key = await ViralMomentsService.uploadSourceVideoToR2(uploadFile);
      setStoragePath(key);

      const manualLines = parsePastedTranscript(pastedTranscript);
      let lines: TranscriptLine[];
      if (manualLines.length > 0) {
        lines = manualLines;
      } else {
        setLoadingStatus("Na fila de transcrição...");
        const jobId = await ViralMomentsService.enqueueTranscriptionJob(key);
        const transcript = await ViralMomentsService.pollTranscriptionJob(jobId, (elapsedMs) => {
          const mins = Math.floor(elapsedMs / 60000);
          setLoadingStatus(
            mins > 0
              ? `Transcrevendo o áudio do vídeo... (${mins} min — vídeos longos demoram mais)`
              : "Transcrevendo o áudio do vídeo..."
          );
        });
        lines = transcript.lines;
      }

      setLoadingStatus("Analisando os melhores momentos com IA...");
      const result = await ViralMomentsService.findBestMoments(key, "", lines, duration);
      setMoments(result.moments);
      setVideoTopic(result.videoTopic || null);
    } catch (error: any) {
      if (error instanceof ViralMomentsError) {
        setUrlError(error.message);
      } else {
        setUrlError("Ocorreu um erro inesperado ao analisar o vídeo.");
      }
      setStoragePath(null);
    } finally {
      setLoading(false);
      setLoadingStatus("");
    }
  };

  const handleAnalyze = () => (sourceMode === "youtube" ? handleAnalyzeYoutube() : handleAnalyzeUpload());

  const clipSource: ClipSource | null = videoId ? { videoId } : storagePath ? { r2Key: storagePath } : null;

  const handleDownload = async (m: ViralMoment, vertical = false) => {
    if (!clipSource) return;
    setDownloadError(null);
    setDownloadingId(vertical ? `${m.id}-vertical` : m.id);
    try {
      const start = getEffectiveStart(m);
      const suffix = vertical ? "-vertical" : "";
      const filename = `${slugifyFilename(getEffectiveTitle(m))}${suffix}.mp4`;
      await ClipDownloadService.downloadClip(clipSource, start, m.end, filename, vertical);
    } catch (error: any) {
      setDownloadError(
        error instanceof ClipDownloadError ? error.message : "Erro inesperado ao baixar o corte."
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenPublish = (m: ViralMoment) => {
    setPublishError(null);
    setPublishTarget(m);
    setCaptionDraft(getEffectiveTitle(m));
  };

  const handleConfirmPublish = async () => {
    if (!videoId || !publishTarget) return;
    setPublishError(null);
    setPublishingId(publishTarget.id);
    try {
      const start = getEffectiveStart(publishTarget);
      await SocialAccountsService.publishToTikTok(videoId, start, publishTarget.end, captionDraft);
      setPublishedIds((prev) => new Set(prev).add(publishTarget.id));
      setPublishTarget(null);
    } catch (error: any) {
      setPublishError(error instanceof SocialAccountsError ? error.message : "Erro inesperado ao publicar no TikTok.");
    } finally {
      setPublishingId(null);
    }
  };

  const embedSrc = activeMoment && videoId
    ? `https://www.youtube.com/embed/${videoId}?start=${getEffectiveStart(activeMoment)}&end=${activeMoment.end}&autoplay=1`
    : "";

  return (
    <div className="hs-page">
      {/* Input card */}
      <section className="tr-card tr-input-card">
        <div className="tr-input-lead">
          <div className="tr-input-badge">
            <Link2 size={16} className="tr-icon-lime" />
            <span>Melhores Momentos</span>
          </div>
          <h2 className="tr-input-title">
            {sourceMode === "youtube" ? "Cole o link do YouTube" : "Envie um vídeo do seu computador"}
          </h2>
          <p className="tr-input-hint">
            {sourceMode === "youtube"
              ? "Nossa IA analisa a transcrição do vídeo e aponta os trechos com maior potencial viral para cortar em Shorts, Reels e TikTok."
              : "Sem passar pelo YouTube: a IA transcreve o áudio e corta direto do arquivo enviado, sem risco de bloqueio."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="hs-btn-ghost"
            style={{
              flex: "none",
              borderColor: sourceMode === "youtube" ? "var(--primary-lime)" : undefined,
              color: sourceMode === "youtube" ? "var(--primary-lime)" : undefined,
            }}
            onClick={() => { setSourceMode("youtube"); setUrlError(null); setUploadFile(null); setPastedTranscript(""); }}
          >
            <Link2 size={12} /> Colar link
          </button>
          <button
            type="button"
            className="hs-btn-ghost"
            style={{
              flex: "none",
              borderColor: sourceMode === "upload" ? "var(--primary-lime)" : undefined,
              color: sourceMode === "upload" ? "var(--primary-lime)" : undefined,
            }}
            onClick={() => { setSourceMode("upload"); setUrlError(null); setUrl(""); }}
          >
            <Upload size={12} /> Enviar vídeo
          </button>
        </div>
        <div className="tr-url-row">
          {sourceMode === "youtube" ? (
            <input
              className="tr-input"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && !loading && handleAnalyze()}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              <input
                className="tr-input"
                type="file"
                accept="video/*"
                onChange={(e) => {
                  setUploadFile(e.target.files?.[0] || null);
                  if (urlError) setUrlError(null);
                }}
                style={{ padding: 10 }}
              />
              <span style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>
                Até {Math.round(MAX_SOURCE_VIDEO_BYTES / (1024 * 1024 * 1024))}GB — dá pra subir um episódio inteiro.
              </span>
            </div>
          )}
          <div className="hs-period" ref={durationRef}>
            <button
              type="button"
              className="hs-period-btn"
              data-open={durationOpen}
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
          <button className="btn-primary tr-btn-main" onClick={handleAnalyze} disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="tr-spin" /> Analisando...
              </>
            ) : (
              <>
                Encontrar momentos <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
        {sourceMode === "upload" && (
          <div className="tr-field">
            <label className="hs-label">Já tem a transcrição com timestamp? (opcional)</label>
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
          </div>
        )}
        {urlError && <div className="tr-error">{urlError}</div>}
        <p className="hs-disclaimer">
          Use esta ferramenta como fonte de inspiração. Evite copiar conteúdos de outros criadores e respeite as diretrizes das plataformas.
        </p>
      </section>

      {/* Loading */}
      {loading && (
        <div className="hs-loading">
          <div className="hs-loader-bar"><span /></div>
          <p>{loadingStatus || "Processando..."}</p>
        </div>
      )}

      {/* Inline player for the selected moment */}
      {activeMoment && (videoId || (sourceMode === "upload" && uploadObjectUrl)) && (
        <section className="tr-card tr-fade">
          <div className="tr-card-head">
            <Sparkles size={18} className="tr-icon-lime" />
            <h2>{getEffectiveTitle(activeMoment)}</h2>
            <button
              className="hs-btn-ghost"
              style={{ marginLeft: "auto", flex: "none" }}
              onClick={() => setActiveMoment(null)}
            >
              <X size={12} /> Fechar
            </button>
          </div>
          <div className="tr-video-card">
            <div className="tr-video-wrap">
              {sourceMode === "upload" && uploadObjectUrl ? (
                <video
                  key={`${activeMoment.id}-${getEffectiveStart(activeMoment)}`}
                  src={uploadObjectUrl}
                  controls
                  autoPlay
                  style={{ width: "100%", maxHeight: 480 }}
                  onLoadedMetadata={(e) => { e.currentTarget.currentTime = getEffectiveStart(activeMoment); }}
                  onTimeUpdate={(e) => { if (e.currentTarget.currentTime >= activeMoment.end) e.currentTarget.pause(); }}
                />
              ) : (
                <iframe
                  key={embedSrc}
                  src={embedSrc}
                  title={activeMoment.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* Inline publish panel */}
      {publishTarget && (
        <section className="tr-card tr-fade">
          <div className="tr-card-head">
            <Send size={18} className="tr-icon-lime" />
            <h2>Publicar no TikTok</h2>
            <button
              className="hs-btn-ghost"
              style={{ marginLeft: "auto", flex: "none" }}
              onClick={() => setPublishTarget(null)}
            >
              <X size={12} /> Fechar
            </button>
          </div>
          <div className="tr-field" style={{ padding: "0 20px 20px" }}>
            <label className="hs-label">Legenda</label>
            <textarea
              className="tr-input"
              style={{ width: "100%", minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
              value={captionDraft}
              maxLength={150}
              onChange={(e) => setCaptionDraft(e.target.value)}
            />
            {publishError && <div className="tr-error">{publishError}</div>}
            <button
              className="btn-primary tr-btn-main"
              style={{ marginTop: 12 }}
              onClick={handleConfirmPublish}
              disabled={publishingId === publishTarget.id}
            >
              {publishingId === publishTarget.id ? (
                <>
                  <Loader2 size={16} className="tr-spin" /> Publicando...
                </>
              ) : (
                <>
                  <Send size={16} /> Publicar agora
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* Results */}
      {!loading && moments && (
        <>
          <div className="hs-summary" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <span>
              <strong>{moments.length}</strong> {moments.length === 1 ? "momento encontrado" : "momentos encontrados"} · ordenados por potencial viral
            </span>
            {videoTopic && (
              <span style={{ fontSize: ".78rem", color: "var(--text-secondary)" }}>
                Sobre o vídeo: {videoTopic}
              </span>
            )}
          </div>
          {downloadError && <div className="tr-error">{downloadError}</div>}

          {moments.length === 0 ? (
            <div className="hs-empty">
              <p>Não encontramos momentos com potencial viral claro nesse vídeo.</p>
            </div>
          ) : (
            <section className="hs-grid">
              {moments.map((m) => {
                const effectiveStart = getEffectiveStart(m);
                const titleIndex = selectedTitle[m.id] ?? 0;
                const hookOn = useHook[m.id] === true;
                return (
                <article key={m.id} className="hs-card">
                  <div
                    className="hs-thumb"
                    style={{ position: "relative", overflow: "hidden", cursor: "pointer" }}
                    onClick={() => setActiveMoment(m)}
                  >
                    {videoId && (
                      <img
                        src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                        alt=""
                        referrerPolicy="no-referrer"
                        style={{ position: "absolute", width: "100%", height: "100%", top: 0, left: 0, objectFit: "cover", zIndex: 0 }}
                      />
                    )}
                    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 1 }}></div>
                    <Play size={26} className="hs-thumb-play" style={{ position: "relative", zIndex: 2 }} />
                    <span className="hs-thumb-speed" style={{ position: "relative", zIndex: 2 }}>
                      <Flame size={10} /> {m.score} Score
                    </span>
                  </div>
                  <div className="hs-card-body">
                    <h3 className="hs-card-title m-0">{getEffectiveTitle(m)}</h3>
                    {m.titles.length > 1 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        {m.titles.map((t, i) => (
                          <button
                            key={i}
                            type="button"
                            className="hs-btn-ghost"
                            style={{
                              flex: "none",
                              padding: "3px 9px",
                              fontSize: ".7rem",
                              borderColor: titleIndex === i ? "var(--primary-lime)" : undefined,
                              color: titleIndex === i ? "var(--primary-lime)" : undefined,
                            }}
                            onClick={() => setSelectedTitle((prev) => ({ ...prev, [m.id]: i }))}
                            title={t}
                          >
                            Headline {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                    {m.profile && (
                      <span className="hs-card-tag" style={{ marginLeft: 0 }}>
                        {PROFILE_LABELS[m.profile]}
                      </span>
                    )}
                    <div className="hs-card-row">
                      <span className="hs-card-views">
                        <Clock size={12} /> {formatTime(effectiveStart)} – {formatTime(m.end)}
                      </span>
                      <span className="hs-card-time">{formatDuration(m.end - effectiveStart)}</span>
                    </div>
                    <div className="hs-card-meta">
                      <span style={{ display: "block", lineHeight: 1.4 }}>{m.reason}</span>
                    </div>
                    {m.hookStart !== undefined && (
                      <div className="hs-card-meta">
                        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={hookOn}
                            onChange={(e) => setUseHook((prev) => ({ ...prev, [m.id]: e.target.checked }))}
                            style={{ marginTop: 3 }}
                          />
                          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ display: "flex", gap: 4, alignItems: "center", color: "var(--primary-lime)", fontWeight: 600 }}>
                              <Anchor size={12} /> Usar corte com gancho viral
                            </span>
                            {hookOn && <span style={{ lineHeight: 1.4 }}>{m.hookReason}</span>}
                          </span>
                        </label>
                      </div>
                    )}
                    <div className="hs-card-actions">
                      <button className="hs-btn-ghost" onClick={() => setActiveMoment(m)}>
                        <Play size={12} /> Assistir trecho
                      </button>
                      <button
                        className="hs-btn-ghost"
                        onClick={() => handleDownload(m)}
                        disabled={downloadingId === m.id}
                      >
                        {downloadingId === m.id ? (
                          <>
                            <Loader2 size={12} className="tr-spin" /> Baixando...
                          </>
                        ) : (
                          <>
                            <Download size={12} /> Baixar corte
                          </>
                        )}
                      </button>
                      {sourceMode === "youtube" && (
                        <a
                          className="hs-btn-ghost"
                          href={`https://www.youtube.com/watch?v=${videoId}&t=${effectiveStart}s`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ArrowUpRight size={12} /> Abrir no YouTube
                        </a>
                      )}
                      {sourceMode === "youtube" && (
                        tiktokConnected === false ? (
                          <Link to="/dashboard/configuracoes" className="hs-btn-ghost">
                            <Send size={12} /> Conectar TikTok
                          </Link>
                        ) : publishedIds.has(m.id) ? (
                          <span className="hs-btn-ghost" style={{ color: "var(--primary-lime)", cursor: "default" }}>
                            <CheckCircle2 size={12} /> Publicado
                          </span>
                        ) : (
                          <button className="hs-btn-ghost" onClick={() => handleOpenPublish(m)} disabled={tiktokConnected === null}>
                            <Send size={12} /> Publicar no TikTok
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </article>
                );
              })}
            </section>
          )}
        </>
      )}
    </div>
  );
}
