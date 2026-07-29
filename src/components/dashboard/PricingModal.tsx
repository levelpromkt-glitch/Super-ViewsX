import { useEffect, useState } from "react";
import { X, Check, Loader2, Sparkles, Rocket, Crown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Plan {
  id: string;
  name: string;
  price: number;
  stripe_price_id: string | null;
  features: string[];
}

export function PricingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    
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
        if (p.name === "Plano Start") {
          features = ["55 créditos mensais", "Templates limitados", "Sem Top Players"];
        } else if (p.name === "Plano PRO") {
          features = ["120 créditos mensais", "Todos os Templates", "Acesso Top Players"];
        }

        return {
          id: p.id,
          name: p.name.replace("Plano ", ""),
          price: p.price,
          stripe_price_id: p.stripe_price_id,
          features
        };
      });

      // Pega só os pagos para ser mais enxuto
      const paidPlans = formattedPlans.filter(p => p.name !== "Free");
      setPlans(paidPlans);
      setLoading(false);
    }

    loadPlans();
  }, [open]);

  if (!open) return null;

  const handleSubscribe = async (plan: Plan) => {
    try {
      setCheckoutLoading(plan.id);
      
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast.error("Você precisa estar logado para assinar um plano.");
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { planId: plan.id }
      });

      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao iniciar pagamento. Tente novamente.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const getIcon = (name: string) => {
    if (name === "PRO" || name === "Pro") return Crown;
    return Rocket;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0a0a0b] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header Compacto */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/5">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="text-emerald-400" size={20} /> Upgrade para Premium
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center items-center py-10 text-white">
              <Loader2 className="animate-spin w-6 h-6" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plans.map((plan) => {
                const PlanIcon = getIcon(plan.name);
                const isFeatured = plan.name === "PRO" || plan.name === "Pro";
                const priceText = `R$ ${plan.price.toFixed(2).replace('.', ',')}/mês`;

                return (
                  <div
                    key={plan.id}
                    className={`relative p-5 rounded-xl border flex flex-col h-full ${
                      isFeatured 
                        ? "border-emerald-500/50 bg-emerald-500/5 shadow-[0_0_20px_rgba(52,211,153,0.1)]" 
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    {isFeatured && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                        Recomendado
                      </span>
                    )}

                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2 rounded-lg ${isFeatured ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white'}`}>
                        <PlanIcon size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-white">{plan.name}</h3>
                        <div className="text-xl font-black text-white">{priceText}</div>
                      </div>
                    </div>

                    <ul className="flex flex-col gap-2 mb-6 flex-grow">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm text-gray-300">
                          <Check size={14} className="text-emerald-400 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      onClick={() => handleSubscribe(plan)}
                      disabled={checkoutLoading === plan.id}
                      className={`w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
                        isFeatured
                          ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20"
                          : "bg-white/10 hover:bg-white/20 text-white"
                      }`}
                    >
                      {checkoutLoading === plan.id && <Loader2 className="w-4 h-4 animate-spin" />}
                      {checkoutLoading === plan.id ? "Carregando..." : "Assinar Agora"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
