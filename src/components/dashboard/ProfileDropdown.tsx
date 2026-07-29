import { useEffect, useRef, useState } from "react";
import { UserCog, CreditCard, LogOut, Zap } from "lucide-react";
import type { User } from "@/lib/types";
import type { PlanInfo } from "@/lib/plan";
import { PlanBadge } from "./PlanBadge";
import { EditProfileModal } from "./EditProfileModal";
import { useAuth } from "@/hooks/useAuth";

export function ProfileDropdown({
  user,
  planInfo,
  onLogout,
}: {
  user: User;
  planInfo: PlanInfo;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { updateProfile } = useAuth();

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const initial = user.name.charAt(0).toUpperCase();
  const soon = (label: string) => {
    setOpen(false);
    alert(`${label} - Em breve!`);
  };

  const renderAvatar = (extraClass = "") => (
    <div className={`avatar-icon${extraClass ? " " + extraClass : ""}`}>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="avatar-img" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );

  return (
    <>
      <div className={`profile-dropdown${open ? " active" : ""}`} ref={ref}>
        <div
          className="profile-trigger"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <div className="profile-trigger-avatar-wrap">
            {renderAvatar()}
            <PlanBadge plan={planInfo.key} className="profile-trigger-plan" />
          </div>
          <span className="profile-name">{user.name}</span>
        </div>
        <div className="dropdown-menu profile-menu">
          <div className="profile-menu-header">
            {renderAvatar("profile-menu-avatar")}
            <div className="profile-menu-info">
              <div className="profile-menu-name">{user.name}</div>
              <div className="profile-menu-email">{user.email}</div>
            </div>
          </div>
          <div className="profile-menu-meta">
            <div className="profile-menu-meta-row">
              <span className="profile-menu-meta-label">Plano</span>
              <PlanBadge plan={planInfo.key} />
            </div>
            <div className="profile-menu-meta-row">
              <span className="profile-menu-meta-label">Créditos</span>
              <div className="flex items-center gap-1.5 text-white font-medium">
                <Zap size={12} /> {user.credits ?? 0}
              </div>
            </div>
          </div>
          <div className="dropdown-divider" />
          <button
            className="dropdown-item"
            onClick={() => {
              setOpen(false);
              setEditing(true);
            }}
          >
            <UserCog size={16} /> Editar perfil
          </button>
          <button className="dropdown-item" onClick={() => soon("Gerenciar assinatura")}>
            <CreditCard size={16} /> Gerenciar assinatura
          </button>
          <div className="dropdown-divider" />
          <button
            className="dropdown-item danger"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </div>
      {editing && (
        <EditProfileModal
          user={user}
          onClose={() => setEditing(false)}
          onSave={(patch) => {
            updateProfile(patch);
            setEditing(false);
          }}
        />
      )}
    </>
  );
}
