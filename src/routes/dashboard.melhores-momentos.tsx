import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  Download,
  Flame,
  Link2,
  Loader2,
  Play,
  Sparkles,
  X,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/melhores-momentos")({
  component: MelhoresMomentosPage,
});

import { TranscriptService, TranscriptError } from "@/services/transcriptService";
import { ViralMomentsService, ViralMomentsError, ViralMoment } from "@/services/viralMomentsService";
import { ClipDownloadService, ClipDownloadError } from "@/services/clipDownloadService";

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
      const bestMoments = await ViralMomentsService.findBestMoments(id, "", transcript.lines);
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
                    <div className="hs-card-row">
                      <span className="hs-card-views">
                        <Clock size={12} /> {formatTime(m.start)} – {formatTime(m.end)}
                      </span>
                      <span className="hs-card-time">{formatDuration(m.end - m.start)}</span>
                    </div>
                    <div className="hs-card-meta">
                      <span style={{ display: "block", lineHeight: 1.4 }}>{m.reason}</span>
                    </div>
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
