import { createFileRoute } from "@tanstack/react-router";
import { PricingSection } from "@/components/landing/PricingSection";

export const Route = createFileRoute("/dashboard/planos")({
  component: PlanosPage,
});

function PlanosPage() {
  return (
    <div className="w-full flex flex-col items-center pb-12 pt-4">
      <PricingSection />
    </div>
  );
}
