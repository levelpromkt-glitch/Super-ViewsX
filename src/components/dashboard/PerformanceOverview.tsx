import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { Eye, Trophy, Link2, ExternalLink, RefreshCw, Loader2, ListVideo, Users2 } from "lucide-react";
import {
  PerformanceService,
  PerformanceError,
  PerformanceOverview as PerformanceData,
  PerformancePeriod,
  PerformancePost,
} from "@/services/performanceService";

function formatNumber(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace(".0", "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1).replace(".0", "") + "k";
  return String(n);
}

function formatBucketLabel(bucket: string) {
  // Hourly buckets look like "2026-09-26T14", daily like "2026-09-26".
  if (bucket.length === 13) return bucket.slice(11, 13) + "h";
  return bucket.slice(8, 10) + "/" + bucket.slice(5, 7);
}

const PLATFORM_LABELS: Record<string, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram" };
const PLATFORM_COLORS: Record<string, string> = { tiktok: "#38E07B", youtube: "#FF3B3B", instagram: "#FFC850" };
const PERIODS: { value: PerformancePeriod; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "72h", label: "72h" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

function PlatformTag({ platform }: { platform: string }) {
  return (
    <span className="ps-platform">
      <span className="ps-platform-dot" style={{ background: PLATFORM_COLORS[platform] || "var(--text-muted)" }} />
      {PLATFORM_LABELS[platform] || platform}
    </span>
  );
}

function PostTableRows({ posts, ranked }: { posts: PerformancePost[]; ranked?: boolean }) {
  return (
    <>
      {posts.map((p, i) => (
        <tr key={`${p.url}-${i}`}>
          {ranked && <td style={{ width: 28, color: "var(--primary-lime)", fontWeight: 700 }}>{i + 1}</td>}
          <td>
            <div className="admin-cell-name" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.title}
            </div>
          </td>
          <td><PlatformTag platform={p.platform} /></td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatNumber(p.views)}</td>
          <td className="admin-col-actions">
            {p.url && (
              <a href={p.url} target="_blank" rel="noreferrer" className="admin-icon-btn" title="Ver post" aria-label="Ver post">
                <ExternalLink size={14} />
              </a>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

export function PerformanceOverview() {
  const [period, setPeriod] = useState<PerformancePeriod>("24h");
  const [accountId, setAccountId] = useState("all");
  const [data, setData] = useState<PerformanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = (p: PerformancePeriod, acc: string) => {
    PerformanceService.getOverview(p, acc)
      .then(setData)
      .catch((err) => setError(err instanceof PerformanceError ? err.message : "Erro ao carregar desempenho."));
  };

  useEffect(() => {
    load(period, accountId);
  }, [period, accountId]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await PerformanceService.syncNow();
      load(period, accountId);
    } catch (err: any) {
      setError(err instanceof PerformanceError ? err.message : "Erro ao atualizar.");
    } finally {
      setSyncing(false);
    }
  };

  if (error && !data) {
    return (
      <section className="ps-section">
        <p className="tr-error" style={{ margin: 0 }}>{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="ps-section">
        <p className="tr-muted" style={{ margin: 0 }}>Carregando desempenho...</p>
      </section>
    );
  }

  if (data.accounts.length === 0) {
    return (
      <section className="ps-section" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link2 size={18} className="tr-icon-lime" />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Conecte uma conta pra ver seu desempenho aqui</p>
          <p className="tr-muted" style={{ margin: 0, fontSize: ".8rem" }}>TikTok, YouTube ou Instagram — vemos os posts direto da conta.</p>
        </div>
        <Link to="/dashboard/configuracoes" className="hs-btn-ghost" style={{ flex: "none" }}>Conectar conta</Link>
      </section>
    );
  }

  const avgViews = data.postsCount > 0 ? Math.round(data.totalViews / data.postsCount) : 0;
  const top5 = data.posts.slice(0, 5);
  const byAccountSorted = data.byAccount.slice().sort((a, b) => b.views - a.views);

  return (
    <div>
      <div className="ps-toolbar">
        <div className="ps-segment">
          {PERIODS.map((p) => (
            <button key={p.value} className={period === p.value ? "active" : ""} onClick={() => setPeriod(p.value)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="ps-toolbar-right">
          <select className="ps-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="all">Todas as contas</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.platformLabel})
              </option>
            ))}
          </select>
          <button className="ps-refresh" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 size={13} className="tr-spin" /> : <RefreshCw size={13} />}
            Atualizar
          </button>
        </div>
      </div>

      <div className="ps-kpis">
        <div className="ps-kpi">
          <span className="ps-kpi-label"><Eye size={12} /> Views no período</span>
          <div className="ps-kpi-value accent">{formatNumber(data.totalViews)}</div>
        </div>
        <div className="ps-kpi">
          <span className="ps-kpi-label"><ListVideo size={12} /> Posts no período</span>
          <div className="ps-kpi-value">{data.postsCount}</div>
        </div>
        <div className="ps-kpi">
          <span className="ps-kpi-label"><Trophy size={12} /> Média por post</span>
          <div className="ps-kpi-value">{formatNumber(avgViews)}</div>
        </div>
        <div className="ps-kpi">
          <span className="ps-kpi-label"><Users2 size={12} /> Contas conectadas</span>
          <div className="ps-kpi-value">{data.accounts.length}</div>
        </div>
      </div>

      <div className="ps-section">
        <h3 className="ps-section-title">
          <Eye size={14} className="tr-icon-lime" /> Views por {period === "24h" || period === "72h" ? "hora" : "dia"}
        </h3>
        <div style={{ height: 240, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {(["tiktok", "youtube", "instagram"] as const).map((p) => (
                  <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.03} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis
                dataKey="bucket"
                tickFormatter={formatBucketLabel}
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                axisLine={false}
                tickLine={false}
                interval={Math.max(0, Math.floor(data.series.length / 7) - 1)}
              />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={formatNumber} width={38} />
              <Tooltip
                formatter={(value: number, name: string) => [formatNumber(value), PLATFORM_LABELS[name] || name]}
                labelFormatter={formatBucketLabel}
                contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: ".78rem" }}
              />
              <Legend formatter={(name: string) => PLATFORM_LABELS[name] || name} wrapperStyle={{ fontSize: ".74rem" }} />
              {(["tiktok", "youtube", "instagram"] as const).map((p) => (
                <Area
                  key={p}
                  type="monotone"
                  dataKey={p}
                  stackId="1"
                  stroke={PLATFORM_COLORS[p]}
                  strokeWidth={1.5}
                  fill={`url(#grad-${p})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="ps-grid-2">
        <div className="ps-section" style={{ marginBottom: 0 }}>
          <h3 className="ps-section-title"><Trophy size={14} className="tr-icon-lime" /> Top 5 do período</h3>
          {top5.length > 0 ? (
            <div className="ps-table-scroll">
              <table className="admin-table">
                <tbody>
                  <PostTableRows posts={top5} ranked />
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ps-empty">Nenhum post nesse período.</p>
          )}
        </div>

        {accountId === "all" && byAccountSorted.length > 1 ? (
          <div className="ps-section" style={{ marginBottom: 0 }}>
            <h3 className="ps-section-title"><Users2 size={14} className="tr-icon-lime" /> Por conta</h3>
            <div className="ps-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Conta</th>
                    <th>Rede</th>
                    <th style={{ textAlign: "right" }}>Views</th>
                    <th style={{ textAlign: "right" }}>Posts</th>
                  </tr>
                </thead>
                <tbody>
                  {byAccountSorted.map((a) => (
                    <tr key={a.accountId}>
                      <td className="admin-cell-name">{a.label}</td>
                      <td><PlatformTag platform={a.platform} /></td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{formatNumber(a.views)}</td>
                      <td style={{ textAlign: "right" }} className="admin-cell-sub">{a.posts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {error && <div className="tr-error" style={{ marginTop: 12, fontSize: ".78rem" }}>{error}</div>}
    </div>
  );
}
