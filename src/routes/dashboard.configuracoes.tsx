import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, CheckCircle2, Link2, Loader2, LogOut, Pencil, Plus } from "lucide-react";

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
  { id: "youtube", label: "YouTube", logo: "/youtube-logo.png", available: true },
  { id: "instagram", label: "Instagram", icon: Camera, available: false },
];

// One row for one connected account, with inline rename (click the label to
// edit) and its own disconnect button — a platform can now list several of
// these instead of a single connected/disconnected state.
function AccountRow({
  account,
  onRenamed,
  onDisconnect,
  disconnecting,
}: {
  account: ConnectedAccount;
  onRenamed: (id: string, label: string) => void;
  onDisconnect: (account: ConnectedAccount) => void;
  disconnecting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.label || account.platform_username || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === (account.label || account.platform_username)) return;
    setSaving(true);
    try {
      await SocialAccountsService.rename(account.id, trimmed);
      onRenamed(account.id, trimmed);
    } catch {
      setDraft(account.label || account.platform_username || "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderTop: "1px solid var(--border-soft)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            className="tr-input"
            style={{ padding: "4px 8px", fontSize: ".85rem" }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraft(account.label || account.platform_username || "");
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--text-main)",
              fontSize: ".85rem",
              fontWeight: 600,
            }}
          >
            {saving ? <Loader2 size={11} className="tr-spin" /> : <Pencil size={11} style={{ opacity: 0.5 }} />}
            {account.label || account.platform_username}
          </button>
        )}
        <div style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>@{account.platform_username}</div>
      </div>
      <button className="hs-btn-ghost" style={{ flex: "none" }} onClick={() => onDisconnect(account)} disabled={disconnecting}>
        {disconnecting ? <Loader2 size={12} className="tr-spin" /> : <LogOut size={12} />}
        Desconectar
      </button>
    </div>
  );
}

function ConfiguracoesPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectingPlatform, setConnectingPlatform] = useState<SocialPlatform | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
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
    for (const [platform, label] of [["tiktok", "TikTok"], ["youtube", "YouTube"]] as const) {
      const status = params.get(platform);
      if (status === "connected") {
        setBanner({ type: "success", text: `Conta do ${label} conectada com sucesso!` });
        window.history.replaceState({}, "", window.location.pathname);
      } else if (status === "error") {
        setBanner({ type: "error", text: params.get("message") || `Não foi possível conectar sua conta do ${label}.` });
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const handleConnect = async (platform: SocialPlatform) => {
    setError(null);
    setConnectingPlatform(platform);
    try {
      const authorizeUrl =
        platform === "tiktok"
          ? await SocialAccountsService.getTikTokAuthorizeUrl()
          : platform === "youtube"
            ? await SocialAccountsService.getYoutubeAuthorizeUrl()
            : null;
      if (!authorizeUrl) return;
      window.location.href = authorizeUrl;
    } catch (err: any) {
      setError(err instanceof SocialAccountsError ? err.message : "Erro ao iniciar conexão.");
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (account: ConnectedAccount) => {
    setError(null);
    setDisconnectingId(account.id);
    try {
      await SocialAccountsService.disconnect(account.id);
      await loadAccounts();
    } catch (err: any) {
      setError(err instanceof SocialAccountsError ? err.message : "Erro ao desconectar a conta.");
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleRenamed = (id: string, label: string) => {
    setAccounts((prev) => (prev ? prev.map((a) => (a.id === id ? { ...a, label } : a)) : prev));
  };

  const accountsFor = (platform: SocialPlatform) => accounts?.filter((a) => a.platform === platform) || [];

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
            Conecte quantas contas de cada rede você quiser — na hora de publicar, você escolhe qual delas usar.
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

      <section className="hs-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {PLATFORMS.map((p) => {
          const Icon = p.icon;
          const connected = accountsFor(p.id);
          const isConnecting = connectingPlatform === p.id;

          return (
            <article key={p.id} className="hs-card">
              <div className="hs-card-body" style={{ gap: 10 }}>
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
                    <span style={{ fontSize: ".78rem", color: "var(--text-muted)" }}>
                      {!p.available
                        ? "Em breve"
                        : connected.length === 0
                          ? "Nenhuma conta conectada"
                          : `${connected.length} conta${connected.length > 1 ? "s" : ""} conectada${connected.length > 1 ? "s" : ""}`}
                    </span>
                  </div>
                </div>

                {p.available && connected.length > 0 && (
                  <div>
                    {connected.map((a) => (
                      <AccountRow
                        key={a.id}
                        account={a}
                        onRenamed={handleRenamed}
                        onDisconnect={handleDisconnect}
                        disconnecting={disconnectingId === a.id}
                      />
                    ))}
                  </div>
                )}

                <div className="hs-card-actions" style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 12 }}>
                  {!p.available ? (
                    <button className="hs-btn-ghost" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                      Em breve
                    </button>
                  ) : (
                    <button className="hs-btn-ghost" onClick={() => handleConnect(p.id)} disabled={isConnecting}>
                      {isConnecting ? <Loader2 size={12} className="tr-spin" /> : <Plus size={12} />}
                      Adicionar conta
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
