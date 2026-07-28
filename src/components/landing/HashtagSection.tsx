import { Hash, MousePointer2, Search, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function HashtagDemo() {
  return (
    <div className="hd2-panel" aria-hidden="true">
      <div className="vz-macbar">
        <div className="vz-macdots">
          <span />
          <span />
          <span />
        </div>
        <span className="vz-mactitle">Minerador Automático</span>
      </div>

      <div className="hd2-showcase-video">
        <video 
          src="/showcase-mineracao.mp4" 
          autoPlay 
          loop 
          muted 
          playsInline
          className="hd2-video-el"
        >
          Seu navegador não suporta vídeos.
        </video>
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
