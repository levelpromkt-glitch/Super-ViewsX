import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildWindows, dedupeByOverlap, overlapRatio, type Range, type Transcript } from "./windows.ts";

// Runs the "best moments" analysis on the server, so it keeps going with the browser tab closed.
//
// The browser only inserts a row in moment_jobs (a trigger calls this function). One call = one
// "tick": it takes a batch of pending tasks, runs them, advances the job to its next phase when a
// phase is finished, and asks for the next tick (through pg_net). A cron sweep restarts jobs that
// stopped in the middle. Phases:
//   scan  - one task per ~10 min window of the video  -> viral-moments
//   judge - candidates re-read in chunks              -> viral-judge
//   done  - the final lists are saved as a moment_run

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(SUPABASE_URL, SERVICE_KEY);
const FN = `${SUPABASE_URL}/functions/v1`;

// Fewer simultaneous calls once the free backup model is answering: its per-minute quota is small.
const SCAN_CONCURRENCY = 4;
const SCAN_CONCURRENCY_BACKUP = 2;
const JUDGE_CONCURRENCY = 3;
const JUDGE_CONCURRENCY_BACKUP = 2;
const RETRY_PAUSE_MS = 8_000; // before the next tick when a task has to be repeated
const CANDIDATES_PER_WINDOW = 9; // when there are several windows
const CANDIDATES_SINGLE_WINDOW = 30;
const MAX_CANDIDATES = 80;
const JUDGE_CHUNK = 24;
const MAX_OTHERS = 40;
const MAX_ATTEMPTS = 3;
const STALE_TASK_MS = 170_000; // a "running" task older than this lost its worker
const CALL_TIMEOUT_MS = 115_000;

const BACKUP_NOTICE =
  "A IA principal estava sem créditos, então esta análise usou o modelo reserva (Gemini). A qualidade pode ser menor; rode de novo quando os créditos voltarem.";

type Cand = Range & { id: string; score: number; slice?: string[]; [k: string]: any };

const nowIso = () => new Date().toISOString();
const patchJob = (id: string, patch: Record<string, unknown>) =>
  db.from("moment_jobs").update({ ...patch, updated_at: nowIso() }).eq("id", id);

async function callFn(name: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${FN}/${name}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch { /* not JSON */ }
    return { ok: res.ok, status: res.status, data: data ?? { message: text.slice(0, 200) } };
  } catch (e) {
    return { ok: false, status: 0, data: { message: (e as Error).message } };
  } finally {
    clearTimeout(timer);
  }
}

const kick = async (jobId: string) => {
  const { error } = await db.rpc("kick_moment_job", { p_job: jobId });
  if (error) console.error("kick failed", error.message);
};

async function failJob(job: any, message: string) {
  console.error("job failed", job.id, message);
  await patchJob(job.id, { status: "failed", error: message, status_text: null });
  if (job.kind === "initial") {
    await db.from("moment_projects").update({ stage: "failed", error: message }).eq("id", job.project_id);
  }
  await db.from("moment_job_tasks").delete().eq("job_id", job.id);
}

const loadProject = async (projectId: string) => {
  const { data } = await db
    .from("moment_projects")
    .select("id, source_type, source_key, transcript")
    .eq("id", projectId)
    .maybeSingle();
  return data as { id: string; source_type: string; source_key: string; transcript: Transcript | null } | null;
};

async function resetStaleTasks(jobId: string) {
  const cutoff = new Date(Date.now() - STALE_TASK_MS).toISOString();
  await db
    .from("moment_job_tasks")
    .update({ status: "failed", error: "Tempo esgotado.", updated_at: nowIso() })
    .eq("job_id", jobId).eq("status", "running").lt("started_at", cutoff).gte("attempts", MAX_ATTEMPTS);
  await db
    .from("moment_job_tasks")
    .update({ status: "pending", updated_at: nowIso() })
    .eq("job_id", jobId).eq("status", "running").lt("started_at", cutoff).lt("attempts", MAX_ATTEMPTS);
}

// ------------------------------------------------------------------------------------- phases

async function initJob(job: any): Promise<any | null> {
  const proj = await loadProject(job.project_id);
  const transcript = proj?.transcript;
  if (!proj || !transcript || !Array.isArray(transcript.lines) || transcript.lines.length === 0) {
    await failJob(job, "A transcrição deste projeto não está disponível. Envie o vídeo de novo.");
    return null;
  }
  const windows = buildWindows(transcript);
  const rows = windows.map((w, i) => ({ job_id: job.id, kind: "window", idx: i, payload: { start: w.start, end: w.end } }));
  await db.from("moment_job_tasks").upsert(rows, { onConflict: "job_id,kind,idx", ignoreDuplicates: true });
  await db
    .from("moment_jobs")
    .update({
      phase: "scan",
      windows_total: windows.length,
      windows_done: 0,
      progress: 5,
      status_text: windows.length === 1 ? "Analisando os melhores momentos com IA..." : `Lendo o vídeo em partes (0 de ${windows.length})...`,
      updated_at: nowIso(),
    })
    .eq("id", job.id)
    .is("phase", null);
  const { data } = await db.from("moment_jobs").select("*").eq("id", job.id).maybeSingle();
  return data;
}

type BatchResult = { worked: number; retried: number };

async function scanBatch(job: any): Promise<BatchResult> {
  const limit = job.used_backup ? SCAN_CONCURRENCY_BACKUP : SCAN_CONCURRENCY;
  const { data: claimed } = await db.rpc("claim_moment_tasks", { p_job: job.id, p_kind: "window", p_limit: limit });
  const tasks = (claimed || []) as any[];
  if (tasks.length === 0) return { worked: 0, retried: 0 };

  const proj = await loadProject(job.project_id);
  const transcript = proj?.transcript;
  if (!proj || !transcript) {
    await failJob(job, "A transcrição deste projeto não está disponível. Envie o vídeo de novo.");
    return { worked: tasks.length, retried: 0 };
  }
  const windows = buildWindows(transcript);
  const single = windows.length === 1;
  const exclude: Range[] = Array.isArray(job.exclude) ? job.exclude : [];
  let fatal: string | null = null;
  let retried = 0;
  let sawBackup = false;

  await Promise.all(
    tasks.map(async (t) => {
      const w = windows[t.idx];
      if (!w) {
        await db.from("moment_job_tasks").update({ status: "failed", error: "Parte do vídeo inexistente.", updated_at: nowIso() }).eq("id", t.id);
        return;
      }
      const signals = transcript.audioSignals?.filter((s) => s.time >= w.start && s.time <= w.end);
      const nearby = exclude.filter((r) => r.end >= w.start - 30 && r.start <= w.end + 30);
      const r = await callFn("viral-moments", {
        videoId: proj.source_key,
        title: "",
        lines: w.lines,
        duration: job.duration,
        audioSignals: signals,
        refresh: job.refresh,
        words: w.words,
        exclude: nearby,
        windowed: !single,
      });
      if (r.ok && r.data?.success) {
        if (r.data.meta?.provider === "gemini") sawBackup = true;
        await db
          .from("moment_job_tasks")
          .update({
            status: "done",
            result: { moments: r.data.moments ?? [], videoTopic: r.data.meta?.videoTopic, provider: r.data.meta?.provider },
            updated_at: nowIso(),
          })
          .eq("id", t.id);
        return;
      }
      const message = String(r.data?.message || `Falha ao analisar o vídeo (${r.status}).`);
      // Both codes mean "no AI available right now" — retrying immediately won't help.
      if (r.data?.code === "AI_NO_CREDITS" || r.data?.code === "AI_FALLBACK_FAILED") {
        fatal = message; // no point in trying the other windows
        return;
      }
      if (t.attempts < MAX_ATTEMPTS) retried++;
      await db
        .from("moment_job_tasks")
        .update({ status: t.attempts >= MAX_ATTEMPTS ? "failed" : "pending", error: message, updated_at: nowIso() })
        .eq("id", t.id);
    })
  );
  if (fatal) {
    await failJob(job, fatal);
    return { worked: tasks.length, retried: 0 };
  }
  if (sawBackup && !job.used_backup) await patchJob(job.id, { used_backup: true });

  const { count: doneCount } = await db
    .from("moment_job_tasks")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id).eq("kind", "window").in("status", ["done", "failed"]);
  const done = doneCount ?? 0;
  await patchJob(job.id, {
    windows_done: done,
    progress: 5 + Math.round((60 * done) / Math.max(1, job.windows_total)),
    status_text:
      job.windows_total === 1 ? "Analisando os melhores momentos com IA..." : `Lendo o vídeo em partes (${done} de ${job.windows_total})...`,
  });
  return { worked: tasks.length, retried };
}

const stripSlice = (m: any) => {
  const { slice: _s, ...rest } = m;
  return rest;
};

async function finishScan(job: any) {
  const { data } = await db.from("moment_job_tasks").select("idx, status, result, error").eq("job_id", job.id).eq("kind", "window").order("idx");
  const tasks = (data || []) as any[];
  if (tasks.length === 0 || tasks.some((t) => t.status === "pending" || t.status === "running")) return;

  const ok = tasks.filter((t) => t.status === "done");
  if (ok.length === 0) {
    await failJob(job, tasks.find((t) => t.error)?.error || "Falha ao analisar o vídeo com IA.");
    return;
  }
  const single = tasks.length === 1;
  const cap = single ? CANDIDATES_SINGLE_WINDOW : CANDIDATES_PER_WINDOW;
  let candidates: Cand[] = [];
  for (const t of ok) {
    const best = [...(t.result?.moments || [])].sort((a: any, b: any) => b.score - a.score).slice(0, cap);
    best.forEach((m: any) => candidates.push({ ...m, id: `w${t.idx}-${m.id}` }));
  }
  candidates = dedupeByOverlap(candidates).slice(0, MAX_CANDIDATES);
  const videoTopic = ok.find((t) => t.result?.videoTopic)?.result?.videoTopic as string | undefined;
  const usedBackup = ok.some((t) => t.result?.provider === "gemini");
  const failed = tasks.length - ok.length;
  const warning =
    failed > 0
      ? `${failed} ${failed === 1 ? "parte do vídeo não pôde" : "partes do vídeo não puderam"} ser analisada${failed === 1 ? "" : "s"}. Rode "Nova análise" para tentar achar os cortes que faltaram.`
      : undefined;

  if (candidates.length === 0) {
    await finalize({ ...job, used_backup: usedBackup }, { moments: [], others: [], videoTopic, warning });
    return;
  }

  const chunks: Cand[][] = [];
  for (let i = 0; i < candidates.length; i += JUDGE_CHUNK) chunks.push(candidates.slice(i, i + JUDGE_CHUNK));
  const rows = chunks.map((c, i) => ({ job_id: job.id, kind: "judge", idx: i, payload: { candidates: c } }));
  await db.from("moment_job_tasks").upsert(rows, { onConflict: "job_id,kind,idx", ignoreDuplicates: true });
  await db
    .from("moment_jobs")
    .update({
      phase: "judge",
      windows_total: chunks.length,
      windows_done: 0,
      progress: 70,
      video_topic: videoTopic ?? null,
      warning: warning ?? null,
      used_backup: usedBackup,
      status_text: `Refinando ${candidates.length} candidatos com uma segunda IA (só os mais virais passam)...`,
      updated_at: nowIso(),
    })
    .eq("id", job.id)
    .eq("phase", "scan");
}

async function judgeBatch(job: any): Promise<BatchResult> {
  const limit = job.used_backup ? JUDGE_CONCURRENCY_BACKUP : JUDGE_CONCURRENCY;
  const { data: claimed } = await db.rpc("claim_moment_tasks", { p_job: job.id, p_kind: "judge", p_limit: limit });
  const tasks = (claimed || []) as any[];
  if (tasks.length === 0) return { worked: 0, retried: 0 };
  const proj = await loadProject(job.project_id);
  let retried = 0;
  let sawBackup = false;

  await Promise.all(
    tasks.map(async (t) => {
      const r = await callFn("viral-judge", {
        videoId: proj?.source_key ?? job.project_id,
        duration: job.duration,
        videoTopic: job.video_topic ?? undefined,
        refresh: job.refresh,
        candidates: t.payload?.candidates ?? [],
      });
      if (r.ok && r.data?.success) {
        if (r.data.meta?.provider === "gemini") sawBackup = true;
        await db
          .from("moment_job_tasks")
          .update({
            status: "done",
            result: { moments: r.data.moments ?? [], rejected: r.data.rejected ?? [], provider: r.data.meta?.provider },
            updated_at: nowIso(),
          })
          .eq("id", t.id);
        return;
      }
      const message = String(r.data?.message || `Falha ao revisar os cortes (${r.status}).`);
      if (t.attempts < MAX_ATTEMPTS) retried++;
      await db
        .from("moment_job_tasks")
        .update({ status: t.attempts >= MAX_ATTEMPTS ? "failed" : "pending", error: message, updated_at: nowIso() })
        .eq("id", t.id);
    })
  );

  const { count: doneCount } = await db
    .from("moment_job_tasks")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id).eq("kind", "judge").in("status", ["done", "failed"]);
  const done = doneCount ?? 0;
  await patchJob(job.id, {
    windows_done: done,
    progress: 70 + Math.round((28 * done) / Math.max(1, job.windows_total)),
    ...(sawBackup ? { used_backup: true } : {}),
  });
  return { worked: tasks.length, retried };
}

async function finishJudge(job: any) {
  const { data } = await db.from("moment_job_tasks").select("idx, status, result, payload").eq("job_id", job.id).eq("kind", "judge").order("idx");
  const tasks = (data || []) as any[];
  if (tasks.length === 0 || tasks.some((t) => t.status === "pending" || t.status === "running")) return;

  const kept: any[] = [];
  const others: any[] = [];
  const allCandidates: any[] = [];
  let judgeOk = 0;
  let usedBackup = !!job.used_backup;
  for (const t of tasks) {
    const cands: any[] = t.payload?.candidates ?? [];
    allCandidates.push(...cands);
    if (t.status === "done" && t.result) {
      judgeOk++;
      if (t.result.provider === "gemini") usedBackup = true;
      kept.push(...(t.result.moments || []));
      others.push(...(t.result.rejected || []));
    } else {
      // Never lose them: they come back as candidates the second AI did not get to review.
      others.push(...cands.map((m) => ({ ...stripSlice(m), other: true, rejectReason: "A segunda IA não conseguiu revisar este candidato. A nota é da primeira análise." })));
    }
  }

  if (judgeOk === 0) {
    // Judge down entirely: the first-pass list still beats an empty screen.
    const firstPass = [...allCandidates]
      .sort((a, b) => b.score - a.score)
      .slice(0, CANDIDATES_SINGLE_WINDOW)
      .map((m, i) => ({ ...stripSlice(m), id: `m${i + 1}` }));
    await finalize(
      { ...job, used_backup: usedBackup },
      { moments: firstPass, others: [], videoTopic: job.video_topic, warning: job.warning ?? "A revisão da segunda IA falhou; estes cortes vêm só da primeira análise." }
    );
    return;
  }

  const finalMoments = dedupeByOverlap(kept as Cand[]).map((m, i) => ({ ...stripSlice(m), id: `m${i + 1}` }));
  const finalOthers = dedupeByOverlap(others as Cand[])
    .filter((o) => !finalMoments.some((m: any) => overlapRatio(m, o) > 0.5))
    .slice(0, MAX_OTHERS)
    .map((o, i) => ({ ...stripSlice(o), id: `o${i + 1}`, other: true }));
  await finalize({ ...job, used_backup: usedBackup }, { moments: finalMoments, others: finalOthers, videoTopic: job.video_topic, warning: job.warning ?? undefined });
}

const sortStored = (list: any[]) => [
  ...list.filter((m) => !m.other).sort((a, b) => b.score - a.score),
  ...list.filter((m) => m.other).sort((a, b) => b.score - a.score),
];

// Saves the final lists as a run (or adds them to the round of the same duration) and closes the job.
async function finalize(
  job: any,
  result: { moments: any[]; others: any[]; videoTopic?: string | null; warning?: string }
) {
  const exclude: Range[] = Array.isArray(job.exclude) ? job.exclude : [];
  const isNew = (m: Range) => !exclude.some((r) => overlapRatio(m, r) > 0.3);
  const notices = [result.warning, job.used_backup ? BACKUP_NOTICE : undefined].filter(Boolean);
  const notice = notices.length > 0 ? notices.join(" ") : null;

  let existing: any = null;
  if (job.existing_run_id) {
    const { data } = await db.from("moment_runs").select("*").eq("id", job.existing_run_id).maybeSingle();
    existing = data;
  }

  let runId: string;
  let added: string[] = [];
  let totalTops: number;

  if (existing) {
    const freshMoments = result.moments.filter(isNew);
    const freshOthers = result.others.filter(isNew);
    if (freshMoments.length + freshOthers.length === 0) {
      await patchJob(job.id, {
        status: "done", phase: "done", progress: 100, status_text: null, run_id: existing.id, added_ids: [],
        notice: result.warning ?? 'Não encontramos mais cortes novos nesse vídeo com essa duração. Tente outra duração em "Nova análise".',
      });
      await db.from("moment_job_tasks").delete().eq("job_id", job.id);
      return;
    }
    // New ids continue after the existing ones so the cards never collide.
    const maxId = (prefix: string) =>
      (existing.moments as any[]).filter((m) => String(m.id).startsWith(prefix)).reduce((mx, m) => Math.max(mx, Number(String(m.id).replace(/\D/g, "")) || 0), 0);
    let nm = maxId("m");
    let no = maxId("o");
    const newOnes = [
      ...freshMoments.map((m) => ({ ...m, id: `m${++nm}` })),
      ...freshOthers.map((m) => ({ ...m, id: `o${++no}`, other: true })),
    ];
    const merged = sortStored([...(existing.moments as any[]), ...newOnes]);
    await db.from("moment_runs").update({ moments: merged }).eq("id", existing.id);
    runId = existing.id;
    added = newOnes.map((m) => m.id);
    totalTops = merged.filter((m) => !m.other).length;
  } else {
    const stored = sortStored([...result.moments, ...result.others]);
    const { data, error } = await db
      .from("moment_runs")
      .insert({ project_id: job.project_id, user_id: job.user_id, duration: job.duration, moments: stored, video_topic: result.videoTopic ?? null })
      .select("id")
      .single();
    if (error || !data) {
      await failJob(job, error?.message || "Não foi possível salvar os cortes.");
      return;
    }
    runId = data.id;
    added = stored.map((m) => m.id);
    totalTops = result.moments.length;
  }

  await db
    .from("moment_projects")
    .update({ stage: "ready", error: null, moments_count: totalTops, requested_duration: null })
    .eq("id", job.project_id);
  await patchJob(job.id, {
    status: "done", phase: "done", progress: 100, status_text: null, run_id: runId, added_ids: added, notice,
    video_topic: result.videoTopic ?? null,
  });
  await db.from("moment_job_tasks").delete().eq("job_id", job.id);
}

// ------------------------------------------------------------------------------------- the tick

async function tick(jobId: string) {
  const { data: first } = await db.from("moment_jobs").select("*").eq("id", jobId).maybeSingle();
  let job: any = first;
  if (!job || job.status === "done" || job.status === "failed") return;
  try {
    if (job.status === "pending") await patchJob(jobId, { status: "running" });
    await resetStaleTasks(jobId);
    if (!job.phase) {
      job = await initJob(job);
      if (!job) return;
    }

    let batch: BatchResult = { worked: 0, retried: 0 };
    if (job.phase === "scan") {
      batch = await scanBatch(job);
      const { data: cur } = await db.from("moment_jobs").select("*").eq("id", jobId).maybeSingle();
      if (cur && cur.status === "running") await finishScan(cur);
    } else if (job.phase === "judge") {
      batch = await judgeBatch(job);
      const { data: cur } = await db.from("moment_jobs").select("*").eq("id", jobId).maybeSingle();
      if (cur && cur.status === "running") await finishJudge(cur);
    }

    const { data: after } = await db.from("moment_jobs").select("status, phase").eq("id", jobId).maybeSingle();
    if (after?.status === "running") {
      // Only the tick that did work asks for the next one; an idle tick (tasks being run by another
      // tick) stays quiet, and the cron sweep covers the case where that other tick died.
      // A task that has to be repeated waits a little first (a failed start or a rate limit needs it).
      if (batch.retried > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
      if (batch.worked > 0 || after.phase !== job.phase) await kick(jobId);
      else await patchJob(jobId, {});
    }
  } catch (e) {
    console.error("tick error", jobId, e);
    // Leave the job running: the sweep retries it. After repeated trouble the tasks' attempts cap it.
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "tick" && typeof body.jobId === "string") {
      await tick(body.jobId);
      return json({ ok: true });
    }
    return json({ ok: false, message: "ação inválida" }, 400);
  } catch (e) {
    console.error("moment-jobs failed", e);
    return json({ ok: false, message: (e as Error).message }, 500);
  }
});
