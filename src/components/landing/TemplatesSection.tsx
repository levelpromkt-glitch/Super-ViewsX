function BranchOrnament({ side }: { side: "left" | "right" }) {
  return (
    <img
      className={`tmpl-ornament tmpl-ornament-${side}`}
      src="/premium-edit.webp"
      alt=""
      aria-hidden="true"
      width={201}
      height={425}
    />
  );
}


export function TemplatesSection() {
  return (
    <section className="lp-section tmpl-premium" id="templates">
      <div className="tmpl-premium-inner">
        <BranchOrnament side="left" />
        <BranchOrnament side="right" />

        <div className="tmpl-premium-head">
          <span className="lp-eyebrow tmpl-premium-eyebrow">USE TEMPLATES VIRAIS</span>
          <h2 className="lp-section-title tmpl-premium-title">
            Templates prontos e inspirados nos conteúdos que mais <span className="lp-accent">viralizam nas redes</span>
          </h2>
          <p className="lp-section-sub tmpl-premium-sub">
            Tenha acesso a uma coleção exclusiva de modelos prontos para remodelar vídeos virais em poucos cliques
          </p>
        </div>
      </div>

      <div className="tmpl-premium-visual">
        <div className="tmpl-premium-glow" aria-hidden="true" />
        <img
          src="/templates-v2.png"
          alt="Criadores produzindo cortes de vídeo em um estúdio moderno com iluminação neon verde"
          loading="lazy"
          width={1600}
          height={1008}
        />
      </div>
    </section>
  );
}
