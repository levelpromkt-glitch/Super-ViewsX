import { ComoFunciona } from "./ComoFunciona";
import { ViralizarSection } from "./ViralizarSection";
import { HashtagSection } from "./HashtagSection";
import { TranscricaoSection } from "./TranscricaoSection";
import { TopPlayersSection } from "./TopPlayersSection";
import { TemplatesSection } from "./TemplatesSection";
import { ComparisonSection } from "./ComparisonSection";
import { PricingSection } from "./PricingSection";
import { Marquee } from "./Marquee";

const marqueeItems = [
  "CRESÇA SEUS CANAIS USANDO FERRAMENTAS PREMIUM",
  "CRIE SUA CONTA GRATUITAMENTE",
  "ENCONTRE VÍDEOS VIRAIS EM MASSA"
];


export function LandingSections({ onOpenAuth }: { onOpenAuth: () => void }) {
  return (
    <div className="lp-sections">
      <ComoFunciona />
      <ViralizarSection onOpenAuth={onOpenAuth} />
      <HashtagSection />

      <TranscricaoSection />
      <TopPlayersSection />
      <TemplatesSection />

      <ComparisonSection />
      <PricingSection />

      <footer className="lp-footer">
        <img src="/logo.png" alt="Super Views X" className="logo-img" />
        <span className="lp-footer-copy">
          © {new Date().getFullYear()} Super Views X. Todos os direitos reservados.
        </span>
      </footer>
    </div>
  );
}
