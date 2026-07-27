import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useEffect, useState } from "react";
import { useServerFn } from '@tanstack/react-start';
import { getTopPlayersFn } from '../services/topPlayersFn';
import { Player, TopVideo, MatchMode } from '../services/competition/types';
import {
  ChevronDown,
  Crown,
  Eye,
  Hash,
  Heart,
  Loader2,
  Medal,
  MessageCircle,
  Play,
  Search,
  Sparkles,
  Trophy,
  Clock,
  Calendar,
  TrendingUp,
  X,
  Filter,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/top-players")({
  component: TopPlayersPage,
});

type Period = "5d" | "10d" | "15d" | "30d";

const PERIODS: { id: Period; label: string; short: string; days: number }[] = [
  { id: "5d", label: "5 dias", short: "5 dias", days: 5 },
  { id: "10d", label: "10 dias", short: "10 dias", days: 10 },
  { id: "15d", label: "15 dias", short: "15 dias", days: 15 },
  { id: "30d", label: "30 dias", short: "30 dias", days: 30 },
];

function formatNumber(n: number) {
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace(".0", "") + "M";
  if (n >= 1_000)
    return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1).replace(".0", "") + "k";
  return String(n);
}

function normalizeHashtag(raw: string) {
  return raw.trim().replace(/\s+/g, "").replace(/^#+/, "");
}

function HashtagInput({
  value,
  onChange,
  placeholder,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hasError: boolean;
}) {
  return (
    <div className={`hs-input-wrap ${hasError ? "hs-input-error" : ""}`}>
      <Hash size={15} />
      <input
        className="hs-input"
        type="text"
        placeholder={placeholder}
        value={value ? `#${value}` : ""}
        onChange={(e) => onChange(normalizeHashtag(e.target.value))}
      />
    </div>
  );
}

function avatarStyle(url?: string, hue?: number): React.CSSProperties {
  if (url) {
    return {
      backgroundImage: `url(${url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  const h = hue || 0;
  return {
    background: `linear-gradient(135deg, hsl(${h} 65% 40%), hsl(${(h + 50) % 360} 65% 25%))`,
  };
}

function rankIcon(rank: number) {
  if (rank === 1) return <Crown size={12} className="tp-pos-ico tp-pos-1" />;
  if (rank === 2) return <Medal size={12} className="tp-pos-ico tp-pos-2" />;
  if (rank === 3) return <Sparkles size={12} className="tp-pos-ico tp-pos-3" />;
  return null;
}

function GrowthChart({ data }: { data: number[] }) {
  const w = 600;
  const h = 140;
  const pad = 8;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = (w - pad * 2) / Math.max(data.length - 1, 1);
  const points = data.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${points[points.length - 1][0].toFixed(1)},${h - pad} L${points[0][0].toFixed(1)},${h - pad} Z`;
  return (
    <div className="tp-chart">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="tp-chart-svg">
        <defs>
          <linearGradient id="tpGrowth" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(158,255,46,.35)" />
            <stop offset="100%" stopColor="rgba(158,255,46,0)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#tpGrowth)" />
        <path d={path} fill="none" stroke="#9EFF2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function TopPlayersPage() {
  const [tag1, setTag1] = useState("");
  const [tag2, setTag2] = useState("");
  const [period, setPeriod] = useState<Period>("15d");
  const [matchMode, setMatchMode] = useState<MatchMode>("AND");
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastQuery, setLastQuery] = useState<{ tag1: string; tag2: string; period: Period; matchMode: MatchMode } | null>(null);
  const [selected, setSelected] = useState<Player | null>(null);
  
  const [sortBy, setSortBy] = useState<'totalViews' | 'posts' | 'avgViews' | 'engagement'>('totalViews');

  const fetchTopPlayers = useServerFn(getTopPlayersFn);

  useEffect(() => {
    if (!periodOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node))
        setPeriodOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [periodOpen]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  const currentPeriodLabel = PERIODS.find((p) => p.id === period)?.label ?? "";

  const handleSearch = async () => {
    if (!tag1 || !tag2) {
      setError("Preencha as duas hashtags para buscar o ranking.");
      return;
    }
    setError(null);
    setLoading(true);
    setPlayers([]);
    setLastQuery(null);

    const periodDays = PERIODS.find(p => p.id === period)?.days || 15;

    try {
      const result = await fetchTopPlayers({
        data: {
          tag1,
          tag2,
          periodDays,
          matchMode,
          maxPages: 3 // Configurável, max 3 páginas = ~150 resultados p/ economizar cota (em produção podemos usar 5-10)
        }
      });

      if (result.success) {
        setPlayers(result.players || []);
        setLastQuery({ tag1, tag2, period, matchMode });
      } else {
        setError(result.error || "Erro desconhecido ao buscar.");
      }
    } catch (err: any) {
      setError(err.message || "Erro de rede ao buscar.");
    } finally {
      setLoading(false);
    }
  };

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [players, sortBy]);

  const totals = useMemo(
    () =>
      players.reduce(
        (acc, p) => ({ videos: acc.videos + p.posts, views: acc.views + p.totalViews }),
        { videos: 0, views: 0 },
      ),
    [players],
  );

  const queryPeriod = PERIODS.find((p) => p.id === (lastQuery?.period ?? period));
  const queryPeriodShort = queryPeriod?.short ?? "";

  return (
    <div className="hs-page">

      {/* Search card */}
      <section className="tp-search">
        <div className="tp-search-head">
          <h2 className="tp-search-title">Analisar competição (API Real)</h2>
        </div>

        <div className="tp-form" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
          <div className="tp-field">
            <label className="tp-field-label">Hashtag 1</label>
            <HashtagInput
              value={tag1}
              onChange={(v) => {
                setTag1(v);
                if (error) setError(null);
              }}
              placeholder="Ex: #Cariani"
              hasError={!!error && !tag1}
            />
          </div>
          <div className="tp-field">
            <label className="tp-field-label">Hashtag 2</label>
            <HashtagInput
              value={tag2}
              onChange={(v) => {
                setTag2(v);
                if (error) setError(null);
              }}
              placeholder="Ex: #Keoto"
              hasError={!!error && !tag2}
            />
          </div>
          <div className="tp-field tp-field-period">
            <label className="tp-field-label">Período</label>
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
                <div className="hs-period-menu" style={{ left: 0, right: 0 }} role="listbox">
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
        </div>

        {error && <div className="hs-error">{error}</div>}

        <div className="tp-search-foot">
          <span className="hs-demo-note" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Integrado ao YouTube Data API. Inclui paginação dinâmica e cache no Supabase.
          </span>
          <button className="hs-btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={15} className="hs-spin" /> Buscando...
              </>
            ) : (
              <>
                <Search size={15} /> Buscar ranking
              </>
            )}
          </button>
        </div>
      </section>

      {loading && (
        <div className="hs-loading">
          <div className="hs-loader-bar">
            <span />
          </div>
          <p>Pesquisando vídeos, somando estatísticas e validando cache...</p>
        </div>
      )}

      {!loading && lastQuery && (
        <>
          <div className="tp-recap">
            <h3 className="tp-recap-title">
              Ranking de <strong>#{lastQuery.tag1}</strong>
              <span className="tp-recap-plus"> {lastQuery.matchMode} </span>
              <strong>#{lastQuery.tag2}</strong>
              <span className="tp-recap-period">
                nos últimos {queryPeriodShort}
              </span>
            </h3>
            <div className="tp-recap-cards">
              <div className="tp-recap-card">
                <span className="tp-recap-label">
                  <Trophy size={11} /> Players encontrados
                </span>
                <span className="tp-recap-value">{players.length}</span>
              </div>
              <div className="tp-recap-card">
                <span className="tp-recap-label">
                  <Play size={11} /> Vídeos analisados
                </span>
                <span className="tp-recap-value">{formatNumber(totals.videos)}</span>
              </div>
              <div className="tp-recap-card">
                <span className="tp-recap-label">
                  <Eye size={11} /> Views totais
                </span>
                <span className="tp-recap-value">{formatNumber(totals.views)}</span>
              </div>
            </div>
          </div>

          {players.length === 0 ? (
            <div className="hs-empty">
              <p>Nenhum player encontrado para essas hashtags nesse período.</p>
            </div>
          ) : (
            <section className="tp-board">
              <div className="tp-board-head" style={{ cursor: 'pointer' }}>
                <span className="tp-col-pos">POS</span>
                <span className="tp-col-player">PLAYER</span>
                <span className="tp-col-num" onClick={() => setSortBy('totalViews')}>
                  VIEWS {sortBy === 'totalViews' && <Filter size={12} />}
                </span>
                <span className="tp-col-num" onClick={() => setSortBy('posts')}>
                  POSTS {sortBy === 'posts' && <Filter size={12} />}
                </span>
                <span className="tp-col-num" onClick={() => setSortBy('avgViews')}>
                  MÉDIA {sortBy === 'avgViews' && <Filter size={12} />}
                </span>
                <span className="tp-col-num" onClick={() => setSortBy('engagement')}>
                  ENGAJAMENTO {sortBy === 'engagement' && <Filter size={12} />}
                </span>
                <span className="tp-col-action">AÇÃO</span>
              </div>
              <div className="tp-board-body">
                {sortedPlayers.map((p, idx) => {
                  const rank = idx + 1;
                  return (
                    <div
                      key={p.id}
                      className={`tp-trow ${rank <= 3 ? `tp-trow-top tp-trow-top-${rank}` : ""}`}
                    >
                      <div className="tp-col-pos">
                        <span className="tp-pos-num">{rank}º</span>
                        {rankIcon(rank)}
                      </div>
                      <div className="tp-col-player">
                        <div className="tp-avatar tp-avatar-sm" style={avatarStyle(p.avatarUrl, p.avatarHue)}>
                          {!p.avatarUrl && p.name.charAt(0)}
                        </div>
                        <span className="tp-player-name">{p.name}</span>
                      </div>
                      <div className="tp-col-num" data-label="Views">
                        {formatNumber(p.totalViews)}
                      </div>
                      <div className="tp-col-num" data-label="Posts">
                        {p.posts}
                      </div>
                      <div className="tp-col-num" data-label="Média">
                        {formatNumber(p.avgViews)}
                      </div>
                      <div className="tp-col-num" data-label="Engajamento">
                        {p.engagement}%
                      </div>
                      <div className="tp-col-action">
                        <button
                          className="hs-btn-ghost hs-btn-accent tp-details-btn"
                          onClick={() => setSelected(p)}
                        >
                          Analisar Player
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {selected && (
        <div className="tp-modal-overlay" onClick={() => setSelected(null)}>
          <div className="tp-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="tp-modal-close"
              onClick={() => setSelected(null)}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            <div className="tp-modal-head">
              <div className="tp-avatar tp-avatar-lg" style={avatarStyle(selected.avatarUrl, selected.avatarHue)}>
                {!selected.avatarUrl && selected.name.charAt(0)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="tp-modal-rank">
                  #{sortedPlayers.findIndex((p) => p.id === selected.id) + 1} no ranking
                </div>
                <h2 className="tp-modal-name">{selected.name}</h2>
              </div>
            </div>

            <div className="tp-stat-grid">
              <div className="tp-stat">
                <span>Views totais</span>
                <strong>{formatNumber(selected.totalViews)}</strong>
              </div>
              <div className="tp-stat">
                <span>Posts</span>
                <strong>{selected.posts}</strong>
              </div>
              <div className="tp-stat">
                <span>Média por vídeo</span>
                <strong>{formatNumber(selected.avgViews)}</strong>
              </div>
              <div className="tp-stat">
                <span>Engajamento</span>
                <strong>{selected.engagement}%</strong>
              </div>
              <div className="tp-stat">
                <span>Posts por dia</span>
                <strong>{selected.postsPerDay}</strong>
              </div>
              <div className="tp-stat">
                <span>Último vídeo</span>
                <strong>{selected.lastVideoAgo}</strong>
              </div>
            </div>

            <div className="tp-modal-section">
              <h4>
                <Clock size={13} /> Horários que mais posta
              </h4>
              <div className="tp-chips">
                {selected.topHours.map((h) => (
                  <span key={h} className="tp-chip">
                    {h}
                  </span>
                ))}
                <span className="tp-chip tp-chip-accent">Melhor: {selected.bestHour}</span>
              </div>
            </div>

            <div className="tp-modal-section">
              <h4>
                <TrendingUp size={13} /> Views por Dia de Publicação
              </h4>
              <GrowthChart data={selected.growth} />
            </div>

            <div className="tp-modal-section">
              <h4>
                <Sparkles size={13} /> Top 5 vídeos
              </h4>
              <div className="tp-videos">
                {selected.topVideos.map((v, i) => (
                  <a
                    key={i}
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tp-video"
                  >
                    <div
                      className="tp-video-thumb"
                      style={{
                        backgroundImage: v.thumbUrl ? `url(${v.thumbUrl})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundColor: !v.thumbUrl ? '#333' : 'transparent'
                      }}
                    >
                      {!v.thumbUrl && <Play size={22} />}
                    </div>
                    <div className="tp-video-body">
                      <div className="tp-video-title">{v.title}</div>
                      <div className="tp-video-meta">
                        <span>
                          <Eye size={11} /> {formatNumber(v.views)}
                        </span>
                        <span>
                          <Heart size={11} /> {formatNumber(v.likes)}
                        </span>
                        <span>
                          <MessageCircle size={11} /> {formatNumber(v.comments)}
                        </span>
                        <span>
                          <Calendar size={11} /> há {v.daysAgo}d · {v.postedAt}
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
