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

const BlackHoleGlow = () => (
  <div className="black-hole-container">
    <svg className="black-hole-svg" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax meet">
      <defs>
        <filter id="bh-glow-intense" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="25" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="bh-glow-medium" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="bh-glow-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="bh-horizon" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff3300" stopOpacity="0" />
          <stop offset="25%" stopColor="#ff6600" stopOpacity="0.8" />
          <stop offset="45%" stopColor="#ffcc00" stopOpacity="1" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="55%" stopColor="#ffcc00" stopOpacity="1" />
          <stop offset="75%" stopColor="#ff6600" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ff3300" stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* The massive horizontal accretion disk */}
      <ellipse cx="600" cy="400" rx="550" ry="25" fill="url(#bh-horizon)" filter="url(#bh-glow-intense)" />
      <ellipse cx="600" cy="400" rx="400" ry="10" fill="#ffffff" filter="url(#bh-glow-medium)" />
      
      {/* Outer faint rings */}
      <circle cx="600" cy="400" r="280" fill="none" stroke="#ff3300" strokeWidth="1" strokeOpacity="0.5" />
      <circle cx="600" cy="400" r="220" fill="none" stroke="#ff6600" strokeWidth="2" strokeOpacity="0.7" filter="url(#bh-glow-soft)"/>
      
      {/* The main bright arch */}
      <circle cx="600" cy="400" r="140" fill="none" stroke="#ff7700" strokeWidth="40" filter="url(#bh-glow-intense)" />
      <circle cx="600" cy="400" r="130" fill="none" stroke="#ffcc00" strokeWidth="20" filter="url(#bh-glow-medium)" />
      <circle cx="600" cy="400" r="125" fill="none" stroke="#ffffff" strokeWidth="8" filter="url(#bh-glow-soft)" />
      
      {/* Inner orange glow / dark core */}
      <circle cx="600" cy="400" r="80" fill="#ff5500" filter="url(#bh-glow-intense)" />
      <circle cx="600" cy="400" r="45" fill="#000000" />
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
