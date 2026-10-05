import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CloudUpload,
  Film,
  Loader2,
  Send,
  Upload,
  X,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/publicar")({
  component: PublicarPage,
});

import { PostsService, PostsError, ScheduledPost, MAX_UPLOAD_BYTES } from "@/services/postsService";
import { SocialAccountsService, ConnectedAccount } from "@/services/socialAccountsService";
import { PlatformLogo } from "@/components/social/PlatformLogo";
import { PLATFORM_SHORT, accountName } from "@/components/publish/publishUtils";
import { DateField, TimeField, defaultScheduleSlot } from "@/components/publish/DateTimeFields";

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
  const [tab, setTab] = useState<"create" | "history">("create");
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

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
        if (publishable.length === 1) setAccountIds([publishable[0].id]);
      })
      .catch(() => setAccounts([]));
    loadPosts();
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const clearVideo = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setFile(null);
    setPreviewUrl(null);
  };

  const pickFile = (files: File[]) => {
    setFormError(null);
    setFormSuccess(null);
    const video = files.find((f) => f.type.startsWith("video/"));
    if (!video) {
      setFormError("Escolha um arquivo de vídeo (MP4, MOV, etc).");
      return;
    }
    if (video.size > MAX_UPLOAD_BYTES) {
      setFormError(`O vídeo excede o limite de ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`);
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(video);
    previewUrlRef.current = url;
    setFile(video);
    setPreviewUrl(url);
  };

  const dropProps = {
    onDragEnter: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) e.preventDefault();
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) setIsDragging(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      pickFile(Array.from(e.dataTransfer.files || []));
    },
  };

  const toggleAccount = (id: string) =>
    setAccountIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));

  const chooseMode = (next: "now" | "schedule") => {
    setMode(next);
    if (next === "schedule" && (!schedDate || !schedTime)) {
      const slot = defaultScheduleSlot();
      setSchedDate(slot.date);
      setSchedTime(slot.time);
    }
  };

  const scheduledAt = mode === "schedule" && schedDate && schedTime ? new Date(`${schedDate}T${schedTime}`) : null;
  const scheduleInPast = scheduledAt !== null && scheduledAt.getTime() <= Date.now();
  const noAccount = accountIds.length === 0;

  const handleSubmit = async () => {
    setFormError(null);
    setFormSuccess(null);
    setShowErrors(true);
    if (!file) {
      setFormError("Escolha um vídeo.");
      return;
    }
    if (noAccount) {
      setFormError("Escolha em qual conta publicar.");
      return;
    }
    if (mode === "schedule" && (!scheduledAt || scheduleInPast)) {
      setFormError("Escolha uma data e hora no futuro.");
      return;
    }

    setSubmitting(true);
    try {
      setSubmitStatus("Enviando vídeo...");
      const storagePath = await PostsService.uploadVideo(file);
      const selected = accountIds
        .map((id) => accounts?.find((a) => a.id === id))
        .filter((a): a is ConnectedAccount => !!a);

      if (mode === "schedule") {
        await PostsService.schedulePosts(
          selected.map((a) => ({
            platform: a.platform,
            accountId: a.id,
            storagePath,
            caption,
            scheduledAt: scheduledAt!,
          }))
        );
        setFormSuccess(selected.length === 1 ? "Post agendado." : `${selected.length} posts agendados.`);
        clearVideo();
        setCaption("");
        setShowErrors(false);
      } else {
        const failedIds: string[] = [];
        const failures: string[] = [];
        for (const a of selected) {
          setSubmitStatus(`Publicando no ${PLATFORM_SHORT[a.platform] ?? a.platform}...`);
          try {
            await PostsService.publishNow(a.platform, a.id, storagePath, caption);
          } catch (err: any) {
            failedIds.push(a.id);
            failures.push(`${accountName(a)}: ${err instanceof PostsError ? err.message : "falha ao publicar."}`);
          }
        }
        const okCount = selected.length - failedIds.length;
        if (okCount > 0) setFormSuccess(okCount === 1 ? "Post publicado." : `${okCount} posts publicados.`);
        if (failedIds.length === 0) {
          clearVideo();
          setCaption("");
          setShowErrors(false);
        } else {
          setAccountIds(failedIds);
          setFormError(failures.join(" · "));
        }
      }
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

  const noAccounts = accounts !== null && accounts.length === 0;
  const selectedNames = accountIds
    .map((id) => accounts?.find((a) => a.id === id))
    .filter((a): a is ConnectedAccount => !!a)
    .map(accountName);

  return (
    <div className="hs-page">
      <div className="pb-tabs">
        <button type="button" className={`pb-tab${tab === "create" ? " active" : ""}`} onClick={() => setTab("create")}>
          <Send size={13} /> Publicar
        </button>
        <button type="button" className={`pb-tab${tab === "history" ? " active" : ""}`} onClick={() => setTab("history")}>
          <Clock size={13} /> Histórico{posts && posts.length > 0 ? ` (${posts.length})` : ""}
        </button>
      </div>

      {tab === "create" && (
        <>
          {noAccounts && (
            <div className="tr-error" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={14} />
              Conecte uma conta do TikTok, YouTube ou Instagram antes de publicar.{" "}
              <Link to="/dashboard/configuracoes" style={{ color: "var(--primary-lime)", marginLeft: 4 }}>
                Conectar agora
              </Link>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              pickFile(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />

          {!file ? (
            <div
              className={`pb-dropzone${isDragging ? " active" : ""}`}
              {...dropProps}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
            >
              <CloudUpload size={32} className="tr-icon-lime" />
              <div>
                <strong>{isDragging ? "Solte o vídeo aqui" : "Arraste o vídeo aqui"}</strong>
                <span className="pb-muted"> ou clique para escolher</span>
              </div>
            </div>
          ) : (
            <div className="pb-single">
              <section className="pb-form">
                <div className="pb-section">
                  <span className="pb-label">1. Contas</span>
                  <div className="pb-accts-list">
                    {(accounts || []).map((a) => {
                      const on = accountIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          className={`pb-acct${on ? " on" : ""}`}
                          disabled={submitting}
                          onClick={() => toggleAccount(a.id)}
                          title={`${accountName(a)} (${PLATFORM_SHORT[a.platform] ?? a.platform})`}
                          aria-pressed={on}
                        >
                          <PlatformLogo platform={a.platform} size={36} />
                          {on && (
                            <span className="pb-acct-check">
                              <Check size={10} strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedNames.length > 0 ? (
                    <span className="pb-selected-names">{selectedNames.join(" · ")}</span>
                  ) : (
                    <span className={showErrors ? "pb-field-error" : "pb-hint"}>Clique no logo para escolher as contas.</span>
                  )}
                </div>

                <div className="pb-section">
                  <span className="pb-label">2. Legenda</span>
                  <textarea
                    className="pb-caption"
                    value={caption}
                    maxLength={150}
                    disabled={submitting}
                    placeholder="Escreva a legenda do post..."
                    onChange={(e) => setCaption(e.target.value)}
                  />
                  <span className="pb-hint pb-count">{caption.length}/150</span>
                </div>

                <div className="pb-section">
                  <span className="pb-label">3. Quando publicar</span>
                  <div className="pb-radios">
                    <label className="pb-radio">
                      <input type="radio" name="when" checked={mode === "now"} disabled={submitting} onChange={() => chooseMode("now")} />
                      Agora
                    </label>
                    <label className="pb-radio">
                      <input type="radio" name="when" checked={mode === "schedule"} disabled={submitting} onChange={() => chooseMode("schedule")} />
                      Programar
                    </label>
                  </div>
                  {mode === "schedule" && schedDate && schedTime && (
                    <>
                      <div className="pb-datetime-row">
                        <TimeField value={schedTime} onChange={setSchedTime} />
                        <DateField value={schedDate} onChange={setSchedDate} />
                      </div>
                      {scheduleInPast && <span className="pb-field-error">Esse horário já passou. Escolha um horário no futuro.</span>}
                    </>
                  )}
                </div>

                {formError && <div className="tr-error">{formError}</div>}
                {formSuccess && (
                  <div className="tr-success">
                    <CheckCircle2 size={18} />
                    <span>{formSuccess}</span>
                  </div>
                )}

                <button className="btn-primary tr-btn-main" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="tr-spin" /> {submitStatus || "Processando..."}
                    </>
                  ) : mode === "schedule" ? (
                    <>
                      <Calendar size={16} /> Agendar post
                    </>
                  ) : (
                    <>
                      <Send size={16} /> Publicar agora
                    </>
                  )}
                </button>
              </section>

              <aside className={`pb-preview${isDragging ? " active" : ""}`} {...dropProps}>
                <div className="pb-preview-frame">
                  <video src={previewUrl || undefined} controls className="pb-preview-video" />
                </div>
                <div className="pb-preview-file" title={file.name}>
                  <Film size={14} />
                  <span>{file.name}</span>
                  <span className="pb-muted">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
                <div className="pb-preview-actions">
                  <button type="button" className="hs-btn-ghost" disabled={submitting} onClick={() => fileInputRef.current?.click()}>
                    <Upload size={12} /> Trocar vídeo
                  </button>
                  <button type="button" className="hs-btn-ghost" disabled={submitting} onClick={clearVideo}>
                    <X size={12} /> Remover
                  </button>
                </div>
              </aside>
            </div>
          )}

          {!file && formError && <div className="tr-error">{formError}</div>}
          {!file && formSuccess && (
            <div className="tr-success">
              <CheckCircle2 size={18} />
              <span>{formSuccess}</span>
            </div>
          )}
        </>
      )}

      {tab === "history" && (
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
                <p>Nenhum post ainda. Publique ou agende um vídeo na aba Publicar.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {posts.map((p) => {
                  const statusInfo = STATUS_LABELS[p.status];
                  const acc = accounts?.find((a) => a.id === p.account_id);
                  return (
                    <div key={p.id} className="pb-history-row">
                      <PlatformLogo platform={p.platform} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pb-history-caption">{p.caption || "(sem legenda)"}</div>
                        <div className="pb-history-meta">
                          <Clock size={11} /> {formatDateTime(p.scheduled_at)}
                          <span>·</span>
                          {PLATFORM_SHORT[p.platform] ?? p.platform}
                          {acc && <span>· {accountName(acc)}</span>}
                          {p.error_message && <span style={{ color: "#ff6b6b" }}>· {p.error_message}</span>}
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
                          aria-label="Cancelar agendamento"
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
      )}
    </div>
  );
}
