import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useEffect, useState } from "react";
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
} from "lucide-react";

export const Route = createFileRoute("/dashboard/top-players")({
  component: TopPlayersPage,
});

type Period = "5d" | "10d" | "15d" | "30d" | "all";

const PERIODS: { id: Period; label: string; short: string; days: number }[] = [
  { id: "5d", label: "5 dias", short: "5 dias", days: 5 },
  { id: "10d", label: "10 dias", short: "10 dias", days: 10 },
  { id: "15d", label: "15 dias", short: "15 dias", days: 15 },
  { id: "30d", label: "30 dias", short: "30 dias", days: 30 },
  { id: "all", label: "Todo o período", short: "todo o período", days: 9999 },
];

type TopVideo = {
  title: string;
  views: number;
  likes: number;
  comments: number;
  daysAgo: number;
  postedAt: string;
  thumbHue: number;
  url: string;
};

type Player = {
  id: string;
  name: string;
  avatarHue: number;
  totalViews: number;
  posts: number;
  avgViews: number;
  engagement: number;
  bestViews: number;
  postsPerDay: number;
  topHours: string[];
  bestHour: string;
  lastVideoAgo: string;
  topVideos: TopVideo[];
  growth: number[];
};

const PLAYER_NAMES = [
  "Cortes Alpha",
  "ViralCuts BR",
  "ClipMaster Pro",
  "TopClips HD",
  "Highlights Plus",
  "ShortMania",
  "CutKing",
  "ClipNation",
  "MomentosBR",
  "PrimeClips",
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

function seededRand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generatePlayers(tag1: string, tag2: string, period: Period): Player[] {
  const rand = seededRand(`${tag1}|${tag2}|${period}`);
  const periodDays = PERIODS.find((p) => p.id === period)?.days ?? 15;
  const factor = period === "all" ? 4 : Math.max(0.5, periodDays / 15);

  return PLAYER_NAMES.slice(0, 10).map((name, i) => {
    const baseViews = Math.round((1_200_000 - i * 95_000) * (0.7 + rand() * 0.6) * factor);
    const posts = Math.max(
      4,
      Math.round((28 - i * 1.8) * (0.7 + rand() * 0.6) * Math.min(factor, 2.5)),
    );
    const avg = Math.round(baseViews / posts);
    const best = Math.round(avg * (1.8 + rand() * 1.6));
    const engagement = Math.round((14 - i * 0.7 + rand() * 2) * 10) / 10;
    const postsPerDay = Math.round((posts / Math.min(periodDays, 60)) * 10) / 10;
    const hours = ["18h", "19h", "20h", "21h", "22h"].sort(() => rand() - 0.5);
    const topHours = hours.slice(0, 3);
    const bestHour = topHours[0];
    const topVideos: TopVideo[] = Array.from({ length: 5 }).map((_, k) => {
      const views = Math.round(best * (1 - k * 0.15) * (0.9 + rand() * 0.2));
      const vid = Array.from({ length: 11 })
        .map(() => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"[Math.floor(rand() * 64)])
        .join("");
      return {
        title: [
          `O melhor corte de #${tag1} dessa semana`,
          `Reação inacreditável na competição #${tag2}`,
          `Esse momento de #${tag1} viralizou no #${tag2}`,
          `Top jogada que ninguém viu em #${tag2}`,
          `Compilado #${tag1} que está bombando`,
        ][(i + k) % 5],
        views,
        likes: Math.round(views * (0.07 + rand() * 0.04)),
        comments: Math.round(views * (0.004 + rand() * 0.003)),
        daysAgo: Math.max(1, Math.round(rand() * Math.min(periodDays, 30))),
        postedAt: `${17 + Math.floor(rand() * 6)}h${String(Math.floor(rand() * 60)).padStart(2, "0")}`,
        thumbHue: Math.floor(rand() * 360),
        url: `https://www.youtube.com/watch?v=${vid}`,
      };
    });
    const points = Math.min(Math.max(periodDays, 7), 30);
    let cur = avg * 0.6;
    const growth: number[] = [];
    for (let g = 0; g < points; g++) {
      cur = cur * (0.95 + rand() * 0.18);
      growth.push(Math.max(1000, Math.round(cur)));
    }
    return {
      id: `p${i}`,
      name,
      avatarHue: Math.floor(rand() * 360),
      totalViews: baseViews,
      posts,
      avgViews: avg,
      engagement,
      bestViews: best,
      postsPerDay,
      topHours,
      bestHour,
      lastVideoAgo: `há ${Math.max(1, Math.floor(rand() * 12))}h`,
      topVideos,
      growth,
    };
  });
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

function avatarStyle(hue: number): React.CSSProperties {
  return {
    background: `linear-gradient(135deg, hsl(${hue} 65% 40%), hsl(${(hue + 50) % 360} 65% 25%))`,
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
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<{ tag1: string; tag2: string; period: Period } | null>(
    null,
  );
  const [selected, setSelected] = useState<Player | null>(null);

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

  const handleSearch = () => {
    if (!tag1 || !tag2) {
      setError("Preencha as duas hashtags para buscar o ranking.");
      return;
    }
    setError(null);
    setLoading(true);
    setSearched(false);
    setTimeout(() => {
      setLastQuery({ tag1, tag2, period });
      setLoading(false);
      setSearched(true);
    }, 1000);
  };

  const players = useMemo(() => {
    if (!lastQuery) return [];
    return generatePlayers(lastQuery.tag1, lastQuery.tag2, lastQuery.period);
  }, [lastQuery]);

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
          <h2 className="tp-search-title">Analisar competição</h2>
        </div>


        <div className="tp-form">
          <div className="tp-field">
            <label className="tp-field-label">Influenciador ou marca</label>
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
            <label className="tp-field-label">Plataforma ou competição</label>
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
          <span className="hs-demo-note">
            Dados demonstrativos. Em breve esta função será conectada à API real do YouTube.
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
          <p>Analisando competidores e montando o ranking...</p>
        </div>
      )}

      {/* Empty state removed for a cleaner layout */}


      {!loading && searched && lastQuery && (
        <>
          <div className="tp-recap">
            <h3 className="tp-recap-title">
              Ranking de <strong>#{lastQuery.tag1}</strong>
              <span className="tp-recap-plus">+</span>
              <strong>#{lastQuery.tag2}</strong>
              <span className="tp-recap-period">
                {lastQuery.period === "all"
                  ? "em todo o período"
                  : `nos últimos ${queryPeriodShort}`}
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
              <div className="tp-board-head">
                <span className="tp-col-pos">POS</span>
                <span className="tp-col-player">PLAYER</span>
                <span className="tp-col-num">VIEWS</span>
                <span className="tp-col-num">POSTS</span>
                <span className="tp-col-num">MÉDIA</span>
                <span className="tp-col-num">ENGAJAMENTO</span>
                <span className="tp-col-action">AÇÃO</span>
              </div>
              <div className="tp-board-body">
                {players.map((p, idx) => {
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
                        <div className="tp-avatar tp-avatar-sm" style={avatarStyle(p.avatarHue)}>
                          {p.name.charAt(0)}
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
              <div className="tp-avatar tp-avatar-lg" style={avatarStyle(selected.avatarHue)}>
                {selected.name.charAt(0)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="tp-modal-rank">
                  #{players.findIndex((p) => p.id === selected.id) + 1} no ranking
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
                <TrendingUp size={13} /> Crescimento no período
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
                        background: `linear-gradient(135deg, hsl(${v.thumbHue} 55% 18%), hsl(${(v.thumbHue + 40) % 360} 60% 28%))`,
                      }}
                    >
                      <Play size={22} />
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
