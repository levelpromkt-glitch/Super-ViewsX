import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Anchor,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Film,
  Flame,
  Heart,
  Loader2,
  Play,
  Plus,
  Send,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  MomentProjectsService,
  type MomentProject,
  type MomentRun,
  type StoredMoment,
} from "@/services/momentProjectsService";
import {
  MomentProjectRunner,
  clearRunnerState,
  getRunnerDataVersion,
  getRunnerState,
  isRunnerActive,
  useRunnerVersion,
} from "@/services/momentProjectRunner";
import type { DurationPreset } from "@/services/viralMomentsService";
import { ClipDownloadService, ClipDownloadError, type ClipSource } from "@/services/clipDownloadService";
import { SocialAccountsService, SocialAccountsError, type ConnectedAccount } from "@/services/socialAccountsService";
import { SavedClipsService, SavedClipsError } from "@/services/savedClipsService";
import {
  DURATIONS,
  PROFILE_LABELS,
  SCORE_FILTERS,
  durationLabel,
  formatDuration,
  formatShortDate,
  formatTime,
  formatVideoLength,
  slugifyFilename,
} from "./momentUtils";

const PAGE_SIZES = [12, 24, 48];

type StepState = "done" | "active" | "pending";

export function ProjectView({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  // Re-render on every runner tick (upload percentage etc.); data is reloaded only when something was saved.
  useRunnerVersion();
  const dataVersion = getRunnerDataVersion();
  const runner = getRunnerState(projectId);

  const [project, setProject] = useState<MomentProject | null>(null);
  const [runs, setRuns] = useState<MomentRun[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const [minScore, setMinScore] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const [page, setPage] = useState(1);
  const [newRunOpen, setNewRunOpen] = useState(false);
  const newRunRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([MomentProjectsService.get(projectId), MomentProjectsService.listRuns(projectId)]);
      setProject(p);
      setRuns(r);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Não foi possível abrir o projeto.");
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  // Opened while the work was still going (after a reload, or from the list): pick it up again.
  useEffect(() => {
    if (project && !isRunnerActive(project.id)) MomentProjectRunner.resume(project);
  }, [project]);

  useEffect(() => {
    if (!newRunOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (newRunRef.current && !newRunRef.current.contains(e.target as Node)) setNewRunOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [newRunOpen]);

  const activeRun = useMemo(() => runs.find((r) => r.id === activeRunId) ?? runs[0] ?? null, [runs, activeRunId]);
  // A new round just finished: show it.
  const runsCount = runs.length;
  const prevRunsCount = useRef(runsCount);
  useEffect(() => {
    if (runsCount > prevRunsCount.current) setActiveRunId(null);
    prevRunsCount.current = runsCount;
  }, [runsCount]);

  const moments: StoredMoment[] = activeRun?.moments ?? [];
  const visible = useMemo(() => moments.filter((m) => m.score >= minScore), [moments, minScore]);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => setPage(1), [minScore, pageSize, activeRun?.id]);

  // ---- per-card choices, keyed by run so the same "m1" of two rounds never collides ----
  const keyOf = (m: StoredMoment) => `${activeRun?.id}:${m.id}`;
  const [selectedTitle, setSelectedTitle] = useState<Record<string, number>>({});
  const [useHook, setUseHook] = useState<Record<string, boolean>>({});
  const getEffectiveStart = (m: StoredMoment) => (useHook[keyOf(m)] && m.hookStart !== undefined ? m.hookStart : m.start);
  const getEffectiveTitle = (m: StoredMoment) => m.titles[selectedTitle[keyOf(m)] ?? 0] ?? m.title;

  const clipSource: ClipSource | null = project
    ? project.source_type === "youtube"
      ? { videoId: project.source_key }
      : project.source_key
        ? { r2Key: project.source_key }
        : null
    : null;

  // ---- player ----
  const playerRef = useRef<HTMLElement>(null);
  const [activeMoment, setActiveMoment] = useState<StoredMoment | null>(null);
  const [clipPreviewUrl, setClipPreviewUrl] = useState<string | null>(null);
  const [clipPreviewLoading, setClipPreviewLoading] = useState(false);
  const [clipPreviewError, setClipPreviewError] = useState<string | null>(null);

  const handleOpenMoment = async (m: StoredMoment) => {
    setActiveMoment(m);
    // The player sits above the results grid, so bring it into view.
    setTimeout(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    setClipPreviewUrl(null);
    setClipPreviewError(null);
    if (!clipSource) return;
    setClipPreviewLoading(true);
    try {
      setClipPreviewUrl(await ClipDownloadService.getClipDownloadUrl(clipSource, getEffectiveStart(m), m.end, false));
    } catch (error) {
      setClipPreviewError(error instanceof ClipDownloadError ? error.message : "Erro ao gerar o preview do corte.");
    } finally {
      setClipPreviewLoading(false);
    }
  };
  const handleCloseMoment = () => {
    setActiveMoment(null);
    setClipPreviewUrl(null);
    setClipPreviewError(null);
  };

  // ---- download / save / publish ----
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likingId, setLikingId] = useState<string | null>(null);

  const handleDownload = async (m: StoredMoment) => {
    if (!clipSource) return;
    const id = keyOf(m);
    setDownloadError(null);
    setDownloadingId(id);
    setDownloadProgress((prev) => ({ ...prev, [id]: 0 }));
    try {
      const filename = `${slugifyFilename(getEffectiveTitle(m))}.mp4`;
      await ClipDownloadService.downloadClip(clipSource, getEffectiveStart(m), m.end, filename, false, (percent) =>
        setDownloadProgress((prev) => ({ ...prev, [id]: percent }))
      );
    } catch (error) {
      setDownloadError(error instanceof ClipDownloadError ? error.message : "Erro inesperado ao baixar o corte.");
    } finally {
      setDownloadingId(null);
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleLike = async (m: StoredMoment) => {
    if (!clipSource || likedIds.has(keyOf(m))) return;
    setLikingId(keyOf(m));
    try {
      await SavedClipsService.save({
        source: clipSource,
        start: getEffectiveStart(m),
        end: m.end,
        title: getEffectiveTitle(m),
        profile: m.profile,
        score: m.score,
        thumbnail: m.thumb || null,
      });
      setLikedIds((prev) => new Set(prev).add(keyOf(m)));
    } catch (error) {
      setDownloadError(error instanceof SavedClipsError ? error.message : "Erro ao salvar na biblioteca.");
    } finally {
      setLikingId(null);
    }
  };

  const [publishableAccounts, setPublishableAccounts] = useState<ConnectedAccount[] | null>(null);
  const [publishTarget, setPublishTarget] = useState<StoredMoment | null>(null);
  const [publishAccountId, setPublishAccountId] = useState("");
  const [captionDraft, setCaptionDraft] = useState("");
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    SocialAccountsService.listConnected()
      .then((accounts) =>
        setPublishableAccounts(accounts.filter((a) => a.platform === "tiktok" || a.platform === "youtube" || a.platform === "instagram"))
      )
      .catch(() => setPublishableAccounts([]));
  }, []);

  const handleOpenPublish = (m: StoredMoment) => {
    setPublishError(null);
    setPublishTarget(m);
    setPublishAccountId(publishableAccounts?.[0]?.id || "");
    setCaptionDraft(getEffectiveTitle(m));
  };

  const handleConfirmPublish = async () => {
    const account = publishableAccounts?.find((a) => a.id === publishAccountId);
    if (!project || project.source_type !== "youtube" || !publishTarget || !account) return;
    const videoId = project.source_key;
    setPublishError(null);
    setPublishingId(keyOf(publishTarget));
    try {
      const start = getEffectiveStart(publishTarget);
      if (account.platform === "youtube") {
        await SocialAccountsService.publishToYoutube(account.id, videoId, start, publishTarget.end, captionDraft);
      } else if (account.platform === "instagram") {
        await SocialAccountsService.publishToInstagram(account.id, videoId, start, publishTarget.end, captionDraft);
      } else {
        await SocialAccountsService.publishToTikTok(account.id, videoId, start, publishTarget.end, captionDraft);
      }
      setPublishedIds((prev) => new Set(prev).add(keyOf(publishTarget)));
      setPublishTarget(null);
    } catch (error) {
      setPublishError(error instanceof SocialAccountsError ? error.message : "Erro inesperado ao publicar.");
    } finally {
      setPublishingId(null);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    if (!window.confirm(`Excluir o projeto "${project.title}"? Os cortes encontrados serão apagados.`)) return;
    try {
      await MomentProjectsService.remove(project.id);
      clearRunnerState(project.id);
      onBack();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Não foi possível excluir o projeto.");
    }
  };

  const handleNewRun = (duration: DurationPreset) => {
    setNewRunOpen(false);
    // Same duration as an existing round: it looks for other moments and adds them to it.
    void MomentProjectRunner.startRun(projectId, duration);
  };

  // ------------------------------------------------------------------ render
  if (loadError && !project) {
    return (
      <div className="hs-page">
        <button type="button" className="hs-btn-ghost mm-back" onClick={onBack}>
          <ArrowLeft size={14} /> Projetos
        </button>
        <div className="tr-error">{loadError}</div>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="hs-page">
        <div className="hs-loading">
          <div className="hs-loader-bar"><span /></div>
          <p>Abrindo o projeto...</p>
        </div>
      </div>
    );
  }

  const initialRunning = runner && runner.kind === "initial" && runner.stage !== "ready";
  const extraRunning = runner && runner.kind === "extra" && runner.stage !== "ready" && runner.stage !== "failed";
  const stage = initialRunning ? runner.stage : project.stage;
  const failedMessage = (runner?.kind === "initial" && runner.error) || project.error;
  const isGenerating = runs.length === 0 && (stage === "uploading" || stage === "transcribing" || stage === "finding");
  const isFailedEmpty = runs.length === 0 && stage === "failed";
  const progressPct = runner?.percent ?? null;
  const youtube = project.source_type === "youtube";

  const stepStates: StepState[] =
    stage === "uploading" ? ["active", "pending", "pending"] : stage === "transcribing" ? ["done", "active", "pending"] : ["done", "done", "active"];
  const steps = [
    { label: youtube ? "Link recebido" : "Vídeo recebido", activeLabel: "Enviando o vídeo" },
    { label: "Áudio transcrito", activeLabel: youtube ? "Transcrevendo o vídeo" : "Transcrevendo o áudio" },
    { label: "Melhores momentos encontrados", activeLabel: "Encontrando os melhores momentos" },
  ];

  return (
    <div className="hs-page">
      <button type="button" className="hs-btn-ghost mm-back" onClick={onBack}>
        <ArrowLeft size={14} /> Projetos
      </button>

      {/* Project header */}
      <section className="mm-phead">
        <div className="mm-phead-main">
          <div className="mm-phead-thumb">
            {project.thumbnail ? <img src={project.thumbnail} alt="" referrerPolicy="no-referrer" /> : <Film size={24} />}
            {project.video_duration_sec ? <span className="mm-file-dur">{formatVideoLength(project.video_duration_sec)}</span> : null}
          </div>
          <div className="mm-phead-info">
            <h1 title={project.title}>{project.title}</h1>
            <div className="mm-phead-meta">
              <span>{project.moments_count} {project.moments_count === 1 ? "corte" : "cortes"}</span>
              {project.video_duration_sec ? <span><Clock size={12} /> {formatVideoLength(project.video_duration_sec)}</span> : null}
              <span><Calendar size={12} /> {formatShortDate(project.created_at)}</span>
            </div>
          </div>
          <div className="mm-phead-actions">
            {youtube && (
              <a className="hs-btn-ghost" href={`https://www.youtube.com/watch?v=${project.source_key}`} target="_blank" rel="noopener noreferrer">
                Abrir original <ArrowUpRight size={12} />
              </a>
            )}
            <button type="button" className="hs-btn-ghost" onClick={handleDelete} aria-label="Excluir projeto">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        {(initialRunning || extraRunning) && stage !== "failed" && (
          <div className="mm-phead-progress">
            <div className="mm-phead-progress-top">
              <span><Loader2 size={12} className="tr-spin" /> Novos cortes aparecem aqui assim que ficam prontos.</span>
              <span>{progressPct !== null ? `${progressPct}%` : ""}</span>
            </div>
            <div className="mm-progress-bar" data-indeterminate={progressPct === null}>
              <span style={progressPct !== null ? { width: `${progressPct}%` } : undefined} />
            </div>
          </div>
        )}
      </section>

      {runner?.kind === "extra" && runner.stage === "failed" && (
        <div className="mm-banner-error">
          <TriangleAlert size={14} /> {runner.error}
          <button type="button" className="hs-btn-ghost" onClick={() => clearRunnerState(projectId)}>
            <X size={12} />
          </button>
        </div>
      )}

      {runner?.notice && (
        <div className="mm-banner-notice">
          <Sparkles size={14} /> {runner.notice}
          <button type="button" className="hs-btn-ghost" onClick={() => clearRunnerState(projectId)}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* First pass still running: steps + a queue of placeholder cards */}
      {isGenerating && (
        <section className="mm-gen">
          <div className="mm-gen-left">
            <span className="mm-gen-kicker"><i /> Geração em andamento</span>
            <h2>Seu vídeo está virando cortes</h2>
            <p>Analisamos o conteúdo e preparamos cada corte individualmente. Você pode sair desta tela: o projeto continua sendo processado e fica salvo em "Seus projetos".</p>
            <ol className="mm-steps">
              {steps.map((s, i) => (
                <li key={s.label} data-state={stepStates[i]}>
                  <span className="mm-step-dot">
                    {stepStates[i] === "done" ? <CheckCircle2 size={14} /> : stepStates[i] === "active" ? <Loader2 size={14} className="tr-spin" /> : i + 1}
                  </span>
                  <span className="mm-step-text">
                    <strong>{stepStates[i] === "active" ? s.activeLabel : s.label}{stage === "uploading" && i === 0 && progressPct !== null ? ` — ${progressPct}%` : ""}</strong>
                    {stepStates[i] === "active" && runner?.status ? <small>{runner.status}</small> : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="mm-gen-right">
            <div className="mm-gen-right-head"><strong>Fila de cortes</strong><span>atualização automática</span></div>
            <div className="mm-queue">
              {[1, 2, 3].map((n) => (
                <div key={n} className="mm-queue-card">
                  <span className="mm-queue-n">{n}</span>
                  <div className="mm-queue-line" />
                  <div className="mm-queue-line short" />
                </div>
              ))}
            </div>
            <p className="mm-queue-foot">O primeiro corte aparece aqui assim que estiver pronto.</p>
          </div>
        </section>
      )}

      {isFailedEmpty && (
        <section className="mm-gen mm-gen-failed">
          <div className="mm-gen-left">
            <span className="mm-gen-kicker mm-gen-kicker-err"><i /> Não foi possível concluir</span>
            <h2>Algo deu errado com este vídeo</h2>
            <p>{failedMessage || "Ocorreu um erro inesperado ao analisar o vídeo."}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(project.source_type === "youtube" || project.source_key) && (
                <button type="button" className="btn-primary mm-pill-btn" onClick={() => void MomentProjectRunner.retry(project)}>
                  Tentar de novo
                </button>
              )}
              <button type="button" className="hs-btn-ghost" onClick={handleDelete}>
                <Trash2 size={12} /> Excluir projeto
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Toolbar: rounds, new round, filters */}
      {runs.length > 0 && (
        <div className="mm-ptoolbar">
          <div className="mm-runs">
            {runs.map((r) => (
              <button
                key={r.id}
                type="button"
                className="hs-btn-ghost"
                data-active={activeRun?.id === r.id}
                onClick={() => setActiveRunId(r.id)}
              >
                {durationLabel(r.duration).replace(" (competição)", "")} · {r.moments.length}
              </button>
            ))}
          </div>
          <div className="mm-ptoolbar-right">
            <select className="mm-select" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} aria-label="Filtrar por nota">
              {SCORE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select className="mm-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Cortes por página">
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n} / pág</option>
              ))}
            </select>
            <div className="hs-period" ref={newRunRef}>
              <button
                type="button"
                className="btn-primary mm-newrun"
                data-open={newRunOpen}
                disabled={!!extraRunning || !!initialRunning}
                onClick={() => setNewRunOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={newRunOpen}
              >
                <Plus size={14} /> Nova análise <ChevronDown size={14} />
              </button>
              {newRunOpen && (
                <div className="hs-period-menu" role="listbox">
                  {DURATIONS.map((d) => (
                    <button key={d.id} type="button" role="option" aria-selected={false} className="hs-period-item" onClick={() => handleNewRun(d.id)}>
                      {d.label}
                      {runs.some((r) => r.duration === d.id) ? " · achar mais cortes" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeRun?.video_topic && (
        <p className="mm-topic">Sobre o vídeo: {activeRun.video_topic}</p>
      )}
      {downloadError && <div className="tr-error">{downloadError}</div>}

      {/* Inline player for the selected moment */}
      {activeMoment && (
        <section className="tr-card tr-fade" ref={playerRef}>
          <div className="tr-card-head">
            <Sparkles size={18} className="tr-icon-lime" />
            <h2>{getEffectiveTitle(activeMoment)}</h2>
            <button className="hs-btn-ghost" style={{ marginLeft: "auto", flex: "none" }} onClick={handleCloseMoment}>
              <X size={12} /> Fechar
            </button>
          </div>
          <div className="tr-video-card" style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: "0 20px 20px" }}>
            <div className="tr-video-wrap" style={{ flex: "1 1 320px", minWidth: 280 }}>
              {clipPreviewLoading ? (
                <div className="hs-loading" style={{ padding: "48px 0" }}>
                  <div className="hs-loader-bar"><span /></div>
                  <p>Cortando o trecho...</p>
                </div>
              ) : clipPreviewError ? (
                <div className="tr-error">{clipPreviewError}</div>
              ) : clipPreviewUrl ? (
                <video key={clipPreviewUrl} src={clipPreviewUrl} controls autoPlay style={{ width: "100%", maxHeight: 480, borderRadius: 12, background: "#000" }} />
              ) : null}
            </div>
            <div style={{ flex: "1 1 260px", minWidth: 240, display: "flex", flexDirection: "column", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: ".85rem", color: "var(--text-secondary)" }}>Detalhes do corte</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="hs-thumb-speed" style={{ position: "static" }}>
                  <Flame size={12} /> {activeMoment.score} Score
                </span>
                {activeMoment.profile && <span className="hs-card-tag" style={{ marginLeft: 0 }}>{PROFILE_LABELS[activeMoment.profile]}</span>}
                <span className="hs-card-views" style={{ margin: 0 }}>
                  <Clock size={12} /> {formatTime(getEffectiveStart(activeMoment))} – {formatTime(activeMoment.end)} ({formatDuration(activeMoment.end - getEffectiveStart(activeMoment))})
                </span>
              </div>
              <p style={{ margin: 0, lineHeight: 1.5, fontSize: ".85rem" }}>{activeMoment.reason}</p>
              {useHook[keyOf(activeMoment)] && activeMoment.hookReason && (
                <p style={{ margin: 0, lineHeight: 1.5, fontSize: ".85rem", color: "var(--primary-lime)", display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <Anchor size={12} style={{ flex: "none", marginTop: 3 }} /> {activeMoment.hookReason}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Inline publish panel */}
      {publishTarget && (
        <section className="tr-card tr-fade">
          <div className="tr-card-head">
            <Send size={18} className="tr-icon-lime" />
            <h2>Publicar</h2>
            <button className="hs-btn-ghost" style={{ marginLeft: "auto", flex: "none" }} onClick={() => setPublishTarget(null)}>
              <X size={12} /> Fechar
            </button>
          </div>
          <div className="tr-field" style={{ padding: "0 20px 20px" }}>
            {publishableAccounts && publishableAccounts.length > 1 && (
              <>
                <label className="hs-label">Publicar como</label>
                <select className="tr-input" style={{ marginBottom: 12 }} value={publishAccountId} onChange={(e) => setPublishAccountId(e.target.value)}>
                  {publishableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label || a.platform_username} ({a.platform === "youtube" ? "YouTube" : a.platform === "instagram" ? "Instagram" : "TikTok"})
                    </option>
                  ))}
                </select>
              </>
            )}
            <label className="hs-label">Legenda</label>
            <textarea
              className="tr-input"
              style={{ width: "100%", minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
              value={captionDraft}
              maxLength={150}
              onChange={(e) => setCaptionDraft(e.target.value)}
            />
            {publishError && <div className="tr-error">{publishError}</div>}
            <button
              className="btn-primary tr-btn-main"
              style={{ marginTop: 12 }}
              onClick={handleConfirmPublish}
              disabled={publishingId === keyOf(publishTarget) || !publishAccountId}
            >
              {publishingId === keyOf(publishTarget) ? (
                <>
                  <Loader2 size={16} className="tr-spin" /> Publicando...
                </>
              ) : (
                <>
                  <Send size={16} /> Publicar agora
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* Results */}
      {runs.length > 0 && (
        <>
          {moments.length === 0 ? (
            <div className="hs-empty">
              <p>Não encontramos momentos com potencial viral claro nesse vídeo com esta duração. Tente outra duração em "Nova análise".</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="hs-empty">
              <p>Nenhum corte atinge a nota mínima selecionada. Tente um filtro mais baixo.</p>
            </div>
          ) : (
            <section className="hs-grid">
              {pageItems.map((m) => {
                const k = keyOf(m);
                const effectiveStart = getEffectiveStart(m);
                const titleIndex = selectedTitle[k] ?? 0;
                const hookOn = useHook[k] === true;
                const cover = m.thumb || (youtube ? `https://img.youtube.com/vi/${project.source_key}/hqdefault.jpg` : null) || project.thumbnail;
                return (
                  <article key={k} className="hs-card">
                    <div className="hs-thumb" style={{ position: "relative", overflow: "hidden", cursor: "pointer" }} onClick={() => handleOpenMoment(m)}>
                      {cover && (
                        <img
                          src={cover}
                          alt=""
                          referrerPolicy="no-referrer"
                          style={{ position: "absolute", width: "100%", height: "100%", top: 0, left: 0, objectFit: "cover", zIndex: 0 }}
                        />
                      )}
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 1 }}></div>
                      <Play size={26} className="hs-thumb-play" style={{ position: "relative", zIndex: 2 }} />
                      <span className="hs-thumb-speed" style={{ position: "relative", zIndex: 2 }}>
                        <Flame size={10} /> {m.score} Score
                      </span>
                    </div>
                    <div className="hs-card-body">
                      <h3 className="hs-card-title m-0">{getEffectiveTitle(m)}</h3>
                      {m.titles.length > 1 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {m.titles.map((t, i) => (
                            <button
                              key={i}
                              type="button"
                              className="hs-btn-ghost"
                              style={{
                                flex: "none",
                                padding: "3px 9px",
                                fontSize: ".7rem",
                                borderColor: titleIndex === i ? "var(--primary-lime)" : undefined,
                                color: titleIndex === i ? "var(--primary-lime)" : undefined,
                              }}
                              onClick={() => setSelectedTitle((prev) => ({ ...prev, [k]: i }))}
                              title={t}
                            >
                              Headline {i + 1}
                            </button>
                          ))}
                        </div>
                      )}
                      {m.profile && <span className="hs-card-tag" style={{ marginLeft: 0 }}>{PROFILE_LABELS[m.profile]}</span>}
                      <div className="hs-card-row">
                        <span className="hs-card-views">
                          <Clock size={12} /> {formatTime(effectiveStart)} – {formatTime(m.end)}
                        </span>
                        <span className="hs-card-time">{formatDuration(m.end - effectiveStart)}</span>
                      </div>
                      <div className="hs-card-meta">
                        <span style={{ display: "block", lineHeight: 1.4 }}>{m.reason}</span>
                      </div>
                      {m.hookStart !== undefined && (
                        <div className="hs-card-meta">
                          <label style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={hookOn}
                              onChange={(e) => setUseHook((prev) => ({ ...prev, [k]: e.target.checked }))}
                              style={{ marginTop: 3 }}
                            />
                            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ display: "flex", gap: 4, alignItems: "center", color: "var(--primary-lime)", fontWeight: 600 }}>
                                <Anchor size={12} /> Usar corte com gancho viral
                              </span>
                              {hookOn && <span style={{ lineHeight: 1.4 }}>{m.hookReason}</span>}
                            </span>
                          </label>
                        </div>
                      )}
                      <div className="hs-card-actions">
                        <button className="hs-btn-ghost" onClick={() => handleOpenMoment(m)}>
                          <Play size={12} /> Assistir trecho
                        </button>
                        <button
                          className="hs-btn-ghost"
                          onClick={() => handleLike(m)}
                          disabled={likingId === k || likedIds.has(k)}
                          style={likedIds.has(k) ? { color: "var(--primary-lime)", borderColor: "var(--primary-lime)" } : undefined}
                        >
                          {likingId === k ? <Loader2 size={12} className="tr-spin" /> : <Heart size={12} fill={likedIds.has(k) ? "currentColor" : "none"} />}
                          {likedIds.has(k) ? "Salvo" : "Salvar"}
                        </button>
                        <button className="hs-btn-ghost" onClick={() => handleDownload(m)} disabled={downloadingId === k}>
                          {downloadingId === k ? (
                            <>
                              <Loader2 size={12} className="tr-spin" /> Baixando... {downloadProgress[k] ?? 0}%
                            </>
                          ) : (
                            <>
                              <Download size={12} /> Baixar corte
                            </>
                          )}
                        </button>
                        {youtube && (
                          <a
                            className="hs-btn-ghost"
                            href={`https://www.youtube.com/watch?v=${project.source_key}&t=${Math.floor(effectiveStart)}s`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ArrowUpRight size={12} /> Abrir no YouTube
                          </a>
                        )}
                        {youtube &&
                          (publishableAccounts && publishableAccounts.length === 0 ? (
                            <Link to="/dashboard/configuracoes" className="hs-btn-ghost">
                              <Send size={12} /> Conectar rede social
                            </Link>
                          ) : publishedIds.has(k) ? (
                            <span className="hs-btn-ghost" style={{ color: "var(--primary-lime)", cursor: "default" }}>
                              <CheckCircle2 size={12} /> Publicado
                            </span>
                          ) : (
                            <button className="hs-btn-ghost" onClick={() => handleOpenPublish(m)} disabled={publishableAccounts === null}>
                              <Send size={12} /> Publicar
                            </button>
                          ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {visible.length > pageSize && (
            <div className="mm-pager">
              <span>
                Mostrando {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, visible.length)} de {visible.length} cortes
              </span>
              <div>
                <button type="button" className="hs-btn-ghost" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                  Anterior
                </button>
                <span className="mm-pager-page">{safePage} / {pageCount}</span>
                <button type="button" className="hs-btn-ghost" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
                  Próximo
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
