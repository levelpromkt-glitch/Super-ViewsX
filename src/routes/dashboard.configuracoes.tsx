import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2, LogOut, Pencil, Plus } from "lucide-react";

export const Route = createFileRoute("/dashboard/configuracoes")({
  component: ConfiguracoesPage,
});

import {
  SocialAccountsService,
  SocialAccountsError,
  ConnectedAccount,
  SocialPlatform,
} from "@/services/socialAccountsService";
import { PlatformLogo } from "@/components/social/PlatformLogo";

const PLATFORMS: { id: SocialPlatform; label: string }[] = [
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
];

const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]));

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
    <div className="sa-account-row">
      <PlatformLogo platform={account.platform} size={38} />
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
        <div style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>@{account.platform_username} · {PLATFORM_LABEL[account.platform] ?? account.platform}</div>
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
    for (const [platform, label] of [["tiktok", "TikTok"], ["youtube", "YouTube"], ["instagram", "Instagram"]] as const) {
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
            : platform === "instagram"
              ? await SocialAccountsService.getInstagramAuthorizeUrl()
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

      <section className="sa-grid">
        {PLATFORMS.map((p) => {
          const count = accountsFor(p.id).length;
          const isConnecting = connectingPlatform === p.id;
          return (
            <article key={p.id} className="sa-tile">
              {count > 0 && <span className="sa-tile-count">{count} {count === 1 ? "conta" : "contas"}</span>}
              <PlatformLogo platform={p.id} size={64} />
              <h3 className="sa-tile-name">{p.label}</h3>
              <button className="sa-tile-btn" onClick={() => handleConnect(p.id)} disabled={isConnecting}>
                {isConnecting ? <Loader2 size={13} className="tr-spin" /> : <Plus size={13} />}
                Adicionar
              </button>
            </article>
          );
        })}
      </section>

      <section className="tr-card tr-fade">
        <div className="tr-card-head">
          <Link2 size={18} className="tr-icon-lime" />
          <h2>Contas conectadas{accounts && accounts.length > 0 ? ` (${accounts.length})` : ""}</h2>
        </div>
        <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {accounts === null ? (
            <p className="tr-muted">Carregando...</p>
          ) : accounts.length === 0 ? (
            <div className="hs-empty">
              <p>Nenhuma conta conectada ainda. Clique em Adicionar em uma das redes acima.</p>
            </div>
          ) : (
            accounts.map((a) => (
              <AccountRow
                key={a.id}
                account={a}
                onRenamed={handleRenamed}
                onDisconnect={handleDisconnect}
                disconnecting={disconnectingId === a.id}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
