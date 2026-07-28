import { Check, Sparkles, Rocket, Crown } from "lucide-react";

interface PricingPlan {
  key: string;
  name: string;
  price: string;
  badge?: string;
  cta: string;
  features: string[];
  featured?: boolean;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

const plans: PricingPlan[] = [
  {
    key: "free",
    name: "Free",
    price: "Grátis",
    cta: "Começar Grátis",
    features: [
      "5 créditos de boas-vindas", 
      "Acesso a Todas as Competições", 
      "2 Templates básicos",
      "Pesquisa de Hashtag e Transcrição",
      "Download de cortes (Bloqueado)",
      "Top Players (Bloqueado)"
    ],
    icon: Sparkles,
  },
  {
    key: "pro",
    name: "Pro",
    price: "R$ 59,97/mês",
    badge: "Mais Popular",
    cta: "Selecionar Plano",
    features: [
      "120 créditos / mês (não cumulativos)", 
      "Acesso a Todas as Competições", 
      "TODOS os Templates disponíveis",
      "Download de cortes ilimitado",
      "Acesso total à Função Top Players"
    ],
    featured: true,
    icon: Crown,
  },
  {
    key: "start",
    name: "Start",
    price: "R$ 37,90/mês",
    cta: "Selecionar Plano",
    features: [
      "55 créditos / mês (não cumulativos)", 
      "Acesso a Todas as Competições", 
      "20 Templates desbloqueados",
      "Download de cortes liberado",
      "Top Players (Bloqueado)"
    ],
    icon: Rocket,
  },
];

export function PricingSection() {
  return (
    <section className="lp-section pricing-section" id="planos">
      <div className="lp-section-head">
        <h2 className="lp-section-title">
          Escolha o plano ideal para você
        </h2>
        <p className="lp-section-sub">
          Tenha acesso às ferramentas para criar cortes melhores e acelerar seus
          resultados.
        </p>
      </div>

      <div className="pricing-grid">
        {plans.map((plan) => {
          const PlanIcon = plan.icon;
          return (
            <div
              key={plan.key}
              className={`pricing-card ${plan.featured ? "pricing-card-featured" : ""}`}
            >
              {plan.badge && <span className="pricing-badge">{plan.badge}</span>}

              <div className={`pricing-icon ${plan.featured ? "pricing-icon-featured" : ""}`}>
                <PlanIcon size={plan.featured ? 22 : 18} strokeWidth={2} />
              </div>

              <div className="pricing-header">
                <h3 className="pricing-name">{plan.name}</h3>
                <div className="pricing-price">{plan.price}</div>
              </div>

              <ul className="pricing-features">
                {plan.features.map((feature) => (
                  <li key={feature} className="pricing-feature">
                    <span className="pricing-check">
                      <Check size={16} strokeWidth={3} />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={`pricing-cta ${plan.featured ? "pricing-cta-primary" : ""}`}
              >
                {plan.cta}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
