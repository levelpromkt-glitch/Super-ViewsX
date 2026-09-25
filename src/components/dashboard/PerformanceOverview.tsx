import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { Eye, Trophy, Link2, ExternalLink, RefreshCw, Loader2, ListVideo } from "lucide-react";
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const PLATFORM_LABELS: Record<string, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram" };
const PLATFORM_COLORS: Record<string, string> = { tiktok: "#25F4EE", youtube: "#FF3B3B", instagram: "#E1306C" };
const PLATFORM_LOGOS: Record<string, string> = { tiktok: "/tiktok-logo.png", youtube: "/youtube-logo.png" };
const PERIODS: { value: PerformancePeriod; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "72h", label: "72h" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

function PlatformBadge({ platform }: { platform: string }) {
  const logo = PLATFORM_LOGOS[platform];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".72rem", color: "var(--text-muted)" }}>
      {logo ? (
        <img src={logo} alt="" style={{ width: 13, height: 13, objectFit: "contain" }} />
      ) : (
        <span style={{ width: 8, height: 8, borderRadius: 999, background: PLATFORM_COLORS[platform] || "var(--text-muted)" }} />
      )}
      {PLATFORM_LABELS[platform] || platform}
    </span>
  );
}

function PostRow({ post, rank }: { post: PerformancePost; rank?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border-soft)" }}>
      {rank !== undefined && (
        <span style={{ width: 18, flexShrink: 0, fontSize: ".78rem", fontWeight: 700, color: "var(--primary-lime)" }}>{rank}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: ".8rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {post.title}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
          <PlatformBadge platform={post.platform} />
          <span className="tr-muted" style={{ fontSize: ".72rem" }}>· {post.accountLabel} · {formatDate(post.publishedAt)}</span>
        </div>
      </div>
      <span style={{ fontSize: ".82rem", fontWeight: 700, flexShrink: 0 }}>{formatNumber(post.views)}</span>
      {post.url && (
        <a href={post.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, color: "var(--text-muted)", display: "flex" }}>
          <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}

export function PerformanceOverview() {
  const [period, setPeriod] = useState<PerformancePeriod>("7d");
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
      <section className="tr-card" style={{ padding: 20, marginBottom: 24 }}>
        <p className="tr-error" style={{ margin: 0 }}>{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="tr-card" style={{ padding: 20, marginBottom: 24 }}>
        <p className="tr-muted" style={{ margin: 0 }}>Carregando desempenho...</p>
      </section>
    );
  }

  if (data.accounts.length === 0) {
    return (
      <section className="tr-card" style={{ padding: 20, marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <Link2 size={18} className="tr-icon-lime" />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Conecte uma conta pra ver seu desempenho aqui</p>
          <p className="tr-muted" style={{ margin: 0, fontSize: ".8rem" }}>TikTok, YouTube ou Instagram — vemos os posts direto da conta.</p>
        </div>
        <Link to="/dashboard/configuracoes" className="hs-btn-ghost">Conectar conta</Link>
      </section>
    );
  }

  const avgViews = data.postsCount > 0 ? Math.round(data.totalViews / data.postsCount) : 0;
  const platformsPresent = Array.from(new Set(data.posts.map((p) => p.platform)));
  const top5 = data.posts.slice(0, 5);

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className="hs-btn-ghost"
              style={{
                flex: "none",
                borderColor: period === p.value ? "var(--primary-lime)" : undefined,
                color: period === p.value ? "var(--primary-lime)" : undefined,
              }}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select className="tr-input" style={{ padding: "8px 10px" }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="all">Todas as contas</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.platformLabel})
              </option>
            ))}
          </select>
          <button className="hs-btn-ghost" style={{ flex: "none" }} onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 size={12} className="tr-spin" /> : <RefreshCw size={12} />}
            Atualizar
          </button>
        </div>
      </div>

      <div className="hs-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginBottom: 16 }}>
        <div className="tr-card" style={{ padding: 16 }}>
          <span className="tr-muted" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>Views no período</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{formatNumber(data.totalViews)}</div>
        </div>
        <div className="tr-card" style={{ padding: 16 }}>
          <span className="tr-muted" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>Posts no período</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{data.postsCount}</div>
        </div>
        <div className="tr-card" style={{ padding: 16 }}>
          <span className="tr-muted" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>Média por post</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{formatNumber(avgViews)}</div>
        </div>
        <div className="tr-card" style={{ padding: 16 }}>
          <span className="tr-muted" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>Contas conectadas</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{data.accounts.length}</div>
        </div>
      </div>

      <div className="tr-card" style={{ padding: "16px 20px", marginBottom: 16 }}>
        <h3 style={{ fontSize: ".85rem", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <Eye size={14} className="tr-icon-lime" /> Views por {period === "24h" || period === "72h" ? "hora" : "dia"}
        </h3>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                {(["tiktok", "youtube", "instagram"] as const).map((p) => (
                  <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0} />
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
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={formatNumber} width={36} />
              <Tooltip
                formatter={(value: number, name: string) => [formatNumber(value), PLATFORM_LABELS[name] || name]}
                labelFormatter={formatBucketLabel}
                contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: ".78rem" }}
              />
              <Legend
                formatter={(name: string) => PLATFORM_LABELS[name] || name}
                wrapperStyle={{ fontSize: ".74rem" }}
              />
              {platformsPresent.length === 0 && (
                <Area type="monotone" dataKey="views" stroke="var(--primary-lime)" strokeWidth={2} fill="none" />
              )}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div className="tr-card" style={{ padding: "16px 20px" }}>
          <h3 style={{ fontSize: ".85rem", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
            <Trophy size={14} className="tr-icon-lime" /> Top 5 do período
          </h3>
          {top5.length > 0 ? (
            top5.map((p, i) => <PostRow key={`${p.url}-${i}`} post={p} rank={i + 1} />)
          ) : (
            <p className="tr-muted" style={{ fontSize: ".8rem" }}>Nenhum post nesse período.</p>
          )}
        </div>

        {accountId === "all" && data.byAccount.length > 1 && (
          <div className="tr-card" style={{ padding: "16px 20px" }}>
            <h3 style={{ fontSize: ".85rem", margin: "0 0 12px" }}>Por conta</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {data.byAccount
                .slice()
                .sort((a, b) => b.views - a.views)
                .map((a) => (
                  <div key={a.accountId} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: ".82rem", padding: "8px 0", borderTop: "1px solid var(--border-soft)" }}>
                    <span style={{ flex: 1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                    <PlatformBadge platform={a.platform} />
                    <span style={{ width: 80, textAlign: "right", fontWeight: 700 }}>{formatNumber(a.views)}</span>
                    <span className="tr-muted" style={{ width: 60, textAlign: "right" }}>{a.posts} posts</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="tr-card" style={{ padding: "16px 20px" }}>
        <h3 style={{ fontSize: ".85rem", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
          <ListVideo size={14} className="tr-icon-lime" /> Todos os posts do período
        </h3>
        {data.posts.length > 0 ? (
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {data.posts.map((p, i) => (
              <PostRow key={`${p.url}-${i}`} post={p} />
            ))}
          </div>
        ) : (
          <p className="tr-muted" style={{ fontSize: ".8rem" }}>Nenhum post nesse período.</p>
        )}
      </div>

      {error && (
        <div className="tr-error" style={{ marginTop: 12, fontSize: ".78rem" }}>{error}</div>
      )}
    </section>
  );
}
