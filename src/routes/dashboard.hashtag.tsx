import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowUpRight,
  ChevronDown,
  Eye,
  Flame,
  Hash,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  Search,
  Video,
  Music,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/hashtag")({
  component: HashtagPage,
});

type Period = "24h" | "3d" | "7d" | "15d" | "30d" | "6m";

const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: "24h", label: "24h", days: 1 },
  { id: "3d", label: "3 dias", days: 3 },
  { id: "7d", label: "7 dias", days: 7 },
  { id: "15d", label: "15 dias", days: 15 },
  { id: "30d", label: "30 dias", days: 30 },
  { id: "6m", label: "6 meses", days: 180 },
];

function formatNumber(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace(".0", "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1).replace(".0", "") + "k";
  return String(n);
}

// Slider uses log scale 1000..1_000_000 across 0..100
function sliderToViews(v: number) {
  const min = Math.log10(1000);
  const max = Math.log10(1_000_000);
  return Math.round(Math.pow(10, min + ((max - min) * v) / 100));
}
function viewsToSlider(views: number) {
  const min = Math.log10(1000);
  const max = Math.log10(1_000_000);
  return Math.round(((Math.log10(Math.max(1000, views)) - min) / (max - min)) * 100);
}

function HashtagPage() {
  const [platform, setPlatform] = useState<"youtube" | "tiktok">("youtube");
  const [hashtag, setHashtag] = useState("");
  const [period, setPeriod] = useState<Period>("7d");
  const [sliderVal, setSliderVal] = useState(viewsToSlider(5000));
  const [minViews, setMinViews] = useState(5000);

  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<{ tag: string; period: Period; minViews: number } | null>(null);
  const [actualResults, setActualResults] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!periodOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [periodOpen]);

  const currentSearchId = useRef(0);

  const currentPeriodLabel = PERIODS.find((p) => p.id === period)?.label ?? "";
  const periodLabel = PERIODS.find((p) => p.id === (lastQuery?.period ?? period))?.label ?? "";

  const onSlider = (v: number) => {
    setSliderVal(v);
    setMinViews(sliderToViews(v));
  };

  const handleSearch = async () => {
    const clean = hashtag.trim();
    if (!clean) {
      setError("Digite uma hashtag para pesquisar.");
      return;
    }
    
    currentSearchId.current += 1;
    const mySearchId = currentSearchId.current;

    setError(null);
    setLoading(true);
    setLoadingStatus("Iniciando a busca...");
    setSearched(false);
    setNextCursor(null);
    
    try {
      let currentCursor: string | undefined = undefined;
      let finalData: any = null;

      while (mySearchId === currentSearchId.current) {
        const { data, error: functionError } = await supabase.functions.invoke('viral-engine', {
          body: {
            platform,
            query: clean,
            period,
            minViews,
            cursor: currentCursor
          }
        });

        if (functionError) throw functionError;
        if (!data.success) throw new Error(data.message || "Erro desconhecido");

        if (data.status === "polling") {
          currentCursor = data.nextCursor;
          setLoadingStatus("Minerando vídeos no Apify (Isso pode levar de 1 a 2 minutos)...");
          await new Promise(r => setTimeout(r, 5000));
        } else {
          finalData = data;
          break;
        }
      }

      if (mySearchId === currentSearchId.current && finalData) {
        setLastQuery({ tag: clean, period, minViews });
        setActualResults(finalData.videos || []);
        setNextCursor(finalData.nextCursor || null);
        setSearched(true);
      }
    } catch (err: any) {
      if (mySearchId === currentSearchId.current) {
        console.error(err);
        setError(err.message || "Erro ao buscar vídeos. Tente novamente mais tarde.");
      }
    } finally {
      if (mySearchId === currentSearchId.current) {
        setLoading(false);
        setLoadingStatus("");
      }
    }
  };

  const handleLoadMore = async () => {
    if (!lastQuery || !nextCursor) return;
    setLoadingMore(true);
    try {
      const { data, error: functionError } = await supabase.functions.invoke('viral-engine', {
        body: {
          platform,
          query: lastQuery.tag,
          period: lastQuery.period,
          minViews: lastQuery.minViews,
          cursor: nextCursor
        }
      });

      if (functionError) throw functionError;
      if (!data.success) throw new Error(data.message || "Erro desconhecido");

      setActualResults(prev => {
        const existingIds = new Set(prev.map(v => v.id));
        const newVideos = (data.videos || []).filter((v: any) => !existingIds.has(v.id));
        return [...prev, ...newVideos];
      });
      setNextCursor(data.nextCursor || null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar mais vídeos.");
    } finally {
      setLoadingMore(false);
    }
  };

  const results = actualResults;

  return (
    <div className="hs-page">

      {/* Search card */}
      <section className="hs-panel">
        
        <div className="hs-field">
          <label className="hs-label">Plataforma</label>
          <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-white/5 w-fit gap-1">
            <button
              onClick={() => setPlatform("youtube")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium ${platform === "youtube" ? "bg-red-500/10 text-red-500 shadow-sm" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <Video size={16} /> YouTube
            </button>
            <button
              onClick={() => setPlatform("tiktok")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium ${platform === "tiktok" ? "bg-cyan-500/10 text-cyan-500 shadow-sm" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <Music size={16} /> TikTok
            </button>
          </div>
        </div>

        <div className="hs-field">
          <label className="hs-label">Hashtag e período</label>
          <div className="hs-search-row">
            <div className={`hs-input-wrap ${error ? "hs-input-error" : ""}`}>
              <Hash size={15} />
              <input
                className="hs-input"
                type="text"
                placeholder="Digite uma hashtag para pesquisar vídeos em alta"
                value={hashtag}
                onChange={(e) => {
                  setHashtag(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <div className="hs-period" ref={periodRef}>
              <button
                type="button"
                className="hs-period-btn"
                data-open={periodOpen}
                onClick={() => setPeriodOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={periodOpen}
              >
                {currentPeriodLabel}
                <ChevronDown size={14} className="hs-period-caret" />
              </button>
              {periodOpen && (
                <div className="hs-period-menu" role="listbox">
                  {PERIODS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={period === p.id}
                      data-active={period === p.id}
                      className="hs-period-item"
                      onClick={() => {
                        setPeriod(p.id);
                        setPeriodOpen(false);
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {error && <div className="hs-error">{error}</div>}
          <p className="hs-disclaimer">
            Use esta ferramenta como fonte de inspiração. Evite copiar conteúdos de outros criadores e respeite as diretrizes das plataformas.
          </p>
        </div>


        {platform === "youtube" && (
          <div className="hs-field">
            <div className="hs-label-row">
              <label className="hs-label">Mínimo de views</label>
              <span className="hs-min-tag">{formatNumber(minViews)} views</span>
            </div>
            <div className="hs-slider-wrap">
              <input
                className="hs-slider"
                type="range"
                min={0}
                max={100}
                value={sliderVal}
                onChange={(e) => onSlider(Number(e.target.value))}
                style={{ ["--val" as string]: `${sliderVal}%` }}
              />
              <span
                className="hs-slider-bubble"
                style={{ left: `${sliderVal}%` }}
                aria-hidden="true"
              >
                {formatNumber(minViews)}
              </span>
            </div>
          </div>
        )}

        <div className="hs-actions">
          <span className="hs-demo-note">
            Minerando dados reais {platform === "youtube" ? "da API do YouTube" : "do TikTok"}
          </span>
          <button
            className="hs-btn-primary"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={15} className="hs-spin" /> Pesquisando...
              </>
            ) : (
              <>
                <Search size={15} /> Pesquisar vídeos
              </>
            )}
          </button>
        </div>
      </section>

      {/* Loading */}
      {loading && (
        <div className="hs-loading">
          <div className="hs-loader-bar"><span /></div>
          <p>{loadingStatus || "Analisando vídeos em alta para essa hashtag..."}</p>
        </div>
      )}

      {/* Results */}
      {!loading && searched && lastQuery && (
        <>
          <div className="hs-summary">
            <span>
              <strong>{results.length}</strong>{" "}
              {results.length === 1 ? "vídeo" : "vídeos"} ·{" "}
              <strong>{lastQuery.tag.startsWith('#') ? lastQuery.tag : `#${lastQuery.tag}`}</strong> · últimos{" "}
              <strong>{periodLabel}</strong>
              {platform === "youtube" && (
                <>
                  {" "}· mín. <strong>{formatNumber(lastQuery.minViews)} views</strong>
                </>
              )}
            </span>
          </div>

          {results.length === 0 ? (
            <div className="hs-empty">
              <p>Nenhum vídeo encontrado com esses filtros.</p>
            </div>
          ) : (
            <section className="hs-grid">
              {results.map((v) => (
                <article key={v.id} className="hs-card">
                  <div
                    className="hs-thumb"
                    style={{ position: 'relative', overflow: 'hidden' }}
                  >
                    {v.thumbnail && (
                      <img 
                        src={v.thumbnail} 
                        alt="" 
                        referrerPolicy="no-referrer"
                        style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0, objectFit: 'cover', zIndex: 0 }}
                      />
                    )}
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.1)', zIndex: 1 }}></div>
                    <Play size={26} className="hs-thumb-play" style={{ position: 'relative', zIndex: 2 }} />
                    <span className="hs-thumb-speed" style={{ position: 'relative', zIndex: 2 }}>
                      <Flame size={10} /> {v.viralMetrics?.score || 0} Score
                    </span>
                  </div>
                  <div className="hs-card-body">
                    <div className="flex items-center gap-2 mb-1">
                      {v.platform === "tiktok" ? (
                        <Music size={14} className="text-cyan-500" />
                      ) : (
                        <Video size={14} className="text-red-500" />
                      )}
                      <h3 className="hs-card-title m-0">{v.title}</h3>
                    </div>
                    <div className="hs-card-row">
                      <span className="hs-card-views">
                        <Eye size={12} /> {formatNumber(v.views)}
                      </span>
                      <span className="hs-card-time">{v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : ""}</span>
                    </div>
                    <div className="hs-card-meta">
                      <span><Heart size={11} /> {formatNumber(v.likes)}</span>
                      <span><MessageCircle size={11} /> {formatNumber(v.comments)}</span>
                      <span className="hs-card-tag">{v.hashtags && v.hashtags[0] ? v.hashtags[0] : ""}</span>
                    </div>
                    <div className="hs-card-actions">
                      <a
                         className="hs-btn-ghost"
                         href={v.url}
                         target="_blank"
                         rel="noopener noreferrer"
                       >
                         <ArrowUpRight size={12} /> Abrir vídeo
                       </a>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}

          {nextCursor && (
            <div className="flex justify-center mt-8 mb-12">
              <button
                className="hs-btn-primary"
                onClick={handleLoadMore}
                disabled={loadingMore}
                style={{ backgroundColor: '#27272a', borderColor: '#3f3f46', width: 'auto', padding: '0 32px' }}
              >
                {loadingMore ? (
                  <>
                    <Loader2 size={15} className="hs-spin" /> Carregando...
                  </>
                ) : (
                  "Carregar mais vídeos"
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
