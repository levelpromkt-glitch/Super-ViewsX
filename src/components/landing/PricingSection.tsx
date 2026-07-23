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
    cta: "Começar grátis",
    features: ["Acesso inicial", "Créditos limitados", "Templates básicos"],
    icon: Sparkles,
  },
  {
    key: "pro",
    name: "Pro",
    price: "R$ 99,90/mês",
    badge: "Mais popular",
    cta: "Escolher Pro",
    features: ["Todos os recursos", "Maior limite de uso", "Recursos avançados"],
    featured: true,
    icon: Crown,
  },
  {
    key: "start",
    name: "Start",
    price: "R$ 49,90/mês",
    cta: "Escolher Start",
    features: ["Mais créditos", "Mais ferramentas", "Mais templates"],
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
