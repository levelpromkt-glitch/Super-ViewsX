import { Zap } from "lucide-react";
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
  return (
    <div className="main-topbar">
      <div className="left" />
      <div className="right">
        <div className="topbar-credits" title={`${user.credits ?? 0} créditos disponíveis`}>
          <Zap size={13} />
          <span className="topbar-credits-value">{user.credits ?? 0}</span>
          <span className="topbar-credits-label">créditos</span>
        </div>
        <ProfileDropdown user={user} planInfo={planInfo} onLogout={onLogout} />
      </div>
    </div>
  );
}
