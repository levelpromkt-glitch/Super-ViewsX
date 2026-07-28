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
  <div className="hero-radar-bg">
    {/* Central Breathe Glow */}
    <div className="hero-radar-glow" />
    
    {/* Radar Arcs & Dots */}
    <div className="hero-radar-arcs">
      <div className="hero-radar-arc" style={{ width: '300px', height: '300px' }}>
        <div className="hero-radar-dot-wrapper ring-1" style={{ animationDelay: '-12s' }}>
          <div className="hero-radar-dot" />
        </div>
      </div>
      <div className="hero-radar-arc" style={{ width: '600px', height: '600px' }}>
        <div className="hero-radar-dot-wrapper ring-2" style={{ animationDelay: '-25s' }}>
          <div className="hero-radar-dot" />
        </div>
      </div>
      <div className="hero-radar-arc" style={{ width: '900px', height: '900px' }}>
        <div className="hero-radar-dot-wrapper ring-3" style={{ animationDelay: '-7s' }}>
          <div className="hero-radar-dot" />
        </div>
      </div>
      <div className="hero-radar-arc" style={{ width: '1200px', height: '1200px' }}>
        <div className="hero-radar-dot-wrapper ring-4" style={{ animationDelay: '-38s' }}>
          <div className="hero-radar-dot" />
        </div>
      </div>
      <div className="hero-radar-arc arc-5" style={{ width: '1500px', height: '1500px' }}>
        <div className="hero-radar-dot-wrapper ring-5" style={{ animationDelay: '-19s' }}>
          <div className="hero-radar-dot" />
        </div>
      </div>
    </div>
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
        <RadarGlow />
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
