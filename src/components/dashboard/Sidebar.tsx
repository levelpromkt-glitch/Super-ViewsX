import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight, Trophy, TrendingUp, Flame, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// Ícone customizado para Transcrição (balão de fala com caractere)
const TranscricaoIcon = ({ size = 20, className }: { size?: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 1-2Z" />
    <path d="M9 9h6" />
    <path d="M12 9v2" />
    <path d="M9.5 13.5 12 11l2.5 2.5" />
  </svg>
);

// Ícone customizado para Templates (caixa/clipe com play dentro, estilo outline)
const TemplatesIcon = ({ size = 20, className }: { size?: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M8 3h8a1 1 0 0 1 1 1v2H7V4a1 1 0 0 1 1-1Z" />
    <rect x="3" y="6" width="18" height="15" rx="3" />
    <path d="M11 11.2v4.6a.5.5 0 0 0 .76.43l3.7-2.3a.5.5 0 0 0 0-.86l-3.7-2.3a.5.5 0 0 0-.76.43Z" />
  </svg>
);

const items = [
  { to: "/dashboard", label: "Campanhas", icon: Trophy, exact: true, adminOnly: false, pro: false },
  { to: "/dashboard/transcricao", label: "Transcrição", icon: TranscricaoIcon, exact: false, adminOnly: false, pro: false },
  { to: "/dashboard/hashtag", label: "Pesquisar Hashtag", icon: TrendingUp, exact: false, adminOnly: false, pro: false },
  { to: "/dashboard/top-players", label: "Top Players", icon: Flame, exact: false, adminOnly: false, pro: true },
  { to: "/dashboard/templates", label: "Templates", icon: TemplatesIcon, exact: false, adminOnly: false, pro: true },
  { to: "/dashboard/admin", label: "Admin", icon: Settings, exact: false, adminOnly: true, pro: false },
] as const;

export function Sidebar({
  collapsed,
  open,
  onCloseMobile,
}: {
  collapsed: boolean;
  open: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useAuth();

  // Single source of truth: apenas UM item ativo, calculado a partir da rota atual
  const visibleItems = items.filter((it) => !it.adminOnly || isAdmin);
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const matches = visibleItems.filter((it) =>
    it.exact ? normalized === it.to : normalized === it.to || normalized.startsWith(it.to + "/")
  );
  // Mais específico (rota mais longa) vence; demais ficam inativos.
  const activeKey =
    matches.sort((a, b) => b.to.length - a.to.length)[0]?.to ?? null;

  return (
    <aside
      className={`sidebar${collapsed ? " collapsed" : ""}${open ? " open" : ""}`}
    >
      <div className="sidebar-brand">
        {(collapsed && !open) || (typeof window !== "undefined" && window.innerWidth <= 768) ? (
          <img src="/favicon.png" alt="SV" className="logo-img-small" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
        ) : (
          <img src="/logo.png" alt="Super Views X" className="logo-img" />
        )}
      </div>
      <nav className="sidebar-nav">
        {visibleItems.map((it) => {
          const Icon = it.icon;
          const isActive = it.to === activeKey;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`nav-item${isActive ? " active" : ""}${it.to === "/dashboard" ? " nav-item-campanhas" : ""}`}
              activeProps={{}}
              inactiveProps={{}}
              aria-current={isActive ? "page" : undefined}
              data-active={isActive ? "true" : "false"}
              onClick={onCloseMobile}
            >
              <Icon className="nav-icon" size={20} />
              <span>{it.label}</span>
              {it.pro && <span className="nav-badge-pro" aria-label="Recurso PRO">PRO</span>}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-upgrade-card relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <p className="upgrade-title relative z-10 flex items-center gap-1.5">
          <Flame size={16} className="text-orange-500 animate-pulse" />
          Desbloqueie o <span className="highlight font-bold text-white">PRO</span>
        </p>
        <p className="upgrade-text relative z-10 opacity-80 text-[11px] mb-3">
          Acesso a ferramentas avançadas e recursos sem limites.
        </p>
        <Link 
          to="/dashboard/planos" 
          onClick={onCloseMobile}
          className="btn-upgrade relative z-10 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white border-0 shadow-lg shadow-indigo-500/25 font-medium py-2 rounded-lg transition-all"
        >
          Ver Planos <ArrowUpRight size={14} />
        </Link>
      </div>
    </aside>
  );
}
