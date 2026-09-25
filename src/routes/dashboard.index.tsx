import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { PerformanceOverview } from "@/components/dashboard/PerformanceOverview";

export const Route = createFileRoute("/dashboard/")({
  component: DesempenhoHomePage,
});

function DesempenhoHomePage() {
  return (
    <div className="hs-page">
      <section className="tr-card tr-input-card">
        <div className="tr-input-lead">
          <div className="tr-input-badge">
            <BarChart3 size={16} className="tr-icon-lime" />
            <span>Desempenho</span>
          </div>
          <h2 className="tr-input-title">Como seus posts estão indo</h2>
          <p className="tr-input-hint">
            Números reais das suas contas conectadas — TikTok, YouTube e Instagram.
          </p>
        </div>
      </section>
      <PerformanceOverview />
    </div>
  );
}
