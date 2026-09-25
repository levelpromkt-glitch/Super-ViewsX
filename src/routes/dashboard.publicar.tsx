import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Film,
  Loader2,
  Send,
  Upload,
  X,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/publicar")({
  component: PublicarPage,
});

import { PostsService, PostsError, ScheduledPost } from "@/services/postsService";
import { SocialAccountsService, ConnectedAccount } from "@/services/socialAccountsService";

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
};

const STATUS_LABELS: Record<ScheduledPost["status"], { label: string; color: string }> = {
  pending: { label: "Agendado", color: "var(--text-secondary)" },
  processing: { label: "Publicando...", color: "var(--primary-lime)" },
  posted: { label: "Publicado", color: "var(--primary-lime)" },
  failed: { label: "Falhou", color: "#ff6b6b" },
  canceled: { label: "Cancelado", color: "var(--text-muted)" },
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function PublicarPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId) || null;
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [posts, setPosts] = useState<ScheduledPost[] | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const loadPosts = () => {
    PostsService.listPosts()
      .then(setPosts)
      .catch((err) => setPostsError(err instanceof PostsError ? err.message : "Erro ao carregar histórico."));
  };

  useEffect(() => {
    SocialAccountsService.listConnected()
      .then((all) => {
        const publishable = all.filter((a) => a.platform === "tiktok" || a.platform === "youtube" || a.platform === "instagram");
        setAccounts(publishable);
        if (publishable.length > 0) setSelectedAccountId(publishable[0].id);
      })
      .catch(() => setAccounts([]));
    loadPosts();
  }, []);

  const resetForm = () => {
    setFile(null);
    setCaption("");
    setScheduledAt("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    setFormError(null);
    setFormSuccess(null);

    if (!file) {
      setFormError("Escolha um vídeo do seu computador.");
      return;
    }
    if (!selectedAccountId || !selectedAccount) {
      setFormError("Escolha em qual conta publicar.");
      return;
    }
    if (mode === "schedule" && !scheduledAt) {
      setFormError("Escolha a data e hora do agendamento.");
      return;
    }
    const scheduledDate = mode === "schedule" ? new Date(scheduledAt) : null;
    if (scheduledDate && scheduledDate.getTime() <= Date.now()) {
      setFormError("A data de agendamento precisa ser no futuro.");
      return;
    }

    setSubmitting(true);
    try {
      setSubmitStatus("Enviando vídeo...");
      const storagePath = await PostsService.uploadVideo(file);

      const platform = selectedAccount!.platform;
      const platformLabel = PLATFORM_LABELS[platform] ?? platform;
      if (mode === "now") {
        setSubmitStatus(`Publicando no ${platformLabel}...`);
        await PostsService.publishNow(platform, selectedAccountId, storagePath, caption);
        setFormSuccess(`Vídeo publicado no ${platformLabel}!`);
      } else {
        await PostsService.schedulePost(platform, selectedAccountId, storagePath, caption, scheduledDate!);
        setFormSuccess("Post agendado com sucesso!");
      }

      resetForm();
      loadPosts();
    } catch (err: any) {
      setFormError(err instanceof PostsError ? err.message : "Erro inesperado ao publicar.");
    } finally {
      setSubmitting(false);
      setSubmitStatus("");
    }
  };

  const handleCancel = async (id: string) => {
    setCancelingId(id);
    try {
      await PostsService.cancelPost(id);
      loadPosts();
    } catch (err: any) {
      setPostsError(err instanceof PostsError ? err.message : "Erro ao cancelar.");
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div className="hs-page">
      <section className="tr-card tr-input-card">
        <div className="tr-input-lead">
          <div className="tr-input-badge">
            <Send size={16} className="tr-icon-lime" />
            <span>Publicar</span>
          </div>
          <h2 className="tr-input-title">Publique um vídeo do seu computador</h2>
          <p className="tr-input-hint">
            Envie um arquivo de vídeo e publique agora ou agende para mais tarde.
          </p>
        </div>

        {accounts !== null && accounts.length === 0 && (
          <div className="tr-error" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={14} />
            Conecte uma conta do TikTok, YouTube ou Instagram antes de publicar.{" "}
            <Link to="/dashboard/configuracoes" style={{ color: "var(--primary-lime)", marginLeft: 4 }}>
              Conectar agora
            </Link>
          </div>
        )}

        {accounts !== null && accounts.length > 1 && (
          <div className="tr-field">
            <label className="hs-label">Publicar como</label>
            <select
              className="tr-input"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label || a.platform_username} ({PLATFORM_LABELS[a.platform] ?? a.platform})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="tr-field">
          <label className="hs-label">Vídeo</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="tr-input"
            style={{ padding: 10 }}
          />
          {file && (
            <span style={{ fontSize: ".78rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <Film size={14} /> {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
            </span>
          )}
        </div>

        <div className="tr-field">
          <label className="hs-label">Legenda</label>
          <textarea
            className="tr-input"
            style={{ width: "100%", minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
            value={caption}
            maxLength={150}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Escreva a legenda do post..."
          />
        </div>

        <div className="tr-field">
          <label className="hs-label">Quando publicar</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              className="hs-btn-ghost"
              style={{
                flex: "none",
                borderColor: mode === "now" ? "var(--primary-lime)" : undefined,
                color: mode === "now" ? "var(--primary-lime)" : undefined,
              }}
              onClick={() => setMode("now")}
            >
              <Send size={12} /> Agora
            </button>
            <button
              type="button"
              className="hs-btn-ghost"
              style={{
                flex: "none",
                borderColor: mode === "schedule" ? "var(--primary-lime)" : undefined,
                color: mode === "schedule" ? "var(--primary-lime)" : undefined,
              }}
              onClick={() => setMode("schedule")}
            >
              <Calendar size={12} /> Agendar
            </button>
          </div>
          {mode === "schedule" && (
            <input
              type="datetime-local"
              className="tr-input"
              style={{ marginTop: 10, width: "fit-content" }}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          )}
        </div>

        {formError && <div className="tr-error">{formError}</div>}
        {formSuccess && (
          <div className="tr-success">
            <CheckCircle2 size={18} />
            <span>{formSuccess}</span>
          </div>
        )}

        <button className="btn-primary tr-btn-main" onClick={handleSubmit} disabled={submitting || !selectedAccountId}>
          {submitting ? (
            <>
              <Loader2 size={16} className="tr-spin" /> {submitStatus || "Processando..."}
            </>
          ) : mode === "now" ? (
            <>
              <Send size={16} /> Publicar agora
            </>
          ) : (
            <>
              <Calendar size={16} /> Agendar post
            </>
          )}
        </button>
      </section>

      <section className="tr-card tr-fade">
        <div className="tr-card-head">
          <Upload size={18} className="tr-icon-lime" />
          <h2>Histórico de posts</h2>
        </div>
        <div style={{ padding: "0 20px 20px" }}>
          {postsError && <div className="tr-error">{postsError}</div>}
          {!posts ? (
            <p className="tr-muted">Carregando...</p>
          ) : posts.length === 0 ? (
            <div className="hs-empty">
              <p>Nenhum post ainda. Publique ou agende um vídeo acima.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {posts.map((p) => {
                const statusInfo = STATUS_LABELS[p.status];
                return (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--border-soft)",
                      background: "var(--bg-card)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: ".85rem", fontWeight: 600, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.caption || "(sem legenda)"}
                      </div>
                      <div style={{ fontSize: ".72rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <Clock size={11} /> {formatDateTime(p.scheduled_at)}
                        {p.error_message && <span style={{ color: "#ff6b6b" }}> · {p.error_message}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: ".72rem", fontWeight: 700, color: statusInfo.color, flexShrink: 0 }}>
                      {statusInfo.label}
                    </span>
                    {p.status === "pending" && (
                      <button
                        className="hs-btn-ghost"
                        style={{ flex: "none" }}
                        onClick={() => handleCancel(p.id)}
                        disabled={cancelingId === p.id}
                      >
                        {cancelingId === p.id ? <Loader2 size={12} className="tr-spin" /> : <X size={12} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
