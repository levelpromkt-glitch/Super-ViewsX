import { Crown } from "lucide-react";
import type { PlanKey } from "@/lib/plan";

const LABELS: Record<PlanKey, string> = {
  free: "Free",
  start: "Start",
  pro: "Pro",
};

export function PlanBadge({
  plan,
  className = "",
}: {
  plan: PlanKey;
  className?: string;
}) {
  return (
    <span className={`plan-badge plan-badge-${plan} ${className}`.trim()}>
      {plan === "pro" && <Crown size={10} strokeWidth={2.5} />}
      <span>{LABELS[plan]}</span>
    </span>
  );
}
