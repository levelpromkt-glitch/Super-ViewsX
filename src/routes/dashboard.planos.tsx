import { createFileRoute } from "@tanstack/react-router";
import { PricingSection } from "@/components/landing/PricingSection";

export const Route = createFileRoute("/dashboard/planos")({
  component: DashboardPlanos,
});

function DashboardPlanos() {
  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#0a0a0b] -m-6 rounded-3xl">
      <div className="pt-8">
        <PricingSection />
      </div>
    </div>
  );
}
