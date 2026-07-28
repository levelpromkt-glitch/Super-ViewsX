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
        <img src={clip.img} alt="" loading="eager" fetchPriority="high" />
        <Play size={16} className="short-play" fill="currentColor" />
        <span className="short-views">{clip.views}</span>
      </div>
    </article>
  );
}

export function Hero({ onOpenAuth }: { onOpenAuth?: () => void }) {
  return (
    <main className="landing">
      <div className="hero-orbits" aria-hidden="true">
        <div className="orbit orbit-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={`o1-${i}`}
              className="orbit-dot"
              style={{
                animationDelay: i === 0 ? "0s" : `${-(i * 2.16).toFixed(2)}s`,
                opacity: [0.5, 0.6, 0.7, 0.55][i % 4],
              }}
            />
          ))}
        </div>
        <div className="orbit orbit-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={`o2-${i}`}
              className="orbit-dot"
              style={{
                animationDelay: i === 0 ? "0s" : `${-(i * 2.5).toFixed(2)}s`,
                opacity: [0.5, 0.6, 0.7, 0.55][i % 4],
              }}
            />
          ))}
        </div>
        <div className="orbit orbit-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={`o3-${i}`}
              className="orbit-dot"
              style={{
                animationDelay: i === 0 ? "0s" : `${-(i * 2.8).toFixed(2)}s`,
                opacity: [0.5, 0.6, 0.7, 0.55][i % 4],
              }}
            />
          ))}
        </div>
      </div>
      <div className="hero-badge-wrap">
        <div className="hero-badge">
          <img src="/SIMBOL SUPER VIEWS BRANCO.png" alt="Super Views" className="hero-badge-icon" />
          <span>Conteúdo Viral infinito</span>
        </div>
      </div>
      <h1 className="title">
        <span className="anim-word" style={{ animationDelay: '0s' }}>Use</span>{" "}
        <span className="anim-word" style={{ animationDelay: '0.08s' }}>a</span>{" "}
        <span className="anim-word" style={{ animationDelay: '0.16s' }}>força</span>{" "}
        <span className="anim-word" style={{ animationDelay: '0.24s' }}>do</span>{" "}
        <span className="anim-word" style={{ animationDelay: '0.32s' }}>algoritmo</span>{" "}
        <span className="anim-word" style={{ animationDelay: '0.4s' }}>e</span>{" "}
        <span className="title-glow anim-word" style={{ animationDelay: '0.48s' }}>
          <span className="highlight">exploda</span>
        </span>{" "}
        <span className="anim-word" style={{ animationDelay: '0.56s' }}>suas</span>{" "}
        <span className="anim-word" style={{ animationDelay: '0.64s' }}>visualizações</span>
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

      <div className="shorts-feed" aria-hidden="true">
        <div className="shorts-marquee">
          {[...clips, ...clips].map((clip, i) => (
            <ShortCard clip={clip} key={i} />
          ))}
        </div>
      </div>
    </main>
  );
}
