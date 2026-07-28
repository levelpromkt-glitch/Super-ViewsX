import { ArrowRight, Play } from "lucide-react";

type Clip = { title: string; views: string; img: string; category: string };

const clips: Clip[] = [
  { title: "Corte que passou de 10M", views: "12.4M", img: "https://i.ibb.co/gMymYnc9/imgi-15-hq720-2.jpg", category: "Viral" },
  { title: "Reação inesperada no podcast", views: "8.7M", img: "https://i.ibb.co/m5FmKQZp/imgi-16-hq720-2.jpg", category: "Podcast" },
  { title: "Frase virou meme", views: "4.9M", img: "https://i.ibb.co/1YbGfx7Y/imgi-49-oardefault.jpg", category: "Meme" },
  { title: "Trend do momento", views: "4.1M", img: "https://i.ibb.co/7dWQsgj4/imgi-94-oar2.jpg", category: "Trend" },
  { title: "Bastidor inédito", views: "2.2M", img: "https://i.ibb.co/39SFNYxY/imgi-110-oar2.jpg", category: "Bastidor" },
  { title: "Revelação ao vivo", views: "5.1M", img: "https://i.ibb.co/S9hDMsz/imgi-117-oardefault.jpg", category: "Ao vivo" },
  { title: "Debate viralizou", views: "3.8M", img: "https://i.ibb.co/Df9bQ3wD/imgi-119-oardefault.jpg", category: "Debate" },
  { title: "Estourou no TikTok", views: "9.3M", img: "https://i.ibb.co/NggDtY7Q/imgi-134-oar2.jpg", category: "TikTok" },
  { title: "Resposta épica", views: "2.7M", img: "https://i.ibb.co/HLnLbzdP/imgi-144-hq720-2.jpg", category: "Resposta" },
  { title: "Confissão surpresa", views: "7.4M", img: "https://i.ibb.co/MyK0SMcH/imgi-163-hq720-2.jpg", category: "Confissão" },
  { title: "Clipe premiado", views: "3.4M", img: "https://i.ibb.co/rRqS9vz8/imgi-170-hq720-2.jpg", category: "Clipe" },
  { title: "Podcast em alta", views: "5.9M", img: "https://i.ibb.co/QvL0nf10/imgi-232-hq720-2.jpg", category: "Podcast" },
  { title: "Fala icônica", views: "8.1M", img: "https://i.ibb.co/6G7shXQ/imgi-233-oardefault.jpg", category: "Ícone" },
  { title: "Viralizou no X", views: "7.8M", img: "https://i.ibb.co/NgwvDsPs/imgi-238-oardefault.jpg", category: "Viral" },
  { title: "Detonou na web", views: "6.2M", img: "https://i.ibb.co/27RRn00R/imgi-280-oar2.jpg", category: "Web" },
  { title: "Reação imperdível", views: "10.1M", img: "https://i.ibb.co/7d3ZVD7N/imgi-335-hq720-2.jpg", category: "Reação" },
];

function ShortCard({ clip }: { clip: Clip }) {
  return (
    <article className="short-card">
      <div className="short-thumb">
        <img src={clip.img} alt="" loading="lazy" />
        <Play size={16} className="short-play" fill="currentColor" />
        <span className="short-views">{clip.views}</span>
      </div>
    </article>
  );
}

const RadarGlow = () => (
  <div className="radar-glow-container">
    <svg className="radar-glow-svg" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax meet">
      <defs>
        <radialGradient id="radar-center-glow" cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor="#9eff2e" stopOpacity="0.12" />
          <stop offset="30%" stopColor="#9eff2e" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#9eff2e" stopOpacity="0" />
        </radialGradient>
      </defs>
      
      {/* Center soft glow */}
      <rect x="0" y="0" width="1200" height="400" fill="url(#radar-center-glow)" />

      {/* Concentric rings */}
      <g stroke="#9eff2e" strokeWidth="1" strokeOpacity="0.15" fill="none">
        <circle cx="600" cy="400" r="120" />
        <circle cx="600" cy="400" r="220" />
        <circle cx="600" cy="400" r="320" />
        <circle cx="600" cy="400" r="440" />
        <circle cx="600" cy="400" r="580" />
      </g>
      
      {/* Orbiting dots */}
      <g>
        <animateTransform attributeName="transform" type="rotate" from="0 600 400" to="360 600 400" dur="20s" repeatCount="indefinite" />
        <circle cx="480" cy="400" r="3" fill="#060906" stroke="#9eff2e" strokeOpacity="0.8" />
      </g>
      <g>
        <animateTransform attributeName="transform" type="rotate" from="45 600 400" to="405 600 400" dur="30s" repeatCount="indefinite" />
        <circle cx="380" cy="400" r="3" fill="#060906" stroke="#9eff2e" strokeOpacity="0.8" />
        <circle cx="820" cy="400" r="3" fill="#060906" stroke="#9eff2e" strokeOpacity="0.8" />
      </g>
      <g>
        <animateTransform attributeName="transform" type="rotate" from="0 600 400" to="-360 600 400" dur="40s" repeatCount="indefinite" />
        <circle cx="280" cy="400" r="3" fill="#060906" stroke="#9eff2e" strokeOpacity="0.8" />
        <circle cx="920" cy="400" r="3" fill="#060906" stroke="#9eff2e" strokeOpacity="0.8" />
      </g>
      <g>
        <animateTransform attributeName="transform" type="rotate" from="90 600 400" to="450 600 400" dur="50s" repeatCount="indefinite" />
        <circle cx="160" cy="400" r="4" fill="#060906" stroke="#9eff2e" strokeOpacity="0.8" />
        <circle cx="1040" cy="400" r="4" fill="#060906" stroke="#9eff2e" strokeOpacity="0.8" />
      </g>
      <g>
        <animateTransform attributeName="transform" type="rotate" from="0 600 400" to="-360 600 400" dur="65s" repeatCount="indefinite" />
        <circle cx="20" cy="400" r="4" fill="#060906" stroke="#9eff2e" strokeOpacity="0.8" />
        <circle cx="1180" cy="400" r="4" fill="#060906" stroke="#9eff2e" strokeOpacity="0.8" />
      </g>
    </svg>
  </div>
);

export function Hero({ onOpenAuth }: { onOpenAuth?: () => void }) {
  return (
    <main className="landing">
      <h1 className="title hero-headline-anim">
        Use a força do algoritmo e <span className="title-glow"><span className="highlight">exploda</span></span> suas visualizações
      </h1>
      <p className="subtitle">
        Replique conteúdos que já estão viralizando
      </p>
      <div className="hero-cta">
        <button className="btn-primary-nav hero-cta-primary" onClick={onOpenAuth}>
          Começar Grátis <ArrowRight size={16} />
        </button>
        <button className="btn-outline hero-cta-ghost" onClick={onOpenAuth}>
          Entrar
        </button>
      </div>

      <div className="shorts-feed-wrapper">
        <BlackHoleGlow />
        <div className="shorts-feed" aria-hidden="true">
          <div className="shorts-marquee">
            {[...clips, ...clips].map((clip, i) => (
              <ShortCard clip={clip} key={i} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
