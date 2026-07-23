import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BackgroundFX } from "@/components/background/BackgroundFX";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Hero } from "@/components/landing/Hero";
import { LandingSections } from "@/components/landing/LandingSections";
import { AuthModal } from "@/components/auth/AuthModal";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Super Views X — Cortes estratégicos a velocidade da luz" },
      {
        name: "description",
        content:
          "Transcrição, caça-hashtag, escaneamento de competidores e templates em uma só plataforma para criadores de cortes.",
      },
      { property: "og:title", content: "Super Views X — Cortes estratégicos a velocidade da luz" },
      {
        property: "og:description",
        content: "Transcrição, caça-hashtag, escaneamento de competidores e templates em uma só plataforma para criadores de cortes.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { isAuthenticated, ready } = useAuth();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    if (ready && isAuthenticated) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [ready, isAuthenticated, navigate]);

  return (
    <>
      <BackgroundFX />
      <LandingNavbar onOpenAuth={() => setAuthOpen(true)} />
      <Hero onOpenAuth={() => setAuthOpen(true)} />
      <LandingSections onOpenAuth={() => setAuthOpen(true)} />
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthOpen(false);
          navigate({ to: "/dashboard", replace: true });
        }}
      />
    </>
  );
}
