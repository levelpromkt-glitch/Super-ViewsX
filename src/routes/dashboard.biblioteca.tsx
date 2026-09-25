import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, Clock, Download, Eye, Flame, Heart, Loader2, Trash2, Wand2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/biblioteca")({
  component: BibliotecaPage,
});

import { SavedClipsService, SavedClipsError, SavedClip } from "@/services/savedClipsService";
import { ClipDownloadService, ClipDownloadError } from "@/services/clipDownloadService";
import { SavedReferencesService, SavedReferencesError, SavedReference } from "@/services/savedReferencesService";

function formatNumber(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace(".0", "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1).replace(".0", "") + "k";
  return String(n);
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
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

function BibliotecaPage() {
  const [clips, setClips] = useState<SavedClip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [references, setReferences] = useState<SavedReference[] | null>(null);
  const [removingRefId, setRemovingRefId] = useState<string | null>(null);

  const load = () => {
    SavedClipsService.list()
      .then(setClips)
      .catch((err) => setError(err instanceof SavedClipsError ? err.message : "Erro ao carregar a biblioteca."));
    SavedReferencesService.list()
      .then(setReferences)
      .catch((err) => setError(err instanceof SavedReferencesError ? err.message : "Erro ao carregar as referências."));
  };

  useEffect(load, []);

  const handleRemoveReference = async (id: string) => {
    setRemovingRefId(id);
    try {
      await SavedReferencesService.remove(id);
      setReferences((prev) => prev?.filter((r) => r.id !== id) || prev);
    } catch (err: any) {
      setError(err instanceof SavedReferencesError ? err.message : "Erro ao remover.");
    } finally {
      setRemovingRefId(null);
    }
  };

  const handleDownload = async (clip: SavedClip) => {
    setError(null);
    setDownloadingId(clip.id);
    setDownloadProgress(0);
    try {
      const filename = `${slugifyFilename(clip.title)}.mp4`;
      await ClipDownloadService.downloadClip(clip.source, clip.start_sec, clip.end_sec, filename, false, setDownloadProgress);
    } catch (err: any) {
      setError(err instanceof ClipDownloadError ? err.message : "Erro inesperado ao baixar o corte.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await SavedClipsService.remove(id);
      setClips((prev) => prev?.filter((c) => c.id !== id) || prev);
    } catch (err: any) {
      setError(err instanceof SavedClipsError ? err.message : "Erro ao remover.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="hs-page">
      <section className="tr-card tr-input-card">
        <div className="tr-input-lead">
          <div className="tr-input-badge">
            <Heart size={16} className="tr-icon-lime" />
            <span>Biblioteca</span>
          </div>
          <h2 className="tr-input-title">Momentos salvos</h2>
          <p className="tr-input-hint">
            Cortes que você curtiu em Melhores Momentos. Baixe, ou mande pro Editor pra queimar legenda.
          </p>
        </div>
        {error && <div className="tr-error">{error}</div>}
      </section>

      {!clips ? (
        <p className="tr-muted">Carregando...</p>
      ) : clips.length === 0 ? (
        <div className="hs-empty">
          <p>Nenhum momento salvo ainda. Vá em Melhores Momentos e clique em "Salvar" nos cortes que curtir.</p>
        </div>
      ) : (
        <section className="hs-grid">
          {clips.map((clip) => (
            <article key={clip.id} className="hs-card">
              <div className="hs-thumb" style={{ position: "relative", overflow: "hidden" }}>
                {clip.thumbnail ? (
                  <img
                    src={clip.thumbnail}
                    alt=""
                    style={{ position: "absolute", width: "100%", height: "100%", top: 0, left: 0, objectFit: "cover" }}
                  />
                ) : "videoId" in clip.source ? (
                  <img
                    src={`https://img.youtube.com/vi/${clip.source.videoId}/hqdefault.jpg`}
                    alt=""
                    referrerPolicy="no-referrer"
                    style={{ position: "absolute", width: "100%", height: "100%", top: 0, left: 0, objectFit: "cover" }}
                  />
                ) : null}
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} />
                {clip.score !== null && (
                  <span className="hs-thumb-speed" style={{ position: "relative", zIndex: 2 }}>
                    <Flame size={10} /> {clip.score} Score
                  </span>
                )}
              </div>
              <div className="hs-card-body">
                <h3 className="hs-card-title m-0">{clip.title}</h3>
                <div className="hs-card-row">
                  <span className="hs-card-views">
                    <Clock size={12} /> {formatTime(clip.start_sec)} – {formatTime(clip.end_sec)}
                  </span>
                </div>
                <div className="hs-card-actions">
                  <Link
                    to="/dashboard/editor"
                    search={{ clipId: clip.id }}
                    className="hs-btn-ghost"
                  >
                    <Wand2 size={12} /> Editar
                  </Link>
                  <button className="hs-btn-ghost" onClick={() => handleDownload(clip)} disabled={downloadingId === clip.id}>
                    {downloadingId === clip.id ? (
                      <>
                        <Loader2 size={12} className="tr-spin" /> Baixando... {downloadProgress}%
                      </>
                    ) : (
                      <>
                        <Download size={12} /> Baixar
                      </>
                    )}
                  </button>
                  <button className="hs-btn-ghost" onClick={() => handleRemove(clip.id)} disabled={removingId === clip.id}>
                    {removingId === clip.id ? <Loader2 size={12} className="tr-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="tr-card tr-input-card">
        <div className="tr-input-lead">
          <div className="tr-input-badge">
            <Heart size={16} className="tr-icon-lime" />
            <span>Referências</span>
          </div>
          <h2 className="tr-input-title">Vídeos salvos da Pesquisar Hashtag</h2>
          <p className="tr-input-hint">
            Vídeos de outros criadores que você salvou como inspiração — não são clipes seus, só links de referência.
          </p>
        </div>
      </section>

      {!references ? (
        <p className="tr-muted">Carregando...</p>
      ) : references.length === 0 ? (
        <div className="hs-empty">
          <p>Nenhuma referência salva ainda. Vá em Pesquisar Hashtag e clique em "Salvar" nos vídeos que curtir.</p>
        </div>
      ) : (
        <section className="hs-grid">
          {references.map((ref) => (
            <article key={ref.id} className="hs-card">
              <div className="hs-thumb" style={{ position: "relative", overflow: "hidden" }}>
                {ref.thumbnail && (
                  <img
                    src={ref.thumbnail}
                    alt=""
                    referrerPolicy="no-referrer"
                    style={{ position: "absolute", width: "100%", height: "100%", top: 0, left: 0, objectFit: "cover" }}
                  />
                )}
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} />
              </div>
              <div className="hs-card-body">
                <h3 className="hs-card-title m-0">{ref.title || "Vídeo sem título"}</h3>
                <div className="hs-card-row">
                  {ref.views !== null && (
                    <span className="hs-card-views">
                      <Eye size={12} /> {formatNumber(ref.views)}
                    </span>
                  )}
                  <span className="hs-card-tag">{ref.platform === "tiktok" ? "TikTok" : "YouTube"}</span>
                </div>
                <div className="hs-card-actions">
                  <a className="hs-btn-ghost" href={ref.url} target="_blank" rel="noopener noreferrer">
                    <ArrowUpRight size={12} /> Abrir vídeo
                  </a>
                  <button className="hs-btn-ghost" onClick={() => handleRemoveReference(ref.id)} disabled={removingRefId === ref.id}>
                    {removingRefId === ref.id ? <Loader2 size={12} className="tr-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
