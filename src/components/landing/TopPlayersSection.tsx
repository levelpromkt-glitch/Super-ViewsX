import { Check } from "lucide-react";

const benefits = [
  "Veja o que os maiores criadores estão postando",
  "Análise completa do perfil dos concorrentes",
  "Saiba quantos vídeos e os horários que aquele perfil posta",
  "Compare desempenho entre criadores",
  "Ouro puro na palma das suas mãos",
];

export function TopPlayersSection() {
  return (
    <section className="lp-section" id="top-players">
      <div className="tp-stack">
        <div className="tp-head">
          <span className="lp-eyebrow">FERRAMENTA DE ESPIONAGEM</span>
          <h2 className="lp-section-title tp-title">
            Descubra informações valiosas sobre outros <span className="lp-accent">clipadores</span> do seu nicho
          </h2>
          <p className="lp-section-sub tp-sub">
            Espione e descubra a vantagem de saber tudo sobre os criadores que mais estão pegando visualizações
          </p>
        </div>

        <div className="tp-visual" aria-hidden="true">
          <div className="vz-glow" />
          <div className="vz-frame">
            <div className="vz-macbar">
              <div className="vz-macdots">
                <span />
                <span />
                <span />
              </div>
              <span className="vz-mactitle">Espionagem · Super Views X</span>
            </div>
            <img
              src="/top-clipadores.png"
              alt="Painel Super Views X mostrando análise de concorrentes"
              className="vz-img"
              loading="lazy"
            />
          </div>
        </div>

        <ul className="vz-list tp-list">
          {benefits.map((b) => (
            <li key={b} className="vz-item">
              <span className="vz-check" aria-hidden="true">
                <Check size={12} strokeWidth={3} />
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
