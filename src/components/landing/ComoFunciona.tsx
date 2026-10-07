import { useCallback, useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Sparkles } from "lucide-react";

// Segunda seção da landing: um vídeo longo vira os cortes mais fortes.
// A linha do tempo é varrida por um scanner; cada trecho forte acende, ganha nota e
// "sai" como um corte. Tudo é decorativo/ilustrativo (sem dados reais).

const BARS = 110;
const SCAN_SEC = 3.6;

type Clip = { n: number; at: [number, number]; score: number; title: string; tag: string; dur: string; hue: number };

const clips: Clip[] = [
  { n: 1, at: [7, 11], score: 92, title: "Ele largou uma mentoria de 100 mil e fez 2,5 milhões", tag: "Dinheiro", dur: "0:24", hue: 92 },
  { n: 2, at: [23, 27], score: 88, title: "O problema não é quem engana, é o enganado", tag: "Contraintuitivo", dur: "0:22", hue: 150 },
  { n: 3, at: [42, 46], score: 85, title: "Cada não que você toma vale 100 reais", tag: "Dinheiro", dur: "0:23", hue: 70 },
  { n: 4, at: [63, 67], score: 81, title: "Se eu palestrar na sua empresa, gente pede demissão", tag: "História", dur: "0:19", hue: 120 },
  { n: 5, at: [82, 86], score: 77, title: "Seu certificado de mentor é o 1º PIX na parede", tag: "Humor", dur: "0:14", hue: 100 },
];

const features = [
  {
    title: "Transcreve palavra por palavra",
    text: "Cada fala com o tempo exato, para o corte sempre começar e terminar numa frase inteira.",
  },
  {
    title: "Procura o gancho e o fecho",
    text: "A IA lê o texto de cada trecho e só aprova o que prende logo no início e fecha a ideia no fim.",
  },
  {
    title: "Dá nota de 0 a 100",
    text: "Você vê primeiro os cortes com maior chance de viralizar, com título pronto para postar.",
  },
];

// Pseudo-random but deterministic, so server and browser render the same bars.
const barHeight = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  const r = x - Math.floor(x);
  const wave = 0.5 + 0.5 * Math.sin(i * 0.37);
  return Math.round(22 + 58 * (0.55 * r + 0.45 * wave));
};

const inClip = (i: number) => {
  const pct = ((i + 0.5) / BARS) * 100;
  return clips.find((c) => pct >= c.at[0] && pct <= c.at[1]);
};

function CountUp({ to, delayMs, run }: { to: number; delayMs: number; run: number }) {
  const [value, setValue] = useState(to);
  useEffect(() => {
    if (!run) {
      setValue(0);
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      return;
    }
    setValue(0);
    let raf = 0;
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 900);
        setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [run, to, delayMs]);
  return <>{value}</>;
}

const captionOf = (title: string) => {
  const words = title.replace(/[.,!?]/g, "").toUpperCase().split(" ").slice(0, 4);
  return words.map((w, i) => (
    <span key={i} className={i === 1 ? "cl-cap-hl" : undefined}>
      {w}{" "}
    </span>
  ));
};

export function ComoFunciona() {
  // Watch only the (short) timeline: the whole block is taller than a phone screen.
  const trackRef = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0); // 0 = not started; changes on every (re)play
  const [done, setDone] = useState(false);
  const startedRef = useRef(false);

  const play = useCallback(() => {
    setDone(false);
    setRun(0);
    // A short pause so the browser sees the "reset" state and restarts every CSS animation
    // (a timer, not requestAnimationFrame: browsers pause that one in background tabs).
    setTimeout(() => setRun((n) => n + 1), 60);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          play();
          observer.disconnect();
        }
      },
      { threshold: 0.6, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [play]);

  useEffect(() => {
    if (!run) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setDone(true), reduced ? 0 : (SCAN_SEC + 0.8) * 1000);
    return () => clearTimeout(timer);
  }, [run]);

  const delayFor = (pct: number) => `${((pct / 100) * SCAN_SEC).toFixed(2)}s`;

  return (
    <section className="lp-section" id="como-funciona">
      <div className="lp-section-head">
        <span className="lp-eyebrow">IA DE CORTES</span>
        <h2 className="lp-section-title">
          Um podcast de 1 hora. Os cortes que <span className="lp-accent">realmente viralizam</span>
        </h2>
        <p className="lp-section-sub">
          Envie o vídeo ou cole o link. A IA transcreve, acha os trechos com gancho forte e entrega os cortes prontos, com título e nota de viralidade.
        </p>
      </div>

      <div className={`cl-stage${run ? " is-running" : ""}${done ? " is-done" : ""}`} aria-label="Exemplo de análise de um vídeo longo">
        <div className="cl-top">
          <div className="cl-file">
            <span className="cl-file-icon"><Play size={13} fill="currentColor" /></span>
            <span className="cl-file-name">Podcast #214 — Como faturei 100 mil.mp4</span>
            <span className="cl-file-len">1:02:14</span>
          </div>
          <span className="cl-status" data-state={done ? "done" : run ? "scan" : "idle"}>
            <i />
            {done ? "5 momentos virais encontrados" : run ? "Analisando o vídeo…" : "Pronto para analisar"}
          </span>
        </div>

        <div className="cl-track-wrap" ref={trackRef}>
          <div className="cl-track" aria-hidden="true">
            {Array.from({ length: BARS }).map((_, i) => {
              const clip = inClip(i);
              return (
                <span
                  key={i}
                  className={`cl-bar${clip ? " hit" : ""}`}
                  style={{
                    ["--h" as string]: `${barHeight(i)}%`,
                    ["--d" as string]: delayFor(((i + 0.5) / BARS) * 100),
                  }}
                />
              );
            })}
            <span className="cl-scan" style={{ ["--scan" as string]: `${SCAN_SEC}s` }} />
          </div>

          {clips.map((c) => (
            <div
              key={c.n}
              className="cl-seg"
              style={{
                left: `${c.at[0]}%`,
                width: `${c.at[1] - c.at[0]}%`,
                ["--d" as string]: delayFor(c.at[1]),
              }}
              aria-hidden="true"
            >
              <span className="cl-badge">
                <Sparkles size={10} /> {c.score}
              </span>
              <span className="cl-seg-line" />
              <span className="cl-seg-n">{c.n}</span>
            </div>
          ))}

          <div className="cl-axis" aria-hidden="true">
            <span>0:00</span>
            <span>15:00</span>
            <span>30:00</span>
            <span>45:00</span>
            <span>1:02:14</span>
          </div>
        </div>

        <div className="cl-cards">
          {clips.map((c) => (
            <article
              key={c.n}
              className="cl-card"
              style={{ ["--d" as string]: `${((c.at[1] / 100) * SCAN_SEC + 0.25).toFixed(2)}s`, ["--hue" as string]: c.hue }}
            >
              <div className="cl-frame">
                <span className="cl-frame-n">{c.n}</span>
                <span className="cl-frame-play"><Play size={14} fill="currentColor" /></span>
                <p className="cl-cap">{captionOf(c.title)}</p>
                <span className="cl-frame-dur">{c.dur}</span>
              </div>
              <div className="cl-card-body">
                <h3>{c.title}</h3>
                <div className="cl-card-row">
                  <span className="cl-score" data-top={c.score >= 90}>
                    <b><CountUp to={c.score} delayMs={Math.round((c.at[1] / 100) * SCAN_SEC * 1000 + 250)} run={run} /></b>
                    <small>viral</small>
                  </span>
                  <span className="cl-tag">{c.tag}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="cl-foot">
          <span>Exemplo ilustrativo de uma análise.</span>
          <button type="button" className="cl-replay" onClick={play}>
            <RotateCcw size={12} /> Ver de novo
          </button>
        </div>
      </div>

      <div className="cl-feats">
        {features.map((f, i) => (
          <div key={f.title} className="cl-feat">
            <span className="cl-feat-n">{String(i + 1).padStart(2, "0")}</span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
