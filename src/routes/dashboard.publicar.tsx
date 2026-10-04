import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  CloudUpload,
  Loader2,
  Plus,
  Send,
  Upload,
  X,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/publicar")({
  component: PublicarPage,
});

import { PostsService, PostsError, ScheduledPost, MAX_UPLOAD_BYTES } from "@/services/postsService";
import { SocialAccountsService, ConnectedAccount } from "@/services/socialAccountsService";
import { PostCard, PLATFORM_SHORT, accountName } from "@/components/publish/PostCard";
import {
  distributeDates,
  readVideoInfo,
  toLocalInputValue,
  type PostDraft,
} from "@/components/publish/postDraft";

const STATUS_LABELS: Record<ScheduledPost["status"], { label: string; color: string }> = {
  pending: { label: "Agendado", color: "var(--text-secondary)" },
  processing: { label: "Publicando...", color: "var(--primary-lime)" },
  posted: { label: "Publicado", color: "var(--primary-lime)" },
  failed: { label: "Falhou", color: "#ff6b6b" },
  canceled: { label: "Cancelado", color: "var(--text-muted)" },
};

const DEFAULT_TIMES = ["10:00", "14:00", "19:00"];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function tomorrowDateValue() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalInputValue(d).slice(0, 10);
}

function PublicarPage() {
  const [tab, setTab] = useState<"create" | "history">("create");
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [defaultAccountIds, setDefaultAccountIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<PostDraft[]>([]);
  const [mode, setMode] = useState<"schedule" | "now">("schedule");
  const [startDate, setStartDate] = useState(tomorrowDateValue);
  const [times, setTimes] = useState<string[]>(DEFAULT_TIMES);
  const [newTime, setNewTime] = useState("");

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftsRef = useRef<PostDraft[]>([]);
  draftsRef.current = drafts;

  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [posts, setPosts] = useState<ScheduledPost[] | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const requireDate = mode === "schedule";

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
        if (publishable.length === 1) setDefaultAccountIds([publishable[0].id]);
      })
      .catch(() => setAccounts([]));
    loadPosts();
    return () => draftsRef.current.forEach((d) => URL.revokeObjectURL(d.previewUrl));
  }, []);

  const addFiles = (files: File[]) => {
    setFormError(null);
    setFormSuccess(null);
    const videos = files.filter((f) => f.type.startsWith("video/"));
    if (videos.length === 0) {
      setFormError("Solte arquivos de vídeo (MP4, MOV, etc).");
      return;
    }
    const tooBig = videos.filter((f) => f.size > MAX_UPLOAD_BYTES);
    const ok = videos.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (tooBig.length > 0) {
      setFormError(
        `${tooBig.length === 1 ? `"${tooBig[0].name}" excede` : `${tooBig.length} vídeos excedem`} o limite de ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`
      );
    }

    const created: PostDraft[] = ok.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      thumbnail: null,
      duration: null,
      caption: "",
      accountIds: [...defaultAccountIds],
      scheduledAt: "",
    }));
    setDrafts((prev) => [...prev, ...created]);

    created.forEach((d) => {
      readVideoInfo(d.previewUrl).then((info) => patchDraft(d.id, info));
    });
  };

  const patchDraft = (id: string, patch: Partial<PostDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const removeDraft = (id: string) => {
    setDrafts((prev) => {
      const target = prev.find((d) => d.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((d) => d.id !== id);
    });
  };

  const handleDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragging(true);
  };
  const handleDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  };
  const handleDragLeave = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragging(false);
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files || []));
  };

  const toggleDefaultAccount = (id: string) =>
    setDefaultAccountIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));

  const applyAccountsToAll = () => setDrafts((prev) => prev.map((d) => ({ ...d, accountIds: [...defaultAccountIds] })));

  const addTime = () => {
    if (!newTime || times.includes(newTime)) return;
    setTimes((prev) => [...prev, newTime].sort());
    setNewTime("");
  };

  const handleDistribute = () => {
    if (drafts.length === 0) return;
    const dates = distributeDates(drafts.length, startDate, times);
    if (dates.length === 0) {
      setFormError("Escolha a data de início e ao menos um horário.");
      return;
    }
    setFormError(null);
    setDrafts((prev) => prev.map((d, i) => ({ ...d, scheduledAt: dates[i] ?? d.scheduledAt })));
  };

  const isIncomplete = (d: PostDraft) =>
    d.accountIds.length === 0 ||
    (requireDate && (d.scheduledAt === "" || new Date(d.scheduledAt).getTime() <= Date.now()));

  const incompleteCount = drafts.filter(isIncomplete).length;
  const totalPosts = drafts.reduce((sum, d) => sum + d.accountIds.length, 0);

  const handleSubmit = async () => {
    setFormError(null);
    setFormSuccess(null);
    if (drafts.length === 0) {
      setFormError("Adicione ao menos um vídeo.");
      return;
    }
    if (incompleteCount > 0) {
      setShowErrors(true);
      setFormError(`${incompleteCount} ${incompleteCount === 1 ? "post está incompleto" : "posts estão incompletos"}. Veja os cards em vermelho.`);
      return;
    }

    setSubmitting(true);
    const failures: string[] = [];
    let okPosts = 0;
    const snapshot = [...drafts];

    for (let i = 0; i < snapshot.length; i++) {
      const d = snapshot[i];
      setSubmitStatus(`Enviando vídeo ${i + 1} de ${snapshot.length}...`);
      let storagePath: string;
      try {
        storagePath = await PostsService.uploadVideo(d.file);
      } catch (err: any) {
        failures.push(`${d.file.name}: ${err instanceof PostsError ? err.message : "falha no envio."}`);
        continue;
      }

      const selected = d.accountIds
        .map((id) => accounts?.find((a) => a.id === id))
        .filter((a): a is ConnectedAccount => !!a);

      if (mode === "schedule") {
        try {
          await PostsService.schedulePosts(
            selected.map((a) => ({
              platform: a.platform,
              accountId: a.id,
              storagePath,
              caption: d.caption,
              scheduledAt: new Date(d.scheduledAt),
            }))
          );
          okPosts += selected.length;
          removeDraft(d.id);
        } catch (err: any) {
          failures.push(`${d.file.name}: ${err instanceof PostsError ? err.message : "falha ao agendar."}`);
        }
      } else {
        const failedIds: string[] = [];
        for (const a of selected) {
          setSubmitStatus(`Publicando ${i + 1} de ${snapshot.length} no ${PLATFORM_SHORT[a.platform] ?? a.platform}...`);
          try {
            await PostsService.publishNow(a.platform, a.id, storagePath, d.caption);
            okPosts += 1;
          } catch (err: any) {
            failedIds.push(a.id);
            failures.push(`${d.file.name} → ${accountName(a)}: ${err instanceof PostsError ? err.message : "falha ao publicar."}`);
          }
        }
        if (failedIds.length === 0) removeDraft(d.id);
        else patchDraft(d.id, { accountIds: failedIds });
      }
    }

    setSubmitting(false);
    setSubmitStatus("");
    setShowErrors(false);
    loadPosts();
    if (okPosts > 0) {
      const verb = mode === "schedule" ? (okPosts === 1 ? "post agendado" : "posts agendados") : okPosts === 1 ? "post publicado" : "posts publicados";
      setFormSuccess(`${okPosts} ${verb}.`);
    }
    if (failures.length > 0) setFormError(failures.join(" · "));
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

  return (
    <div className="hs-page">
      <div className="pb-tabs">
        <button type="button" className={`pb-tab${tab === "create" ? " active" : ""}`} onClick={() => setTab("create")}>
          <Send size={13} /> Criar posts
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

          <div className="pb-layout">
            <div className="pb-main">
              <div
                className={`pb-dropzone${isDragging ? " active" : ""}${drafts.length > 0 ? " compact" : ""}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
              >
                <CloudUpload size={drafts.length > 0 ? 18 : 28} className="tr-icon-lime" />
                <div>
                  <strong>{isDragging ? "Solte os vídeos aqui" : "Arraste vários vídeos aqui"}</strong>
                  <span className="pb-muted"> ou clique para escolher</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files || []));
                    e.target.value = "";
                  }}
                />
              </div>

              {drafts.length > 0 && (
                <div className="pb-grid">
                  {drafts.map((d) => (
                    <PostCard
                      key={d.id}
                      draft={d}
                      accounts={accounts || []}
                      requireDate={requireDate}
                      showErrors={showErrors}
                      disabled={submitting}
                      onChange={(patch) => patchDraft(d.id, patch)}
                      onRemove={() => removeDraft(d.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <aside className="pb-side">
              <div className="pb-panel">
                <p className="pb-panel-title">Quando publicar</p>
                <div className="pb-seg">
                  <button type="button" className={mode === "schedule" ? "active" : ""} onClick={() => setMode("schedule")}>
                    <Calendar size={12} /> Agendar
                  </button>
                  <button type="button" className={mode === "now" ? "active" : ""} onClick={() => setMode("now")}>
                    <Send size={12} /> Agora
                  </button>
                </div>
              </div>

              <div className="pb-panel">
                <p className="pb-panel-title">Contas</p>
                {accounts === null ? (
                  <p className="pb-muted">Carregando...</p>
                ) : (
                  (["tiktok", "youtube", "instagram"] as const).map((platform) => {
                    const group = accounts.filter((a) => a.platform === platform);
                    if (group.length === 0) return null;
                    return (
                      <div key={platform} className="pb-acc-group">
                        <span className="pb-acc-platform">{PLATFORM_SHORT[platform]}</span>
                        {group.map((a) => (
                          <label key={a.id} className="pb-acc-row">
                            <input
                              type="checkbox"
                              checked={defaultAccountIds.includes(a.id)}
                              onChange={() => toggleDefaultAccount(a.id)}
                            />
                            {accountName(a)}
                          </label>
                        ))}
                      </div>
                    );
                  })
                )}
                <button
                  type="button"
                  className="hs-btn-ghost pb-full"
                  onClick={applyAccountsToAll}
                  disabled={drafts.length === 0 || defaultAccountIds.length === 0}
                >
                  Aplicar a todos os cards
                </button>
                <span className="pb-hint">Novos vídeos já entram com estas contas.</span>
              </div>

              {mode === "schedule" && (
                <div className="pb-panel">
                  <p className="pb-panel-title">Distribuir automaticamente</p>
                  <label className="pb-field-row">
                    Início
                    <input
                      type="date"
                      className="tr-input pb-input-sm"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </label>
                  <div className="pb-field-row" style={{ alignItems: "flex-start" }}>
                    Horários
                    <div className="pb-chips">
                      {times.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="pb-chip pb-chip-on"
                          onClick={() => setTimes((prev) => prev.filter((x) => x !== t))}
                          title="Remover horário"
                        >
                          {t} <X size={10} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pb-field-row">
                    <input
                      type="time"
                      className="tr-input pb-input-sm"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                    />
                    <button type="button" className="hs-btn-ghost" style={{ flex: "none" }} onClick={addTime} disabled={!newTime}>
                      <Plus size={12} /> Horário
                    </button>
                  </div>
                  <span className="pb-hint">
                    {times.length} {times.length === 1 ? "post" : "posts"} por dia, na ordem dos cards.
                  </span>
                  <button
                    type="button"
                    className="hs-btn-ghost pb-full"
                    onClick={handleDistribute}
                    disabled={drafts.length === 0 || times.length === 0}
                  >
                    Distribuir datas
                  </button>
                </div>
              )}
            </aside>
          </div>

          {formError && <div className="tr-error">{formError}</div>}
          {formSuccess && (
            <div className="tr-success">
              <CheckCircle2 size={18} />
              <span>{formSuccess}</span>
            </div>
          )}

          <div className="pb-footer">
            <span className="pb-muted">
              {drafts.length === 0
                ? "Nenhum vídeo adicionado"
                : `${drafts.length} ${drafts.length === 1 ? "vídeo" : "vídeos"} · ${totalPosts} ${totalPosts === 1 ? "post" : "posts"}${incompleteCount > 0 ? ` · ${incompleteCount} incompleto${incompleteCount === 1 ? "" : "s"}` : ""}`}
            </span>
            <button
              className="btn-primary tr-btn-main"
              style={{ width: "auto", padding: "0 22px" }}
              onClick={handleSubmit}
              disabled={submitting || drafts.length === 0}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="tr-spin" /> {submitStatus || "Processando..."}
                </>
              ) : mode === "schedule" ? (
                <>
                  <Calendar size={16} /> Agendar {totalPosts > 0 ? `${totalPosts} ${totalPosts === 1 ? "post" : "posts"}` : ""}
                </>
              ) : (
                <>
                  <Send size={16} /> Publicar {totalPosts > 0 ? `${totalPosts} ${totalPosts === 1 ? "post" : "posts"}` : ""} agora
                </>
              )}
            </button>
          </div>
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
                <p>Nenhum post ainda. Crie ou agende vídeos na aba Criar posts.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {posts.map((p) => {
                  const statusInfo = STATUS_LABELS[p.status];
                  const acc = accounts?.find((a) => a.id === p.account_id);
                  return (
                    <div key={p.id} className="pb-history-row">
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
