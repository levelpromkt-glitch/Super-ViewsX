import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Palette, Wand2 } from "lucide-react";

type EditorSearch = { clipId?: string };

export const Route = createFileRoute("/dashboard/editor")({
  component: EditorPage,
  validateSearch: (search: Record<string, unknown>): EditorSearch => ({
    clipId: typeof search.clipId === "string" ? search.clipId : undefined,
  }),
});

import { SavedClipsService, SavedClipsError } from "@/services/savedClipsService";
import { ClipDownloadService, ClipDownloadError, ClipSource } from "@/services/clipDownloadService";
import { ViralMomentsService, ViralMomentsError } from "@/services/viralMomentsService";
import { CaptionEditorService, CaptionEditorError, CaptionWord } from "@/services/captionEditorService";
import { MAX_SOURCE_VIDEO_BYTES } from "@/services/postsService";
import { CaptionPreview, groupIntoChunks } from "@/components/editor/CaptionPreview";
import { TrimTimeline } from "@/components/editor/TrimTimeline";
import { WordList } from "@/components/editor/WordList";

const TEMPLATES = [{ id: "karaoke-yellow", label: "Karaokê" }];
const MIN_TRIM_GAP = 0.2;

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

  // What to re-cut against if the user trims — the original clippable
  // source (a YouTube videoId or an R2 key) plus where the currently loaded
  // preview starts within it. A Biblioteca clip already starts partway into
  // its source video; a fresh upload starts at 0.
  const [sourceForTrim, setSourceForTrim] = useState<ClipSource | null>(null);
  const [baseStart, setBaseStart] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
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
    setSourceForTrim(null);
    setBaseStart(0);
    setTrimStart(0);
    setTrimEnd(0);
    setCurrentTime(0);
    setResultUrl(null);
    setError(null);
  };

  const prepareFromUrl = async (url: string, duration: number, source: ClipSource, base: number) => {
    setLoadingStatus("Transcrevendo o áudio...");
    const { words: transcribedWords, videoDurationSec } = await CaptionEditorService.transcribeSourceUrl(url);
    const finalDuration = videoDurationSec || duration;
    setSourceVideoUrl(url);
    setDurationSec(finalDuration);
    setWords(transcribedWords);
    setSourceForTrim(source);
    setBaseStart(base);
    setTrimStart(0);
    setTrimEnd(finalDuration);
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
        await prepareFromUrl(url, clip.end_sec - clip.start_sec, clip.source, clip.start_sec);
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
      const source: ClipSource = { r2Key: key };
      const url = await ClipDownloadService.getClipDownloadUrl(source, 0, Math.ceil(duration));
      await prepareFromUrl(url, duration, source, 0);
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

  const handleTrimChange = (start: number, end: number) => {
    setTrimStart(start);
    setTrimEnd(end);
  };

  const handleGenerate = async () => {
    if (!sourceVideoUrl || !words || !durationSec || !sourceForTrim) return;
    setRendering(true);
    setResultUrl(null);
    setError(null);
    try {
      if (saveAsDefault) {
        await CaptionEditorService.saveBrandKit({ accent_color: accentColor, logo_r2_key: logoUrl || null, default_template: template });
      }

      const isTrimmed = trimStart > MIN_TRIM_GAP / 2 || trimEnd < durationSec - MIN_TRIM_GAP / 2;
      let renderUrl = sourceVideoUrl;
      let renderWords = words;
      let renderDuration = durationSec;

      if (isTrimmed) {
        setLoadingStatus("Cortando o trecho selecionado...");
        renderUrl = await ClipDownloadService.getClipDownloadUrl(sourceForTrim, baseStart + trimStart, baseStart + trimEnd);
        renderWords = words
          .filter((w) => w.end > trimStart && w.start < trimEnd)
          .map((w) => ({ word: w.word, start: Math.max(0, w.start - trimStart), end: Math.max(0, w.end - trimStart) }));
        renderDuration = trimEnd - trimStart;
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
          <h2 className="tr-input-title">Legenda automática queimada</h2>
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
        <section className="tr-card tr-fade">
          <div className="tr-card-head">
            <Palette size={18} className="tr-icon-lime" />
            <h2>Estilo</h2>
          </div>
          <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <CaptionPreview
              videoUrl={sourceVideoUrl}
              chunks={chunks}
              currentTime={currentTime}
              accentColor={accentColor}
              onTimeUpdate={setCurrentTime}
              videoRef={videoRef}
            />

            <TrimTimeline
              durationSec={durationSec}
              currentTime={currentTime}
              trimStart={trimStart}
              trimEnd={trimEnd}
              onSeek={handleSeek}
              onTrimChange={handleTrimChange}
            />

            <WordList words={words} currentTime={currentTime} trimStart={trimStart} trimEnd={trimEnd} onSeek={handleSeek} />

            <div className="tr-field">
              <label className="hs-label">Modelo de legenda</label>
              <select className="tr-input" value={template} onChange={(e) => setTemplate(e.target.value)}>
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div className="tr-field" style={{ flex: "none" }}>
                <label className="hs-label">Cor de destaque</label>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{ width: 60, height: 40, padding: 2, borderRadius: 8, border: "1px solid var(--border-soft)" }}
                />
              </div>
              <div className="tr-field" style={{ flex: 1, minWidth: 220 }}>
                <label className="hs-label">Logo (URL da imagem, opcional)</label>
                <input
                  type="text"
                  className="tr-input"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: ".82rem", color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} />
              Salvar como padrão do meu Brand Kit
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
          </div>
        </section>
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
