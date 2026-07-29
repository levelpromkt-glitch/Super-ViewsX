import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Columns2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

const titles: Record<string, string> = {
  "/dashboard": "Campanhas",
  "/dashboard/transcricao": "Transcrição",
  "/dashboard/hashtag": "Pesquisar Hashtag",
  "/dashboard/top-players": "Top Players",
  "/dashboard/templates": "Templates",
  "/dashboard/admin": "Admin — Campanhas",
};

function DashboardLayout() {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/", replace: true });
  }, [ready, user, navigate]);

  if (!ready || !user) return null;

  const normalized = pathname.replace(/\/$/, "") || "/dashboard";
  const title = titles[normalized] || "Dashboard";

  return (
    <>
      <div className="dashboard-container">
        <div
          className={`sidebar-overlay${mobileOpen ? " active" : ""}`}
          onClick={() => setMobileOpen(false)}
        />
        <Sidebar
          collapsed={collapsed}
          open={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <button
          className={`sidebar-toggle-btn${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}
          onClick={() => {
            if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
              setMobileOpen((v) => !v);
            } else {
              setCollapsed((v) => !v);
            }
          }}
          title="Recolher/Expandir"
          aria-label="Toggle sidebar"
        >
          {isMobile ? (
            <Columns2 size={18} strokeWidth={1.75} />
          ) : (collapsed && !mobileOpen) ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
        </button>
        <main className={`main-content${collapsed ? " collapsed" : ""}`}>
          <Topbar user={user} title={title} onLogout={logout} />
          <div className="dashboard-content-card">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}
