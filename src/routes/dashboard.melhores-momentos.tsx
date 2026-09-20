import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  X,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/melhores-momentos")({
  component: MelhoresMomentosPage,
});

import { TranscriptService, TranscriptError } from "@/services/transcriptService";
import { ViralMomentsService, ViralMomentsError, ViralMoment, DurationPreset, NarrativeProfile } from "@/services/viralMomentsService";
import { ClipDownloadService, ClipDownloadError } from "@/services/clipDownloadService";
import { SocialAccountsService, SocialAccountsError } from "@/services/socialAccountsService";

const DURATIONS: { id: DurationPreset; label: string }[] = [
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

function MelhoresMomentosPage() {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [moments, setMoments] = useState<ViralMoment[] | null>(null);
  const [activeMoment, setActiveMoment] = useState<ViralMoment | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [duration, setDuration] = useState<DurationPreset>("30-60");
  const [durationOpen, setDurationOpen] = useState(false);
  const [viralHook, setViralHook] = useState(false);
  const durationRef = useRef<HTMLDivElement>(null);

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

  const handleAnalyze = async () => {
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
    setMoments(null);
    setActiveMoment(null);
    setLoading(true);
    setLoadingStatus("Transcrevendo o vídeo...");

    try {
      const transcript = await TranscriptService.getTranscript(id);
      setLoadingStatus("Analisando os melhores momentos com IA...");
      const bestMoments = await ViralMomentsService.findBestMoments(id, "", transcript.lines, duration, viralHook);
      setMoments(bestMoments);
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

  const handleDownload = async (m: ViralMoment) => {
    if (!videoId) return;
    setDownloadError(null);
    setDownloadingId(m.id);
    try {
      await ClipDownloadService.downloadClip(videoId, m.start, m.end, `${videoId}-${m.start}-${m.end}.mp4`);
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
    setCaptionDraft(m.title);
  };

  const handleConfirmPublish = async () => {
    if (!videoId || !publishTarget) return;
    setPublishError(null);
    setPublishingId(publishTarget.id);
    try {
      await SocialAccountsService.publishToTikTok(videoId, publishTarget.start, publishTarget.end, captionDraft);
      setPublishedIds((prev) => new Set(prev).add(publishTarget.id));
      setPublishTarget(null);
    } catch (error: any) {
      setPublishError(error instanceof SocialAccountsError ? error.message : "Erro inesperado ao publicar no TikTok.");
    } finally {
      setPublishingId(null);
    }
  };

  const embedSrc = activeMoment && videoId
    ? `https://www.youtube.com/embed/${videoId}?start=${activeMoment.start}&end=${activeMoment.end}&autoplay=1`
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
          <h2 className="tr-input-title">Cole o link do YouTube</h2>
          <p className="tr-input-hint">
            Nossa IA analisa a transcrição do vídeo e aponta os trechos com maior potencial viral para cortar em Shorts, Reels e TikTok.
          </p>
        </div>
        <div className="tr-url-row">
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
        <button
          type="button"
          className="hs-btn-ghost"
          style={{
            width: "fit-content",
            borderColor: viralHook ? "var(--primary-lime)" : undefined,
            color: viralHook ? "var(--primary-lime)" : undefined,
          }}
          onClick={() => setViralHook((v) => !v)}
        >
          <Anchor size={12} />
          Gancho viral {viralHook ? "ativado" : "desativado"}
        </button>
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
      {activeMoment && videoId && (
        <section className="tr-card tr-fade">
          <div className="tr-card-head">
            <Sparkles size={18} className="tr-icon-lime" />
            <h2>{activeMoment.title}</h2>
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
              <iframe
                key={embedSrc}
                src={embedSrc}
                title={activeMoment.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
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
          <div className="hs-summary">
            <span>
              <strong>{moments.length}</strong> {moments.length === 1 ? "momento encontrado" : "momentos encontrados"} · ordenados por potencial viral
            </span>
          </div>
          {downloadError && <div className="tr-error">{downloadError}</div>}

          {moments.length === 0 ? (
            <div className="hs-empty">
              <p>Não encontramos momentos com potencial viral claro nesse vídeo.</p>
            </div>
          ) : (
            <section className="hs-grid">
              {moments.map((m) => (
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
                    <h3 className="hs-card-title m-0">{m.title}</h3>
                    {m.profile && (
                      <span className="hs-card-tag" style={{ marginLeft: 0 }}>
                        {PROFILE_LABELS[m.profile]}
                      </span>
                    )}
                    <div className="hs-card-row">
                      <span className="hs-card-views">
                        <Clock size={12} /> {formatTime(m.start)} – {formatTime(m.end)}
                      </span>
                      <span className="hs-card-time">{formatDuration(m.end - m.start)}</span>
                    </div>
                    <div className="hs-card-meta">
                      <span style={{ display: "block", lineHeight: 1.4 }}>{m.reason}</span>
                    </div>
                    {m.hookReason && (
                      <div className="hs-card-meta">
                        <span style={{ display: "flex", gap: 4, lineHeight: 1.4, color: "var(--primary-lime)" }}>
                          <Anchor size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {m.hookReason}
                        </span>
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
                      <a
                        className="hs-btn-ghost"
                        href={`https://www.youtube.com/watch?v=${videoId}&t=${m.start}s`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ArrowUpRight size={12} /> Abrir no YouTube
                      </a>
                      {tiktokConnected === false ? (
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
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
