import { Rocket, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { ProfileDropdown } from "./ProfileDropdown";
import { getPlanInfo } from "@/lib/plan";
import type { User } from "@/lib/types";

export function Topbar({
  user,
  title: _title,
  onLogout,
}: {
  user: User;
  title: string;
  onLogout: () => void;
}) {
  const planInfo = getPlanInfo(user.plan);
  const [showSoon, setShowSoon] = useState(false);
  useEffect(() => {
    if (!showSoon) return;
    const t = setTimeout(() => setShowSoon(false), 1800);
    return () => clearTimeout(t);
  }, [showSoon]);
  return (
    <div className="main-topbar">
      <div className="left">
        <button
          type="button"
          className="topbar-cta"
          onClick={() => setShowSoon(true)}
        >
          <span className="topbar-cta-glow" />
          <Rocket size={15} />
          <span className="topbar-cta-label">Plano viral em 7 dias</span>
          <span className="topbar-cta-label-short">Plano viral</span>
        </button>
        {showSoon && (
          <div className="topbar-cta-toast" role="status">Em breve</div>
        )}
      </div>
      <div className="right">
        <div className="topbar-credits" title={`${planInfo.credits} créditos disponíveis`}>
          <Zap size={13} />
          <span className="topbar-credits-value">{planInfo.credits}</span>
          <span className="topbar-credits-label">créditos</span>
        </div>
        <ProfileDropdown user={user} planInfo={planInfo} onLogout={onLogout} />
      </div>
    </div>
  );
}
