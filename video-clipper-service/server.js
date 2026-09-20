const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.CLIP_SERVICE_API_KEY;
const MAX_CLIP_SECONDS = 180;
const PROCESS_TIMEOUT_MS = 120000;

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

app.post("/clip", (req, res) => {
  if (API_KEY && req.get("x-api-key") !== API_KEY) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  const { videoId, start, end } = req.body || {};

  if (!isValidVideoId(videoId)) {
    return res.status(400).json({ error: "INVALID_VIDEO_ID" });
  }
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
  const outputTemplate = path.join(tmpDir, "clip.%(ext)s");
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const args = [
    "--no-playlist",
    "--download-sections", `*${s}-${e}`,
    "--force-keyframes-at-cuts",
    "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/best[height<=1080]",
    "--merge-output-format", "mp4",
    "-o", outputTemplate,
    url,
  ];

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
        res.status(502).json({ error: "DOWNLOAD_FAILED", message: "Não foi possível baixar/cortar o vídeo." });
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
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="clip-${videoId}-${s}-${e}.mp4"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on("close", () => cleanup(tmpDir));
    stream.on("error", () => cleanup(tmpDir));
  });
});

app.listen(PORT, () => console.log(`Clip service listening on port ${PORT}`));
