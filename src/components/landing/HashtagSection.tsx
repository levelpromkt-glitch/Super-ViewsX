import { Hash, MousePointer2, Search, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Scene = 0 | 1 | 2;
const QUERY = "#podcast";
const SCENE_TOTAL_MS = 3400 + 2100 + 2100;

function useInView<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => e.isIntersecting && setInView(true),
      { threshold: 0.25 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, inView];
}

function HashtagDemo() {
  const [wrapRef, inView] = useInView<HTMLDivElement>();
  const [scene, setScene] = useState<Scene>(0);
  const [typed, setTyped] = useState("");
  const [cursorState, setCursorState] = useState<"idle" | "hover" | "click">("idle");
  // Scene 1 (video selection) — which card is highlighted / clicked
  const [selIdx, setSelIdx] = useState<number>(-1);
  const [selClick, setSelClick] = useState<number>(-1);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) =>
      timers.push(setTimeout(() => !cancelled && fn(), ms));

    const cycle = () => {
      // reset
      setScene(0);
      setTyped("");
      setCursorState("idle");
      setSelIdx(-1);
      setSelClick(-1);
      setProgress(0);

      // === Scene 1 — title + search together ===
      const typeStart = 500;
      for (let i = 1; i <= QUERY.length; i++) {
        at(typeStart + i * 55, () => setTyped(QUERY.slice(0, i)));
      }
      const typeDone = typeStart + QUERY.length * 55;
      at(typeDone + 140, () => setCursorState("hover"));
      at(typeDone + 520, () => setCursorState("click"));

      const scene1End = typeDone + 1800; // ~3.4s

      // === Scene 2 — video selection ===
      at(scene1End, () => setScene(1));
      at(scene1End + 280, () => setSelIdx(0));
      at(scene1End + 560, () => setSelClick(0));
      at(scene1End + 780, () => setSelIdx(1));
      at(scene1End + 1020, () => setSelClick(1));
      at(scene1End + 1220, () => setSelIdx(2));
      at(scene1End + 1460, () => setSelClick(2));

      const scene2End = scene1End + 1900;

      // === Scene 3 — final message ===
      at(scene2End, () => setScene(2));

      const loopEnd = scene2End + 2100;
      at(loopEnd, cycle);

      // progress bar — one smooth interval per cycle
      const start = performance.now();
      const tick = () => {
        if (cancelled) return;
        const t = performance.now() - start;
        const p = Math.min(100, (t / loopEnd) * 100);
        setProgress(p);
        if (t < loopEnd) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    cycle();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [inView]);

  const videos = [
    { views: "2.4M", title: "Corte viral #1" },
    { views: "1.8M", title: "Corte viral #2" },
    { views: "980k", title: "Corte viral #3" },
  ];

  return (
    <div className="hd2-panel" ref={wrapRef} aria-hidden="true">
      <div className="vz-macbar">
        <div className="vz-macdots">
          <span />
          <span />
          <span />
        </div>
        <span className="vz-mactitle">Minerar vídeos virais</span>
      </div>

      <div className="hd2-stage">
        {/* Scene 1 — title + search together */}
        <div className="hd2-scene" data-active={scene === 0}>
          <div className="hd2-scene1">
            <span className="hd2-scene-hint">Busque por uma hashtag</span>
            <div className="hd2-searchrow">
              <div className="hd2-searchbar" data-focus>
                <Hash size={18} className="hd2-searchicon" />
                <span className="hd2-typed">
                  {typed || <span className="hd2-placeholder">#suahashtag</span>}
                  <span className="hd2-caret" />
                </span>
              </div>
              <button
                className="hd2-btn"
                data-pressed={cursorState === "click"}
                type="button"
                tabIndex={-1}
              >
                <Search size={16} />
                <span>Buscar</span>
              </button>
              <MousePointer2
                size={24}
                className="hd2-cursor"
                data-state={cursorState}
                strokeWidth={1.5}
              />
            </div>
          </div>
        </div>

        {/* Scene 2 — message + quick video selection */}
        <div className="hd2-scene" data-active={scene === 1}>
          <div className="hd2-scene2">
            <span className="hd2-scene-msg">
              Encontre os vídeos mais <span className="hd2-accent">virais</span> para modelar
            </span>
            <div className="hd2-videos">
              {videos.map((v, i) => (
                <div
                  key={i}
                  className="hd2-video"
                  data-hover={selIdx === i}
                  data-click={selClick === i}
                >
                  <div className="hd2-video-thumb">
                    <Play size={16} />
                  </div>
                  <div className="hd2-video-meta">
                    <span className="hd2-video-title">{v.title}</span>
                    <span className="hd2-video-views">{v.views} views</span>
                  </div>
                </div>
              ))}
              <MousePointer2
                size={22}
                className="hd2-cursor2"
                data-idx={selIdx}
                strokeWidth={1.5}
              />
            </div>
          </div>
        </div>

        {/* Scene 3 */}
        <div className="hd2-scene" data-active={scene === 2}>
          <span className="hd2-scene-msg">
            Gere <span className="hd2-accent">milhares de views</span> rapidamente
          </span>
        </div>

        {/* Progress bar */}
        <div className="hd2-progress">
          <div className="hd2-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <img src="/logo.png" alt="" className="hd2-watermark" aria-hidden="true" />
      </div>
    </div>
  );
}

export function HashtagSection() {
  return (
    <section className="lp-section" id="pesquisar-hashtag">
      <div className="hd2-head">
        <span className="lp-eyebrow">MINERAÇÃO AUTOMÁTICA</span>
        <h2 className="lp-section-title">
          Pare de tentar a sorte e <span className="lp-accent">poste apenas o que vai viralizar</span>
        </h2>
      </div>

      <div className="hd2-wrap">
        <div className="vz-frame hd2-frame">
          <HashtagDemo />
        </div>
      </div>
    </section>
  );
}
