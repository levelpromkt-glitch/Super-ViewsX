export type PlanKey = "free" | "start" | "pro";

export interface PlanInfo {
  key: PlanKey;
  label: string;
  credits: number;
}

export function getPlanInfo(plan: string | undefined): PlanInfo {
  const raw = (plan || "free").toLowerCase();
  if (raw.includes("pro")) return { key: "pro", label: "Pro", credits: 120 };
  if (raw.includes("start")) return { key: "start", label: "Start", credits: 55 };
  return { key: "free", label: "Free", credits: 5 };
}
