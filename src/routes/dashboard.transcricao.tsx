import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Flag,
  Link2,
  Loader2,
  Scissors,
  Search,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/transcricao")({
  component: TranscricaoPage,
});

type Line = { time: string; seconds: number; text: string };

const MOCK_TRANSCRIPT: Line[] = [
  { time: "00:01", seconds: 1, text: "Olá pessoal, tudo bem? Sejam muito bem-vindos a mais um vídeo aqui no canal." },
  { time: "00:08", seconds: 8, text: "Hoje eu vou mostrar como criar cortes estratégicos que viralizam nas redes sociais." },
  { time: "00:17", seconds: 17, text: "Antes de começar, deixa o like no vídeo e se inscreve aqui no canal pra não perder nenhuma novidade." },
  { time: "00:27", seconds: 27, text: "Esse tipo de conteúdo ajuda a prender mais atenção do espectador e aumenta o tempo de retenção." },
  { time: "00:35", seconds: 35, text: "Primeiro você precisa escolher um bom trecho do vídeo, algo que prenda a atenção logo nos primeiros segundos." },
  { time: "00:48", seconds: 48, text: "Lembre-se: o gancho é tudo. Sem gancho, o vídeo não decola e o espectador fecha em poucos segundos." },
  { time: "01:02", seconds: 62, text: "Agora vamos selecionar a melhor parte para transformar em corte e publicar no Shorts e Reels." },
  { time: "01:18", seconds: 78, text: "Uma dica importante: cortes entre 30 e 60 segundos costumam ter o melhor desempenho nas plataformas." },
  { time: "01:35", seconds: 95, text: "Sempre legende seus cortes. A maioria das pessoas assiste sem som, principalmente no feed." },
  { time: "01:52", seconds: 112, text: "Use uma chamada forte no início, algo que faça a pessoa parar de rolar a tela imediatamente." },
  { time: "02:10", seconds: 130, text: "Bora pra parte prática agora, vou te mostrar passo a passo como eu organizo os meus cortes." },
  { time: "02:28", seconds: 148, text: "Eu gosto de separar por temas e por nível de engajamento esperado em cada plataforma." },
  { time: "02:45", seconds: 165, text: "Pra finalizar, lembre-se de testar diferentes formatos e analisar as métricas com calma." },
  { time: "03:02", seconds: 182, text: "É isso pessoal, espero que tenha curtido. Nos vemos no próximo vídeo. Valeu!" },
];

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => ["embed", "shorts", "live"].includes(p));
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch {
    return null;
  }
  return null;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function parseTime(value: string): number | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  const sec = parseInt(m[2], 10);
  if (sec >= 60) return null;
  return min * 60 + sec;
}

function formatDuration(sec: number) {
  if (sec < 60) return `${sec} segundos`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function TranscricaoPage() {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState<Line[] | null>(null);

  const [query, setQuery] = useState("");
  const [activeLine, setActiveLine] = useState<Line | null>(null);
  const [seekTo, setSeekTo] = useState<number>(0);

  const [startStr, setStartStr] = useState("");
  const [endStr, setEndStr] = useState("");
  const [success, setSuccess] = useState(false);

  const startSec = parseTime(startStr);
  const endSec = parseTime(endStr);
  const validRange = startSec !== null && endSec !== null && endSec > startSec;
  const rangeError =
    startSec !== null && endSec !== null && endSec <= startSec
      ? "O fim precisa ser maior que o início."
      : null;

  const filteredIds = useMemo(() => {
    if (!transcript || !query.trim()) return null;
    const q = query.trim().toLowerCase();
    return new Set(transcript.filter((l) => l.text.toLowerCase().includes(q)).map((l) => l.time));
  }, [transcript, query]);

  useEffect(() => {
    setSuccess(false);
  }, [startStr, endStr]);

  const handleProceed = () => {
    const id = extractYouTubeId(url);
    if (!url.trim()) {
      setUrlError("Por favor, insira uma URL do YouTube.");
      return;
    }
    if (!id) {
      setUrlError("URL inválida. Cole um link do YouTube (ex.: https://youtube.com/watch?v=...).");
      return;
    }
    setUrlError(null);
    setVideoId(id);
    setTranscript(null);
    setActiveLine(null);
    setStartStr("");
    setEndStr("");
    setSeekTo(0);
    setSuccess(false);
  };

  const handleGenerate = () => {
    setLoading(true);
    setTranscript(null);
    setActiveLine(null);
    setSuccess(false);
    setTimeout(() => {
      setTranscript(MOCK_TRANSCRIPT);
      setLoading(false);
    }, 1600);
  };

  const handleLineClick = (line: Line) => {
    setActiveLine(line);
    setSeekTo(line.seconds);
  };

  const handleMarkStart = () => {
    if (!activeLine) return;
    setStartStr(activeLine.time);
    if (endSec !== null && endSec <= activeLine.seconds) setEndStr("");
  };

  const highlight = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark className="tr-mark">{text.slice(i, i + q.length)}</mark>
        {text.slice(i + q.length)}
      </>
    );
  };

  const noResults = filteredIds && filteredIds.size === 0;
  const embedSrc = videoId
    ? `https://www.youtube.com/embed/${videoId}?start=${seekTo}${seekTo > 0 ? "&autoplay=1" : ""}`
    : "";

  return (
    <div className="tr-page">

      {/* Step 1 — URL */}
      <section className="tr-card tr-input-card">
        <div className="tr-input-lead">
          <div className="tr-input-badge">
            <Link2 size={16} className="tr-icon-lime" />
            <span>Etapa 1</span>
          </div>
          <h2 className="tr-input-title">Cole o link do YouTube</h2>
          <p className="tr-input-hint">
            Insira a URL do vídeo para gerar a transcrição e selecionar os melhores cortes.
          </p>
        </div>
        <div className="tr-url-row">
          <input
            className="tr-input"
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (urlError) setUrlError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleProceed()}
          />
          <button className="btn-primary tr-btn-main" onClick={handleProceed}>
            Prosseguir <ArrowRight size={16} />
          </button>
        </div>
        {urlError && <div className="tr-error">{urlError}</div>}
      </section>

      {/* Step 2 — Preview + Generate */}
      {videoId && (
        <section className="tr-card tr-fade">
          <div className="tr-card-head">
            <Sparkles size={18} className="tr-icon-lime" />
            <h2>2. Prévia do vídeo</h2>
          </div>
          <div className="tr-video-card">
            <div className="tr-video-wrap">
              <iframe
                key={embedSrc}
                src={embedSrc}
                title="Prévia do vídeo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
          <button
            className="btn-primary tr-btn-main tr-generate"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="tr-spin" /> Processando áudio...
              </>
            ) : (
              <>
                <Sparkles size={16} /> Gerar transcrição
              </>
            )}
          </button>
        </section>
      )}

      {/* Loading state */}
      {loading && (
        <section className="tr-card tr-loading">
          <div className="tr-loader-ring" />
          <div className="tr-loader-text">
            <strong>Transcrevendo seu vídeo...</strong>
            <span>Analisando faixas de áudio e organizando os trechos por tempo.</span>
          </div>
        </section>
      )}

      {/* Step 3 — Transcript */}
      {transcript && (
        <section className="tr-card tr-fade">
          <div className="tr-card-head">
            <Scissors size={18} className="tr-icon-lime" />
            <h2>3. Transcrição</h2>
            <span className="tr-pill">{transcript.length} trechos</span>
          </div>

          <div className="tr-search">
            <Search size={16} />
            <input
              className="tr-input tr-input-search"
              placeholder="Buscar palavra ou frase na transcrição..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {noResults ? (
            <div className="tr-empty">Nenhum trecho encontrado.</div>
          ) : (
            <div className="tr-list-wrap">
            <ul className="tr-list">
              {transcript.map((l) => {
                const match = !filteredIds || filteredIds.has(l.time);
                const isActive = activeLine?.time === l.time;
                return (
                  <li
                    key={l.time}
                    className={[
                      "tr-line tr-line-clickable",
                      match ? "" : "tr-line-dim",
                      isActive ? "tr-line-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleLineClick(l)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleLineClick(l);
                      }
                    }}
                  >
                    <span className="tr-time">{l.time}</span>
                    <p className="tr-text">{highlight(l.text)}</p>
                    {isActive && (
                      <div className="tr-line-actions">
                        <button
                          className="tr-chip tr-chip-lime"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkStart();
                          }}
                        >
                          <Flag size={12} /> Marcar como início
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            </div>
          )}
        </section>
      )}

      {/* Step 4 — Selected segment editor */}
      {transcript && (
        <section className="tr-card tr-summary tr-fade">
          <div className="tr-card-head">
            <Scissors size={18} className="tr-icon-lime" />
            <h2>4. Trecho selecionado</h2>
          </div>
          <div className="tr-summary-grid">
            <label>
              <span className="tr-summary-label">Início</span>
              <input
                className="tr-time-input"
                type="text"
                placeholder="00:00"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
              />
            </label>
            <label>
              <span className="tr-summary-label">Fim</span>
              <input
                className="tr-time-input"
                type="text"
                placeholder="00:00"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
              />
            </label>
            <div>
              <span className="tr-summary-label">Duração</span>
              <strong>
                {validRange ? formatDuration(endSec! - startSec!) : "—"}
              </strong>
            </div>
          </div>
          {rangeError && <div className="tr-error">{rangeError}</div>}
          {!startStr && !endStr && (
            <p className="tr-muted" style={{ padding: 0 }}>
              Clique em uma linha da transcrição e use “Marcar como início”, ou digite os tempos manualmente (formato MM:SS).
            </p>
          )}
          <div className="tr-summary-actions">
            <button
              className="btn-primary tr-btn-main"
              onClick={() => setSuccess(true)}
              disabled={!validRange || success}
            >
              <Download size={16} /> Baixar corte
            </button>
          </div>
          {success && (
            <div className="tr-success">
              <CheckCircle2 size={18} />
              <div>
                <strong>Corte gerado com sucesso — versão demonstrativa.</strong>
                <span>O download real será ativado em breve.</span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Empty state when no transcript yet */}
      {videoId && !transcript && !loading && (
        <section className="tr-empty-state">
          <Sparkles size={22} />
          <p>
            Clique em <strong>Gerar transcrição</strong> acima para criar uma transcrição simulada
            do vídeo.
          </p>
        </section>
      )}
    </div>
  );
}
