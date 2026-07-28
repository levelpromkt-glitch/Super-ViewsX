import { Search } from "lucide-react";

const benefits = [
  "Cole um link do YouTube",
  "Gere a transcrição automática",
  "Digite o que foi falado no momento que você procura",
  "Encontre e baixe apenas o trecho que você quer",
];

const transcriptLines = [
  { time: "00:12", text: "Hoje eu vou te mostrar como funciona o algoritmo...", active: false },
  { time: "00:34", text: "...o segredo para viralizar é entregar valor logo nos primeiros segundos.", active: true },
  { time: "00:58", text: "Quando você prende a atenção do público, o engajamento dispara.", active: false },
  { time: "01:21", text: "O corte perfeito começa exatamente nesse momento.", active: false },
  { time: "01:45", text: "É só aplicar essa técnica e colher os resultados.", active: false },
];

export function TranscricaoSection() {
  return (
    <section className="lp-section" id="transcricao">
      <div className="trsc-split">
        {/* Left: visual illustration */}
        <div className="trsc-visual">
          <div className="trsc-frame">
            <div className="vz-macbar">
              <div className="vz-macdots">
                <span />
                <span />
                <span />
              </div>
              <span className="vz-mactitle">Transcrição · Super Views X</span>
            </div>
            <div className="trsc-content">
              <div className="trsc-searchbar">
                <Search size={14} className="trsc-search-icon" />
                <span className="trsc-search-text">"como viralizar"</span>
                <span className="trsc-search-badge">3 resultados</span>
              </div>
              <div className="trsc-lines">
                {transcriptLines.map((line, i) => (
                  <div
                    key={i}
                    className={`trsc-line ${line.active ? "trsc-line-active" : ""}`}
                  >
                    <span className="trsc-time">{line.time}</span>
                    <span className="trsc-text">{line.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: copy */}
        <div className="trsc-copy">
          <span className="lp-eyebrow">FERRAMENTA DE TRANSCRIÇÃO</span>
          <h2 className="lp-section-title trsc-title">
            Localize o momento perfeito <br />
            para o seu <span className="lp-accent">corte</span>
          </h2>
          <p className="trsc-desc">
            Economize horas de edição. Não assista horas de conteúdo procurando um corte. 
            Encontre em segundos o momento viral com a ferramenta transcrição automática 
            gerada por ia
          </p>

          <ol className="trsc-list trsc-list-numbered">
            {benefits.map((b, i) => (
              <li key={b} className="trsc-item">
                <span className="trsc-num" aria-hidden="true">{i + 1}</span>
                <span>{b}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
