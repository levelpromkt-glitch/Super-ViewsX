import { Lock } from "lucide-react";

export function ComingSoon({ feature }: { feature: string }) {
  return (
    <div className="coming-soon-wrapper">
      <div className="lock-icon">
        <Lock />
      </div>
      <h2>
        Em <span>Breve</span>
      </h2>
      <p>
        Estamos preparando algo incrível para você. {feature} estará disponível em breve.
      </p>
      <button className="btn-coming-soon">🔒 Em desenvolvimento</button>
    </div>
  );
}
