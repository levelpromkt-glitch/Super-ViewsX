import { X, Check } from "lucide-react";

const beforeItems = [
  {
    title: "Perde horas minerando\nconteúdo manualmente",
    desc: "",
  },
  {
    title: "Tenta a sorte sem saber\nse vai viralizar",
    desc: "",
  },
  {
    title: "Passa horas assistindo\nsem saber oque cortar",
    desc: "",
  },
  {
    title: "Copia vídeo dos outros\u00a0 e\npega shadow ban nas redes",
    desc: "",
  },
  {
    title: "Demora dias para\nviralizar um vídeo",
    desc: "",
  },
];

const afterItems = [
  {
    title: "Minera vídeos virais\nem segundos",
    desc: "",
  },
  {
    title: "Já sabe oque vai viralizar\nsem dificuldade",
    desc: "",
  },
  {
    title: "Não perde tempo assistindo\nsem saber oque cortar",
    desc: "",
  },
  {
    title: "Usa templates para remodelar\nos vídeos virais",
    desc: "",
  },
  {
    title: "O algoritmo viraliza facilmente\nseus vídeos",
    desc: "",
  },
];

export function ComparisonSection() {
  return (
    <section className="lp-section comparison-section" id="comparacao">
      <div className="lp-section-head">
        
        <h2 className="lp-section-title">
          Seu próximo vídeo tem tudo para <span className="lp-accent">viralizar</span>
        </h2>
        <p className="lp-section-sub">
          Veja a diferença entre criar cortes manualmente x com nossas ferramentas
        </p>
      </div>

      <div className="comparison-cols">
        <div className="comparison-col comparison-col-before">
          <h3 className="comparison-col-title">Antes</h3>
          <ul className="comparison-list">
            {beforeItems.map((item) => (
              <li key={item.title} className="comparison-item">
                <span className="comparison-icon comparison-icon-x">
                  <X size={18} />
                </span>
                <div className="comparison-text">
                  <strong style={{ whiteSpace: 'pre-line' }}>{item.title}</strong>
                  {item.desc && <span>{item.desc}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="comparison-col comparison-col-after">
          <h3 className="comparison-col-title">Com SuperViews</h3>
          <ul className="comparison-list">
            {afterItems.map((item) => (
              <li key={item.title} className="comparison-item">
                <span className="comparison-icon comparison-icon-check">
                  <Check size={18} />
                </span>
                <div className="comparison-text">
                  <strong style={{ whiteSpace: 'pre-line' }}>{item.title}</strong>
                  {item.desc && <span>{item.desc}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
