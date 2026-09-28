import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, Loader2, MessageSquareText, Palette, Scissors, Type, Wand2 } from "lucide-react";

type EditorSearch = { clipId?: string };

export const Route = createFileRoute("/dashboard/editor")({
  component: EditorPage,
  validateSearch: (search: Record<string, unknown>): EditorSearch => ({
    clipId: typeof search.clipId === "string" ? search.clipId : undefined,
  }),
});

import { SavedClipsService, SavedClipsError } from "@/services/savedClipsService";
import { ClipDownloadService, ClipDownloadError } from "@/services/clipDownloadService";
import { ViralMomentsService, ViralMomentsError } from "@/services/viralMomentsService";
import { CaptionEditorService, CaptionEditorError, CaptionWord } from "@/services/captionEditorService";
import { MAX_SOURCE_VIDEO_BYTES } from "@/services/postsService";
import { CaptionPreview, groupIntoChunks } from "@/components/editor/CaptionPreview";
import { CutTimeline, Cut, formatTime } from "@/components/editor/CutTimeline";
import { CaptionTrack } from "@/components/editor/CaptionTrack";
import { WordList } from "@/components/editor/WordList";

const TEMPLATES = [{ id: "karaoke-yellow", label: "Karaokê" }];

function TimeRuler({ durationSec }: { durationSec: number }) {
  const step = durationSec > 120 ? 30 : durationSec > 60 ? 15 : durationSec > 20 ? 5 : 2;
  const marks: number[] = [];
  for (let t = 0; t <= durationSec; t += step) marks.push(t);
  const pct = (t: number) => (durationSec > 0 ? (t / durationSec) * 100 : 0);
  return (
    <div className="ed-ruler">
      {marks.map((t) => (
        <span key={t} style={{ left: `${pct(t)}%` }}>{formatTime(t)}</span>
      ))}
    </div>
  );
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error("Não foi possível ler o vídeo."));
    video.src = URL.createObjectURL(file);
  });
}

// The complement of the marked cuts within [0, durationSec] — what actually
// survives into the final render, in original-video time.
function computeKeptSegments(durationSec: number, cuts: Cut[]): { start: number; end: number }[] {
  const sorted = cuts.map((c) => ({ start: c.start, end: c.end })).sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const c of sorted) {
    const last = merged[merged.length - 1];
    if (!last || c.start > last.end) merged.push({ ...c });
    else last.end = Math.max(last.end, c.end);
  }
  const kept: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const c of merged) {
    if (c.start > cursor) kept.push({ start: cursor, end: c.start });
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < durationSec) kept.push({ start: cursor, end: durationSec });
  return kept;
}

function EditorPage() {
  const { clipId } = Route.useSearch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [words, setWords] = useState<CaptionWord[] | null>(null);

  const [cuts, setCuts] = useState<Cut[]>([]);
  const [currentTime, setCurrentTime] = useState(0);

  const [template, setTemplate] = useState(TEMPLATES[0].id);
  const [accentColor, setAccentColor] = useState("#FFD400");
  const [logoUrl, setLogoUrl] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  const [rendering, setRendering] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const chunks = useMemo(() => (words ? groupIntoChunks(words) : []), [words]);

  useEffect(() => {
    CaptionEditorService.getBrandKit()
      .then((kit) => {
        if (!kit) return;
        setAccentColor(kit.accent_color);
        setTemplate(kit.default_template);
        if (kit.logo_r2_key) setLogoUrl(kit.logo_r2_key);
      })
      .catch(() => {});
  }, []);

  const resetSource = () => {
    setSourceVideoUrl(null);
    setDurationSec(null);
    setWords(null);
    setCuts([]);
    setCurrentTime(0);
    setResultUrl(null);
    setError(null);
  };

  const prepareFromUrl = async (url: string, duration: number) => {
    setLoadingStatus("Transcrevendo o áudio...");
    const { words: transcribedWords, videoDurationSec } = await CaptionEditorService.transcribeSourceUrl(url);
    setSourceVideoUrl(url);
    setDurationSec(videoDurationSec || duration);
    setWords(transcribedWords);
    setCuts([]);
    setCurrentTime(0);
  };

  // Loaded via ?clipId=... from the Biblioteca "Editar" link.
  useEffect(() => {
    if (!clipId) return;
    resetSource();
    setLoading(true);
    (async () => {
      try {
        setLoadingStatus("Carregando corte da biblioteca...");
        const clip = await SavedClipsService.get(clipId);
        setLoadingStatus("Cortando o vídeo...");
        const url = await ClipDownloadService.getClipDownloadUrl(clip.source, clip.start_sec, clip.end_sec);
        await prepareFromUrl(url, clip.end_sec - clip.start_sec);
      } catch (err: any) {
        setError(err instanceof SavedClipsError || err instanceof ClipDownloadError || err instanceof CaptionEditorError
          ? err.message
          : "Erro ao carregar o corte.");
      } finally {
        setLoading(false);
        setLoadingStatus("");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  const handleUpload = async (file: File) => {
    if (file.size > MAX_SOURCE_VIDEO_BYTES) {
      setError(`O vídeo excede o limite de ${Math.round(MAX_SOURCE_VIDEO_BYTES / (1024 * 1024 * 1024))}GB.`);
      return;
    }
    resetSource();
    setLoading(true);
    try {
      setLoadingStatus("Enviando vídeo...");
      const duration = await readVideoDuration(file);
      const key = await ViralMomentsService.uploadSourceVideoToR2(file);
      setLoadingStatus("Preparando o corte...");
      const url = await ClipDownloadService.getClipDownloadUrl({ r2Key: key }, 0, Math.ceil(duration));
      await prepareFromUrl(url, duration);
    } catch (err: any) {
      setError(err instanceof ViralMomentsError || err instanceof ClipDownloadError || err instanceof CaptionEditorError
        ? err.message
        : "Erro ao processar o vídeo.");
    } finally {
      setLoading(false);
      setLoadingStatus("");
    }
  };

  const handleSeek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  };

  // Ripple preview: while playing, jump over any marked cut instead of
  // actually showing it, so what you watch already looks like the edit.
  const handleTimeUpdate = (t: number) => {
    const activeCut = cuts.find((c) => t >= c.start && t < c.end);
    if (activeCut) {
      if (videoRef.current) videoRef.current.currentTime = activeCut.end;
      setCurrentTime(activeCut.end);
      return;
    }
    setCurrentTime(t);
  };

  const handleAddCut = () => {
    if (!durationSec) return;
    const width = Math.min(2, Math.max(0.6, durationSec * 0.08));
    const start = Math.max(0, currentTime - width / 2);
    const end = Math.min(durationSec, currentTime + width / 2);
    if (end - start < 0.3) return;
    setCuts((prev) => [...prev, { id: crypto.randomUUID(), start, end }]);
  };

  const handleUpdateCut = (id: string, start: number, end: number) => {
    setCuts((prev) => prev.map((c) => (c.id === id ? { ...c, start, end } : c)));
  };

  const handleRemoveCut = (id: string) => {
    setCuts((prev) => prev.filter((c) => c.id !== id));
  };

  const handleGenerate = async () => {
    if (!sourceVideoUrl || !words || !durationSec) return;
    setRendering(true);
    setResultUrl(null);
    setError(null);
    try {
      if (saveAsDefault) {
        await CaptionEditorService.saveBrandKit({ accent_color: accentColor, logo_r2_key: logoUrl || null, default_template: template });
      }

      let renderUrl = sourceVideoUrl;
      let renderWords = words;
      let renderDuration = durationSec;

      if (cuts.length > 0) {
        const keptSegments = computeKeptSegments(durationSec, cuts);
        if (keptSegments.length === 0) {
          setError("Você removeu o vídeo inteiro — desfaça algum corte antes de gerar.");
          return;
        }
        setLoadingStatus("Aplicando os cortes...");
        renderUrl = await ClipDownloadService.getSegmentsDownloadUrl(sourceVideoUrl, keptSegments);

        let cursor = 0;
        const mapped: CaptionWord[] = [];
        for (const seg of keptSegments) {
          for (const w of words) {
            const mid = (w.start + w.end) / 2;
            if (mid >= seg.start && mid < seg.end) {
              mapped.push({
                word: w.word,
                start: Math.max(0, w.start - seg.start) + cursor,
                end: Math.max(0, w.end - seg.start) + cursor,
              });
            }
          }
          cursor += seg.end - seg.start;
        }
        renderWords = mapped;
        renderDuration = cursor;
      }

      setLoadingStatus("Iniciando renderização...");
      const jobId = await CaptionEditorService.startRender({
        sourceVideoUrl: renderUrl,
        words: renderWords,
        durationSec: renderDuration,
        accentColor,
        logoUrl: logoUrl || undefined,
        template,
      });
      const url = await CaptionEditorService.pollRenderJob(jobId, () => setLoadingStatus("Renderizando legenda..."));
      setResultUrl(url);
    } catch (err: any) {
      setError(err instanceof CaptionEditorError || err instanceof ClipDownloadError ? err.message : "Erro inesperado ao renderizar.");
    } finally {
      setRendering(false);
      setLoadingStatus("");
    }
  };

  return (
    <div className="hs-page">
      <section className="tr-card tr-input-card">
        <div className="tr-input-lead">
          <div className="tr-input-badge">
            <Wand2 size={16} className="tr-icon-lime" />
            <span>Editor</span>
          </div>
          <h2 className="tr-input-title">Editor de cortes e legenda automática</h2>
          <p className="tr-input-hint">
            Envie um vídeo do seu computador, ou volte na Biblioteca e clique em "Editar" num corte salvo.
          </p>
        </div>

        {!sourceVideoUrl && !loading && (
          <div className="tr-field">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="tr-input"
              style={{ padding: 10 }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
          </div>
        )}

        {loading && (
          <div className="hs-loading">
            <div className="hs-loader-bar"><span /></div>
            <p>{loadingStatus || "Processando..."}</p>
          </div>
        )}

        {error && <div className="tr-error">{error}</div>}
      </section>

      {sourceVideoUrl && durationSec && words && (
        <div className="ed-workspace">
          <div className="ed-main">
            <CaptionPreview
              videoUrl={sourceVideoUrl}
              chunks={chunks}
              currentTime={currentTime}
              accentColor={accentColor}
              onTimeUpdate={handleTimeUpdate}
              videoRef={videoRef}
            />

            <div className="ed-timeline-panel">
              <div className="ed-timeline-toolbar">
                <span className="tr-muted" style={{ fontSize: ".78rem" }}>
                  {cuts.length > 0 ? `${cuts.length} corte${cuts.length > 1 ? "s" : ""}` : "Nenhum corte"}
                </span>
                <button type="button" className="hs-btn-ghost" onClick={handleAddCut}>
                  <Scissors size={12} /> Cortar aqui
                </button>
              </div>

              <TimeRuler durationSec={durationSec} />

              <div className="ed-track-row">
                <span className="ed-track-label"><Film size={13} /> Vídeo</span>
                <div className="ed-track-body">
                  <CutTimeline
                    durationSec={durationSec}
                    currentTime={currentTime}
                    cuts={cuts}
                    onSeek={handleSeek}
                    onUpdateCut={handleUpdateCut}
                    onRemoveCut={handleRemoveCut}
                  />
                </div>
              </div>

              <div className="ed-track-row">
                <span className="ed-track-label"><Type size={13} /> Legenda</span>
                <div className="ed-track-body">
                  <CaptionTrack durationSec={durationSec} chunks={chunks} currentTime={currentTime} onSeek={handleSeek} />
                </div>
              </div>
            </div>

            <div className="ps-section" style={{ margin: 0 }}>
              <h3 className="ps-section-title" style={{ fontSize: ".8rem" }}>
                <MessageSquareText size={14} className="tr-icon-lime" /> Transcrição
              </h3>
              <WordList words={words} currentTime={currentTime} cuts={cuts} onSeek={handleSeek} />
            </div>
          </div>

          <aside className="ed-inspector">
            <h3 className="ed-inspector-title"><Palette size={16} className="tr-icon-lime" /> Estilo</h3>

            <div className="tr-field">
              <label className="hs-label">Modelo de legenda</label>
              <select className="tr-input" value={template} onChange={(e) => setTemplate(e.target.value)}>
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="tr-field">
              <label className="hs-label">Cor de destaque</label>
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                style={{ width: "100%", height: 40, padding: 2, borderRadius: 8, border: "1px solid var(--border-soft)" }}
              />
            </div>

            <div className="tr-field">
              <label className="hs-label">Logo (URL da imagem, opcional)</label>
              <input
                type="text"
                className="tr-input"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: ".8rem", color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} />
              Salvar como padrão do Brand Kit
            </label>

            {rendering && (
              <div className="hs-loading">
                <div className="hs-loader-bar"><span /></div>
                <p>{loadingStatus || "Renderizando..."}</p>
              </div>
            )}
            {error && <div className="tr-error">{error}</div>}

            <button className="btn-primary tr-btn-main" onClick={handleGenerate} disabled={rendering}>
              {rendering ? (
                <>
                  <Loader2 size={16} className="tr-spin" /> Gerando...
                </>
              ) : (
                <>
                  <Wand2 size={16} /> Gerar vídeo com legenda
                </>
              )}
            </button>
          </aside>
        </div>
      )}

      {resultUrl && (
        <section className="tr-card tr-fade">
          <div className="tr-card-head">
            <Download size={18} className="tr-icon-lime" />
            <h2>Pronto!</h2>
          </div>
          <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <video src={resultUrl} controls style={{ width: "100%", maxHeight: 420, borderRadius: 12 }} />
            <a className="btn-primary tr-btn-main" href={resultUrl} download>
              <Download size={16} /> Baixar vídeo
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
