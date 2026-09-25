import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { Eye, Flame, Link2, ExternalLink } from "lucide-react";
import { PerformanceService, PerformanceError, PerformanceOverview as PerformanceData } from "@/services/performanceService";

function formatNumber(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace(".0", "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1).replace(".0", "") + "k";
  return String(n);
}

const PLATFORM_LABELS: Record<string, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram" };

export function PerformanceOverview() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    PerformanceService.getOverview()
      .then(setData)
      .catch((err) => setError(err instanceof PerformanceError ? err.message : "Erro ao carregar desempenho."));
  }, []);

  if (error) {
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

  if (data.accountsCount === 0) {
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
      <div className="hs-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 16 }}>
        <div className="tr-card" style={{ padding: 16 }}>
          <span className="tr-muted" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>Views totais</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{formatNumber(data.totalViews)}</div>
        </div>
        <div className="tr-card" style={{ padding: 16 }}>
          <span className="tr-muted" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>Posts recentes</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{data.postsCount}</div>
        </div>
        <div className="tr-card" style={{ padding: 16 }}>
          <span className="tr-muted" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>Contas conectadas</span>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{data.accountsCount}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div className="tr-card" style={{ padding: "16px 20px" }}>
          <h3 style={{ fontSize: ".85rem", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <Eye size={14} className="tr-icon-lime" /> Views — últimos 30 dias
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
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)}
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <Tooltip
                  formatter={(value: number) => [formatNumber(value), "Views"]}
                  labelFormatter={(d: string) => d}
                  contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: ".78rem" }}
                />
                <Area type="monotone" dataKey="views" stroke="var(--primary-lime)" strokeWidth={2} fill="url(#viewsGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="tr-card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: ".85rem", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <Flame size={14} className="tr-icon-lime" /> Top clipe
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
                {PLATFORM_LABELS[data.topClip.platform] || data.topClip.platform} · {data.topClip.accountLabel}
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
            <p className="tr-muted" style={{ fontSize: ".8rem" }}>Nenhum post encontrado ainda.</p>
          )}
        </div>
      </div>

      {data.accountErrors.length > 0 && (
        <div className="tr-error" style={{ marginTop: 12, fontSize: ".78rem" }}>
          {data.accountErrors.map((e) => (
            <div key={e.accountId}>
              {e.label} ({PLATFORM_LABELS[e.platform] || e.platform}): {e.message}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
