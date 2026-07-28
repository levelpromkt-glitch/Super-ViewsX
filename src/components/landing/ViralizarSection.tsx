
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";



const benefits = [
  "Escolha uma campanha para começar a postar e ser pago.",
  "Use o Super Views para minerar os vídeos que estão dando certo.",
  "Aproveite nossos templates validados para modelar qualquer vídeo.",
  "Poste o vídeo e veja as visualizações subindo.",
  "Receba via PIX pelas visualizações que você gerou.",
];

const campaigns = [
  {
    name: "Fitness Brasil",
    category: "Saúde e Bem-estar",
    initials: "FB",
    payout: "R$ 10,00 por mil views",
    prize: "R$ 50.000 em premiações",
    banner: "linear-gradient(135deg, #0F2A18 0%, #1B4A2A 60%, #38E07B 140%)",
    image: "/fitness-brasil.jpg",
  },
  {
    name: "Game Cortes",
    category: "Games & Streamers",
    initials: "GC",
    payout: "R$ 8,00 por mil views",
    prize: "R$ 35.000 em premiações",
    banner: "linear-gradient(135deg, #0E1A2A 0%, #1B2E55 55%, #4A7BE0 140%)",
    image: "/game-cortes.jpg",
  },
  {
    name: "Podcast Corte",
    category: "Entretenimento",
    initials: "PC",
    payout: "R$ 12,00 por mil views",
    prize: "R$ 60.000 em premiações",
    banner: "linear-gradient(135deg, #2A0F1F 0%, #55162E 55%, #E04A7B 140%)",
    image: "/podcast-corte.jpg",
  },
];

function IgIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}
function TiktokIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 3v10.2a3 3 0 1 1-3-3V7.6a6.4 6.4 0 1 0 6.4 6.4V8.9a6.4 6.4 0 0 0 3.6 1.1V7.4A3.9 3.9 0 0 1 17 3z" />
    </svg>
  );
}
function YtIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="12" rx="3" />
      <path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ViralizarSection({ onOpenAuth }: { onOpenAuth?: () => void }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section className="lp-section" id="viralizar">
      <div className="vz-wrap">
        <div className="vz-head">
          <span className="lp-eyebrow">CAMPEONATOS DE CORTE</span>
          <h2 className="lp-section-title vz-title-c">
            Seja recompensado para postar vídeos na internet
          </h2>
          <p className="lp-section-sub vz-sub-c">
            Na aba Campanhas recomendamos as competições mais lucrativas do mercado para você ser pago todos os dias simplesmente por postar vídeos de influenciadores. Sem mostrar seu rosto, apenas utilizando seu celular.
          </p>
        </div>

        <div
          ref={gridRef}
          className={`vz-camps${visible ? " is-visible" : ""}`}
          aria-label="Campanhas disponíveis"
        >
          {campaigns.map((c, i) => (
            <article
              key={c.name}
              className="vz-camp"
              style={{ ["--delay" as string]: `${i * 120}ms` }}
            >
              <div className="vz-camp-banner" style={{ background: c.banner }}>
                <img src={c.image} alt={c.name} className="vz-camp-img" loading="lazy" />
                <span className="vz-camp-badge">ATIVA</span>
                <span className="vz-camp-seal" aria-hidden="true">{c.initials}</span>
              </div>
              <div className="vz-camp-body">
                <h3 className="vz-camp-name">{c.name}</h3>
                <p className="vz-camp-cat">{c.category}</p>
                <div className="vz-camp-payout">{c.payout}</div>
                <p className="vz-camp-prize">{c.prize}</p>
                <div className="vz-camp-foot" aria-label="Plataformas">
                  <span className="vz-camp-social" aria-label="Instagram"><IgIcon /></span>
                  <span className="vz-camp-social" aria-label="TikTok"><TiktokIcon /></span>
                  <span className="vz-camp-social" aria-label="YouTube"><YtIcon /></span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <ol className="vz-steps" aria-label="Como funciona">
          {benefits.map((b, i) => (
            <li key={b} className="vz-step">
              <span className="vz-step-num" aria-hidden="true">{i + 1}</span>
              <span>{b}</span>
            </li>
          ))}
        </ol>

        <div className="hero-cta vz-cta" style={{ marginBottom: '40px' }}>
          <button type="button" className="btn-primary-nav hero-cta-primary" onClick={onOpenAuth}>
            QUERO COMEÇAR A GANHAR DINHEIRO <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

