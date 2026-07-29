import { useEffect, useState } from "react";
import { Check, Sparkles, Rocket, Crown, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Plan {
  id: string;
  name: string;
  price: number;
  stripe_price_id: string | null;
  features: string[];
}

export function PricingSection({ onOpenAuth, compact = false }: { onOpenAuth?: () => void, compact?: boolean }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    async function loadPlans() {
      const { data: dbPlans, error: plansError } = await supabase
        .from("plans")
        .select("id, name, price, stripe_price_id, type")
        .eq("type", "subscription")
        .order("price", { ascending: true });

      if (plansError) {
        console.error("Error loading plans:", plansError);
        setLoading(false);
        return;
      }

      const formattedPlans = dbPlans.map((p) => {
        let features: string[] = [];
        if (p.name === "Plano Free") {
          features = [
            "5 créditos de boas-vindas", 
            "Acesso a Todas as Competições", 
            "2 Templates básicos",
            "Pesquisa de Hashtag e Transcrição",
            "Download de cortes (Bloqueado)",
            "Top Players (Bloqueado)"
          ];
        } else if (p.name === "Plano Start") {
          features = [
            "55 créditos / mês (não cumulativos)", 
            "Acesso a Todas as Competições", 
            "20 Templates desbloqueados",
            "Download de cortes liberado",
            "Top Players (Bloqueado)"
          ];
        } else if (p.name === "Plano PRO") {
          features = [
            "120 créditos / mês (não cumulativos)", 
            "Acesso a Todas as Competições", 
            "TODOS os Templates disponíveis",
            "Download de cortes ilimitado",
            "Acesso total à Função Top Players"
          ];
        }

        return {
          id: p.id,
          name: p.name.replace("Plano ", ""), // Transforma "Plano Free" em "Free"
          price: p.price,
          stripe_price_id: p.stripe_price_id,
          features
        };
      });

      // Ordena: Free, PRO (no meio), Start
      const free = formattedPlans.find((p) => p.name === "Free");
      const pro = formattedPlans.find((p) => p.name === "PRO" || p.name === "Pro");
      const start = formattedPlans.find((p) => p.name === "Start");

      const ordered = [];
      if (free) ordered.push(free);
      if (pro) ordered.push(pro);
      if (start) ordered.push(start);

      setPlans(ordered);
      setLoading(false);
    }

    loadPlans();
  }, []);

  const handleSubscribe = async (plan: Plan) => {
    if (plan.name === "Free") {
      window.location.href = "/dashboard";
      return;
    }

    try {
      setCheckoutLoading(plan.id);
      
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast.error("Você precisa estar logado para assinar um plano.");
        if (onOpenAuth) onOpenAuth();
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { planId: plan.id }
      });

      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url; // Redireciona para o checkout da Stripe
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao iniciar pagamento. Tente novamente.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const getIcon = (name: string) => {
    if (name === "Free") return Sparkles;
    if (name === "PRO" || name === "Pro") return Crown;
    return Rocket;
  };

  return (
    <section className={`lp-section pricing-section ${compact ? 'py-4' : ''}`} id="planos">
      {!compact && (
        <div className="lp-section-head">
          <h2 className="lp-section-title">
            Escolha o plano ideal para você
          </h2>
          <p className="lp-section-sub">
            Tenha acesso às ferramentas para criar cortes melhores e acelerar seus
            resultados.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-10 text-white">
          <Loader2 className="animate-spin w-8 h-8" />
        </div>
      ) : (
        <div className={`pricing-grid ${compact ? 'gap-4 max-w-4xl mx-auto' : ''}`}>
          {plans.map((plan) => {
            const PlanIcon = getIcon(plan.name);
            const isFeatured = plan.name === "PRO" || plan.name === "Pro";
            const priceText = plan.price === 0 ? "Grátis" : `R$ ${plan.price.toFixed(2).replace('.', ',')}/mês`;
            const buttonText = plan.name === "Free" ? "Começar Grátis" : "Selecionar Plano";

            return (
              <div
                key={plan.id}
                className={`pricing-card ${isFeatured ? "pricing-card-featured" : ""}`}
              >
                {isFeatured && <span className="pricing-badge">Mais Popular</span>}

                <div className={`pricing-icon ${isFeatured ? "pricing-icon-featured" : ""}`}>
                  <PlanIcon size={isFeatured ? 22 : 18} strokeWidth={2} />
                </div>

                <div className={`pricing-header ${compact ? 'mb-2' : ''}`}>
                  <h3 className={`pricing-name ${compact ? 'text-lg' : ''}`}>{plan.name}</h3>
                  <div className={`pricing-price ${compact ? 'text-2xl' : ''}`}>{priceText}</div>
                </div>

                <ul className={`pricing-features ${compact ? 'gap-2 mb-4' : ''}`}>
                  {plan.features.map((feature) => (
                    <li key={feature} className={`pricing-feature ${compact ? 'text-sm' : ''}`}>
                      <span className="pricing-check">
                        <Check size={compact ? 14 : 16} strokeWidth={3} />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => handleSubscribe(plan)}
                  disabled={checkoutLoading === plan.id}
                  className={`pricing-cta ${isFeatured ? "pricing-cta-primary" : ""} flex items-center justify-center gap-2`}
                >
                  {checkoutLoading === plan.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  {buttonText}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
