import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, CheckCircle2, Link2, Loader2, LogOut } from "lucide-react";

export const Route = createFileRoute("/dashboard/configuracoes")({
  component: ConfiguracoesPage,
});

import {
  SocialAccountsService,
  SocialAccountsError,
  ConnectedAccount,
  SocialPlatform,
} from "@/services/socialAccountsService";

const PLATFORMS: {
  id: SocialPlatform;
  label: string;
  logo?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  available: boolean;
}[] = [
  { id: "tiktok", label: "TikTok", logo: "/tiktok-logo.png", available: true },
  { id: "youtube", label: "YouTube", logo: "/youtube-logo.png", available: false },
  { id: "instagram", label: "Instagram", icon: Camera, available: false },
];

function ConfiguracoesPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectingPlatform, setConnectingPlatform] = useState<SocialPlatform | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadAccounts = async () => {
    try {
      const list = await SocialAccountsService.listConnected();
      setAccounts(list);
    } catch (err: any) {
      setError(err instanceof SocialAccountsError ? err.message : "Erro ao carregar contas conectadas.");
    }
  };

  useEffect(() => {
    loadAccounts();

    const params = new URLSearchParams(window.location.search);
    const tiktokStatus = params.get("tiktok");
    if (tiktokStatus === "connected") {
      setBanner({ type: "success", text: "Conta do TikTok conectada com sucesso!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (tiktokStatus === "error") {
      setBanner({ type: "error", text: params.get("message") || "Não foi possível conectar sua conta do TikTok." });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleConnect = async (platform: SocialPlatform) => {
    if (platform !== "tiktok") return;
    setError(null);
    setConnectingPlatform(platform);
    try {
      const authorizeUrl = await SocialAccountsService.getTikTokAuthorizeUrl();
      window.location.href = authorizeUrl;
    } catch (err: any) {
      setError(err instanceof SocialAccountsError ? err.message : "Erro ao iniciar conexão.");
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (platform: SocialPlatform) => {
    setError(null);
    setConnectingPlatform(platform);
    try {
      await SocialAccountsService.disconnect(platform);
      await loadAccounts();
    } catch (err: any) {
      setError(err instanceof SocialAccountsError ? err.message : "Erro ao desconectar a conta.");
    } finally {
      setConnectingPlatform(null);
    }
  };

  const findConnected = (platform: SocialPlatform) => accounts?.find((a) => a.platform === platform) || null;

  // This route has a nested child (the TikTok OAuth callback page). TanStack
  // Router only renders that child through our own <Outlet/>, so on the
  // callback sub-path we render just the child instead of stacking it under
  // the settings UI below.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/dashboard/configuracoes") {
    return <Outlet />;
  }

  return (
    <div className="hs-page">
      <section className="tr-card tr-input-card">
        <div className="tr-input-lead">
          <div className="tr-input-badge">
            <Link2 size={16} className="tr-icon-lime" />
            <span>Configurações</span>
          </div>
          <h2 className="tr-input-title">Contas Conectadas</h2>
          <p className="tr-input-hint">
            Conecte suas redes sociais para publicar e agendar seus cortes direto pelo Super Views X.
          </p>
        </div>

        {banner && (
          <div className={banner.type === "success" ? "tr-success" : "tr-error"}>
            {banner.type === "success" && <CheckCircle2 size={18} />}
            <span>{banner.text}</span>
          </div>
        )}
        {error && <div className="tr-error">{error}</div>}
      </section>

      <section className="hs-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {PLATFORMS.map((p) => {
          const Icon = p.icon;
          const connected = findConnected(p.id);
          const isBusy = connectingPlatform === p.id;

          return (
            <article key={p.id} className="hs-card">
              <div className="hs-card-body" style={{ gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 999,
                      background: "rgba(158,255,46,0.08)",
                      border: "1px solid rgba(158,255,46,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {p.logo ? (
                      <img src={p.logo} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                    ) : (
                      Icon && <Icon size={20} className="tr-icon-lime" />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="hs-card-title m-0" style={{ minHeight: 0 }}>{p.label}</h3>
                    {connected ? (
                      <span style={{ fontSize: ".78rem", color: "var(--text-secondary)" }}>
                        Conectado como <strong style={{ color: "var(--text-main)" }}>{connected.platform_username}</strong>
                      </span>
                    ) : (
                      <span style={{ fontSize: ".78rem", color: "var(--text-muted)" }}>
                        {p.available ? "Não conectado" : "Em breve"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="hs-card-actions" style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 12 }}>
                  {!p.available ? (
                    <button className="hs-btn-ghost" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                      Em breve
                    </button>
                  ) : connected ? (
                    <button className="hs-btn-ghost" onClick={() => handleDisconnect(p.id)} disabled={isBusy}>
                      {isBusy ? <Loader2 size={12} className="tr-spin" /> : <LogOut size={12} />}
                      Desconectar
                    </button>
                  ) : (
                    <button className="hs-btn-ghost" onClick={() => handleConnect(p.id)} disabled={isBusy}>
                      {isBusy ? <Loader2 size={12} className="tr-spin" /> : <Link2 size={12} />}
                      Conectar
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
