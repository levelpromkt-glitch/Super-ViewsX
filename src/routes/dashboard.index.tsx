import { createFileRoute } from "@tanstack/react-router";
import { CampaignGrid } from "@/components/dashboard/CampaignGrid";

export const Route = createFileRoute("/dashboard/")({
  component: CampaignsPage,
});

function CampaignsPage() {
  return <CampaignGrid />;
}
