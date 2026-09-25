import { createFileRoute } from "@tanstack/react-router";
import { CampaignGrid } from "@/components/dashboard/CampaignGrid";
import { PerformanceOverview } from "@/components/dashboard/PerformanceOverview";

export const Route = createFileRoute("/dashboard/")({
  component: CampaignsPage,
});

function CampaignsPage() {
  return (
    <>
      <PerformanceOverview />
      <CampaignGrid />
    </>
  );
}
