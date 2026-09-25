import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { Eye, Flame, Link2, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import {
  PerformanceService,
  PerformanceError,
  PerformanceOverview as PerformanceData,
  PerformancePeriod,
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
const PERIODS: { value: PerformancePeriod; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "72h", label: "72h" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

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

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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

      <div className="hs-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 16 }}>
        <div className="tr-card" style={{ padding: 16 }}>
          <span className="tr-muted" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>Views no período</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{formatNumber(data.totalViews)}</div>
        </div>
        <div className="tr-card" style={{ padding: 16 }}>
          <span className="tr-muted" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>Posts no período</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{data.postsCount}</div>
        </div>
        <div className="tr-card" style={{ padding: 16 }}>
          <span className="tr-muted" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>Contas conectadas</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{data.accounts.length}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div className="tr-card" style={{ padding: "16px 20px" }}>
          <h3 style={{ fontSize: ".85rem", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <Eye size={14} className="tr-icon-lime" /> Views por {period === "24h" || period === "72h" ? "hora" : "dia"}
          </h3>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary-lime)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary-lime)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="bucket"
                  tickFormatter={formatBucketLabel}
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(data.series.length / 7) - 1)}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [name === "views" ? formatNumber(value) : value, name === "views" ? "Views" : "Posts"]}
                  labelFormatter={formatBucketLabel}
                  contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: ".78rem" }}
                />
                <Area type="monotone" dataKey="views" stroke="var(--primary-lime)" strokeWidth={2} fill="url(#viewsGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="tr-card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: ".85rem", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <Flame size={14} className="tr-icon-lime" /> Top clipe do período
          </h3>
          {data.topClip ? (
            <>
              <div style={{ fontSize: "1.7rem", fontWeight: 700, color: "var(--primary-lime)" }}>
                {formatNumber(data.topClip.views)}
              </div>
              <span className="tr-muted" style={{ fontSize: ".72rem" }}>views</span>
              <p style={{ fontSize: ".82rem", fontWeight: 600, margin: "10px 0 2px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {data.topClip.title}
              </p>
              <span className="tr-muted" style={{ fontSize: ".72rem" }}>
                {PLATFORM_LABELS[data.topClip.platform] || data.topClip.platform}
              </span>
              {data.topClip.url && (
                <a
                  href={data.topClip.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hs-btn-ghost"
                  style={{ marginTop: "auto", alignSelf: "flex-start" }}
                >
                  Ver clipe <ExternalLink size={12} />
                </a>
              )}
            </>
          ) : (
            <p className="tr-muted" style={{ fontSize: ".8rem" }}>Nenhum post nesse período.</p>
          )}
        </div>
      </div>

      {accountId === "all" && data.byAccount.length > 1 && (
        <div className="tr-card" style={{ padding: "16px 20px", marginTop: 16 }}>
          <h3 style={{ fontSize: ".85rem", margin: "0 0 12px" }}>Por conta</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.byAccount.map((a) => (
              <div key={a.accountId} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: ".82rem" }}>
                <span style={{ flex: 1, fontWeight: 600 }}>{a.label}</span>
                <span className="tr-muted" style={{ width: 70 }}>{PLATFORM_LABELS[a.platform] || a.platform}</span>
                <span style={{ width: 90, textAlign: "right" }}>{formatNumber(a.views)} views</span>
                <span className="tr-muted" style={{ width: 70, textAlign: "right" }}>{a.posts} posts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="tr-error" style={{ marginTop: 12, fontSize: ".78rem" }}>{error}</div>
      )}
    </section>
  );
}
