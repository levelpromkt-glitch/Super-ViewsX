import { useEffect, useRef, useState } from "react";

const steps = [
  "Descubra os vídeos que o algoritmo está impulsionando",
  "Minera os clipes mais virais em alta",
  "Saiba em minutos o vídeo certo para modelar",
  "Transcrição automática — busque qualquer fala em segundos",
  "Templates prontos para você usar no seu vídeo",
  "Monitore os top clipadores de qualquer competição",
];

export function ComoFunciona() {
  const gridRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );

    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="lp-section" id="como-funciona">
      <div className="lp-section-head">
        <span className="lp-eyebrow">FERRAMENTAS PODEROSAS</span>
        <h2 className="lp-section-title">
          As ferramentas certas para{" "}
          <span className="lp-accent">viralizar em poucos cliques&nbsp; e sem perder tempo</span>
        </h2>
        <p className="lp-section-sub">
          Sabemos o que é preciso para viralizar. A Super Views oferece a você o
          <br />&nbsp; poder de crescer seus canais de forma mais rápida e inteligente
        </p>
      </div>

      <div
        ref={gridRef}
        className={`cf-grid${visible ? " is-visible" : ""}`}
        aria-label="Como funciona"
      >
        <svg className="cf-mesh" aria-hidden="true" preserveAspectRatio="none">
          <defs>
            <linearGradient id="cfMeshGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(158,255,46,0)" />
              <stop offset="50%" stopColor="rgba(158,255,46,0.28)" />
              <stop offset="100%" stopColor="rgba(158,255,46,0)" />
            </linearGradient>
            <linearGradient id="cfMeshGradV" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(158,255,46,0)" />
              <stop offset="50%" stopColor="rgba(158,255,46,0.22)" />
              <stop offset="100%" stopColor="rgba(158,255,46,0)" />
            </linearGradient>
          </defs>
          <line x1="10%" y1="25%" x2="90%" y2="25%" stroke="url(#cfMeshGrad)" strokeWidth="1" />
          <line x1="10%" y1="75%" x2="90%" y2="75%" stroke="url(#cfMeshGrad)" strokeWidth="1" />
          <line x1="16.66%" y1="12%" x2="16.66%" y2="88%" stroke="url(#cfMeshGradV)" strokeWidth="1" />
          <line x1="50%" y1="12%" x2="50%" y2="88%" stroke="url(#cfMeshGradV)" strokeWidth="1" />
          <line x1="83.33%" y1="12%" x2="83.33%" y2="88%" stroke="url(#cfMeshGradV)" strokeWidth="1" />
          {/* nodes at intersections */}
          {[16.66, 50, 83.33].flatMap((x) =>
            [25, 75].map((y) => (
              <circle
                key={`${x}-${y}`}
                cx={`${x}%`}
                cy={`${y}%`}
                r="2"
                fill="rgba(158,255,46,.55)"
              />
            ))
          )}
        </svg>
        {steps.map((text, i) => (
          <article
            key={i}
            className="cf-card"
            style={{ ["--delay" as string]: `${i * 120}ms` }}
          >
            <span className="cf-card-num">{String(i + 1).padStart(2, "0")}</span>
            <p className="cf-card-title">{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
