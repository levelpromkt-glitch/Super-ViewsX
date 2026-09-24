const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.CLIP_SERVICE_API_KEY;
const MAX_CLIP_SECONDS = 180;
const PROCESS_TIMEOUT_MS = 120000;

// Comma-separated "host:port" pool (e.g. Webshare's free datacenter proxies).
// Routing yt-dlp through one of these instead of hitting YouTube directly
// from the VM keeps the VM's own IP out of it, so it can't get flagged.
const PROXY_LIST = (process.env.PROXY_LIST || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
const PROXY_USER = process.env.PROXY_USER;
const PROXY_PASS = process.env.PROXY_PASS;

function pickProxyUrl() {
  if (PROXY_LIST.length === 0) return null;
  const hostPort = PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
  const auth = PROXY_USER && PROXY_PASS ? `${PROXY_USER}:${PROXY_PASS}@` : "";
  return `http://${auth}${hostPort}/`;
}

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

function isValidVideoId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{11}$/.test(id);
}

function cleanup(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

function finishClip(res, tmpDir, filePath, vertical, filenameBase) {
  if (!vertical) {
    streamFile(res, filePath, tmpDir, `${filenameBase}.mp4`);
    return;
  }

  const verticalPath = path.join(tmpDir, "vertical.mp4");
  const py = spawn("python3", ["vertical_crop.py", filePath, verticalPath], {
    timeout: PROCESS_TIMEOUT_MS,
  });
  let pyStderr = "";
  py.stderr.on("data", (d) => { pyStderr += d.toString(); });
  py.on("error", (err) => {
    cleanup(tmpDir);
    if (!res.headersSent) res.status(500).json({ error: "SPAWN_ERROR", message: err.message });
  });
  py.on("close", (pyCode) => {
    if (pyCode !== 0 || !fs.existsSync(verticalPath)) {
      console.error("vertical_crop failed", pyCode, pyStderr.slice(-2000));
      cleanup(tmpDir);
      if (!res.headersSent) {
        res.status(502).json({ error: "VERTICAL_FAILED", message: "Não foi possível gerar a versão vertical." });
      }
      return;
    }
    streamFile(res, verticalPath, tmpDir, `${filenameBase}-vertical.mp4`);
  });
}

app.post("/clip", (req, res) => {
  if (API_KEY && req.get("x-api-key") !== API_KEY) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  const { videoId, sourceUrl, start, end, vertical } = req.body || {};

  const s = Number(start);
  const e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s) {
    return res.status(400).json({ error: "INVALID_RANGE" });
  }
  if (e - s > MAX_CLIP_SECONDS) {
    return res.status(400).json({
      error: "CLIP_TOO_LONG",
      message: `Clipes de no máximo ${MAX_CLIP_SECONDS}s.`,
    });
  }

  const jobId = crypto.randomBytes(8).toString("hex");
  const tmpDir = path.join(os.tmpdir(), `clip-${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Uploaded-file path: the video already lives in our own storage, so this
  // is a plain ffmpeg cut against a signed URL — no yt-dlp, no proxy, no
  // cookies, no bot-check, because YouTube is never involved.
  if (typeof sourceUrl === "string" && sourceUrl.startsWith("http")) {
    const outputPath = path.join(tmpDir, "clip.mp4");
    const ff = spawn("ffmpeg", [
      "-y",
      "-ss", String(s),
      "-i", sourceUrl,
      "-t", String(e - s),
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      outputPath,
    ], { timeout: PROCESS_TIMEOUT_MS });

    let ffStderr = "";
    ff.stderr.on("data", (d) => { ffStderr += d.toString(); });
    ff.on("error", (err) => {
      cleanup(tmpDir);
      if (!res.headersSent) res.status(500).json({ error: "SPAWN_ERROR", message: err.message });
    });
    ff.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(outputPath)) {
        console.error("ffmpeg cut (sourceUrl) failed", code, ffStderr.slice(-2000));
        cleanup(tmpDir);
        if (!res.headersSent) {
          res.status(502).json({ error: "DOWNLOAD_FAILED", message: "Não foi possível cortar o vídeo enviado." });
        }
        return;
      }
      finishClip(res, tmpDir, outputPath, vertical, `clip-upload-${s}-${e}`);
    });
    return;
  }

  if (!isValidVideoId(videoId)) {
    cleanup(tmpDir);
    return res.status(400).json({ error: "INVALID_VIDEO_ID" });
  }

  const outputTemplate = path.join(tmpDir, "clip.%(ext)s");
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // No --force-keyframes-at-cuts: that forces a full ffmpeg re-encode of the
  // clip, which reliably OOM-kills on Railway's free-tier memory limit. A
  // plain stream copy just snaps to the nearest keyframe (video may start/end
  // a couple seconds off) but needs a fraction of the memory.
  //
  // Capped at 720p (not 1080p): the VM is a single-core, ~1GB-RAM box, and
  // every byte here also goes through the proxy pool. TikTok/Reels/Shorts
  // re-compress on upload anyway, so 1080p bought nothing but slower
  // downloads. --concurrent-fragments overlaps the segment requests instead
  // of fetching them one at a time, which is most of the wall-clock time
  // when every request already has extra proxy round-trip latency.
  const args = [
    "--no-playlist",
    "--concurrent-fragments", "4",
    "--download-sections", `*${s}-${e}`,
    "-f", "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/best[height<=720]",
    "--merge-output-format", "mp4",
    "-o", outputTemplate,
  ];

  // Requests from a logged-in YouTube account trigger the bot-check far less
  // often than anonymous datacenter-IP requests. COOKIES_FILE is mounted as a
  // volume (not baked into the image) so it can be refreshed without a rebuild.
  const cookiesFile = process.env.COOKIES_FILE;
  if (cookiesFile && fs.existsSync(cookiesFile)) {
    args.push("--cookies", cookiesFile);
  }

  const proxyUrl = pickProxyUrl();
  if (proxyUrl) {
    console.log("using proxy", proxyUrl.replace(/:[^:@]+@/, ":***@"));
    args.push("--proxy", proxyUrl);
  }

  args.push(url);

  const child = spawn("yt-dlp", args, { timeout: PROCESS_TIMEOUT_MS });
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });

  child.on("error", (err) => {
    cleanup(tmpDir);
    if (!res.headersSent) {
      res.status(500).json({ error: "SPAWN_ERROR", message: err.message });
    }
  });

  child.on("close", (code) => {
    if (code !== 0) {
      console.error("yt-dlp failed", code, stderr.slice(-2000));
      cleanup(tmpDir);
      if (!res.headersSent) {
        const isBotCheck = /sign in to confirm/i.test(stderr);
        const message = isBotCheck
          ? "O YouTube bloqueou temporariamente o download desse vídeo específico (proteção anti-bot). Tente novamente em alguns minutos ou baixe outro vídeo."
          : "Não foi possível baixar/cortar o vídeo.";
        res.status(502).json({ error: isBotCheck ? "YOUTUBE_BOT_CHECK" : "DOWNLOAD_FAILED", message });
      }
      return;
    }

    let files = [];
    try {
      files = fs.readdirSync(tmpDir).filter((f) => f.startsWith("clip."));
    } catch {
      files = [];
    }

    if (files.length === 0) {
      cleanup(tmpDir);
      return res.status(502).json({ error: "NO_OUTPUT", message: "Corte não gerado." });
    }

    const filePath = path.join(tmpDir, files[0]);
    finishClip(res, tmpDir, filePath, vertical, `clip-${videoId}-${s}-${e}`);
  });
});

// Shared by the synchronous /transcribe endpoint and the async job worker.
// Not bound by any Supabase Edge Function wall-clock limit — this runs
// directly on the VM, so a 2-hour podcast is just as fine as a 5-minute one.
function transcribeFromUrl(sourceUrl) {
  return new Promise((resolve, reject) => {
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) {
      reject({ code: "MISSING_CONFIG", message: "DEEPGRAM_API_KEY não configurada." });
      return;
    }

    const jobId = crypto.randomBytes(8).toString("hex");
    const tmpDir = path.join(os.tmpdir(), `transcribe-${jobId}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const audioPath = path.join(tmpDir, "audio.mp3");

    // No timeout here on purpose: long source videos can genuinely take a
    // while to read over the network, and the worker loop isn't held to any
    // external wall-clock budget the way an Edge Function would be.
    const ff = spawn("ffmpeg", [
      "-y", "-i", sourceUrl,
      "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k",
      audioPath,
    ]);

    let ffStderr = "";
    ff.stderr.on("data", (d) => { ffStderr += d.toString(); });
    ff.on("error", (err) => {
      cleanup(tmpDir);
      reject({ code: "SPAWN_ERROR", message: err.message });
    });
    ff.on("close", async (code) => {
      if (code !== 0 || !fs.existsSync(audioPath)) {
        console.error("audio extraction failed", code, ffStderr.slice(-2000));
        cleanup(tmpDir);
        reject({ code: "AUDIO_EXTRACT_FAILED", message: "Não foi possível extrair o áudio do vídeo." });
        return;
      }

      try {
        const audioBuffer = fs.readFileSync(audioPath);
        const dgResponse = await fetch(
          "https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&utterances=true&punctuate=true",
          {
            method: "POST",
            headers: {
              Authorization: `Token ${deepgramKey}`,
              "Content-Type": "audio/mpeg",
            },
            body: audioBuffer,
          }
        );

        if (!dgResponse.ok) {
          const errText = await dgResponse.text();
          console.error("Deepgram error", dgResponse.status, errText.slice(-2000));
          cleanup(tmpDir);
          reject({ code: "TRANSCRIBE_FAILED", message: "Falha ao transcrever o áudio." });
          return;
        }

        const dgData = await dgResponse.json();
        const utterances = dgData?.results?.utterances || [];
        const videoDurationSec = dgData?.metadata?.duration || 0;

        const lines = utterances
          .filter((u) => typeof u.transcript === "string" && u.transcript.trim())
          .map((u) => {
            const startSec = Math.floor(u.start);
            const mm = String(Math.floor(startSec / 60)).padStart(2, "0");
            const ss = String(startSec % 60).padStart(2, "0");
            return {
              time: `${mm}:${ss}`,
              seconds: startSec,
              text: u.transcript.trim(),
              start: u.start,
              duration: u.end - u.start,
            };
          });

        cleanup(tmpDir);
        resolve({ lines, videoDurationSec });
      } catch (err) {
        console.error("transcribe failed", err);
        cleanup(tmpDir);
        reject({ code: "INTERNAL_ERROR", message: err.message });
      }
    });
  });
}

app.post("/transcribe", (req, res) => {
  if (API_KEY && req.get("x-api-key") !== API_KEY) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  const { sourceUrl } = req.body || {};
  if (typeof sourceUrl !== "string" || !sourceUrl.startsWith("http")) {
    return res.status(400).json({ error: "INVALID_REQUEST", message: "sourceUrl é obrigatório." });
  }

  transcribeFromUrl(sourceUrl)
    .then((result) => res.json(result))
    .catch((err) => res.status(502).json({ error: err.code || "TRANSCRIBE_FAILED", message: err.message }));
});

// --- Async job worker -------------------------------------------------
// Polls Supabase directly for pending video_jobs (transcription requests
// too large/slow to fit inside a Supabase Edge Function's 150s wall-clock
// limit) and processes them with no such ceiling. The VM is the client here
// — it calls out to Supabase, not the other way around, so nothing about
// this loop is bound by Edge Function limits.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JOB_POLL_INTERVAL_MS = 8000;

async function claimNextVideoJob() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_next_video_job`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) {
    console.error("claim_next_video_job failed", res.status, await res.text().catch(() => ""));
    return null;
  }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function markVideoJob(id, patch) {
  await fetch(`${SUPABASE_URL}/rest/v1/video_jobs?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  }).catch((err) => console.error("markVideoJob failed", err));
}

// The VM is a single CPU core: process one queued job at a time rather than
// letting overlapping poll ticks kick off several ffmpeg/Deepgram jobs at once.
let isProcessingVideoJob = false;

async function pollVideoJobs() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || isProcessingVideoJob) return;
  isProcessingVideoJob = true;
  try {
    const job = await claimNextVideoJob();
    if (!job) return;

    console.log("processing video_job", job.id);
    try {
      const sourceUrl = await resolveJobSourceUrl(job.source);
      const result = await transcribeFromUrl(sourceUrl);
      await markVideoJob(job.id, { status: "completed", result });
      console.log("video_job completed", job.id);
    } catch (err) {
      console.error("video_job failed", job.id, err);
      await markVideoJob(job.id, {
        status: "failed",
        error_message: (err && err.message) || "Erro ao processar o vídeo.",
      });
    }
  } catch (err) {
    console.error("pollVideoJobs error", err);
  } finally {
    isProcessingVideoJob = false;
  }
}

// The job's `source` is either a public/already-signed URL, or an R2 key
// that needs its own presigned GET URL minted right before use (so it's
// always fresh regardless of how long the job sat in the queue).
async function resolveJobSourceUrl(source) {
  if (source && typeof source.sourceUrl === "string") return source.sourceUrl;
  if (source && typeof source.r2Key === "string") return getR2SignedGetUrl(source.r2Key);
  throw { code: "INVALID_REQUEST", message: "Job sem origem de vídeo válida." };
}

function getR2SignedGetUrl(key) {
  const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

setInterval(pollVideoJobs, JOB_POLL_INTERVAL_MS);

function streamFile(res, filePath, tmpDir, filename) {
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on("close", () => cleanup(tmpDir));
  stream.on("error", () => cleanup(tmpDir));
}

app.listen(PORT, () => console.log(`Clip service listening on port ${PORT}`));
