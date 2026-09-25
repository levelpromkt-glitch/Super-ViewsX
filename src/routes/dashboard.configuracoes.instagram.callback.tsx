import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/configuracoes/instagram/callback")({
  component: InstagramCallbackPage,
});

import { SocialAccountsService, SocialAccountsError } from "@/services/socialAccountsService";

function InstagramCallbackPage() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const igError = params.get("error") || params.get("error_reason");

    // A full window.location navigation (not the router's navigate()) so there's
    // no race between our query params and the router's own history write.
    const finish = (search: Record<string, string>) => {
      const query = new URLSearchParams(search).toString();
      window.location.replace(`/dashboard/configuracoes?${query}`);
    };

    if (igError) {
      finish({ instagram: "error", message: igError });
      return;
    }
    if (!code || !state) {
      finish({ instagram: "error", message: "Parâmetros de retorno ausentes." });
      return;
    }

    SocialAccountsService.completeInstagramOAuth(code, state)
      .then(() => finish({ instagram: "connected" }))
      .catch((err) => {
        const message = err instanceof SocialAccountsError ? err.message : "Erro ao concluir a conexão.";
        finish({ instagram: "error", message });
      });
  }, []);

  return (
    <div className="hs-page">
      <section className="hs-loading">
        <Loader2 size={24} className="tr-spin" />
        <p>Concluindo a conexão com o Instagram...</p>
      </section>
    </div>
  );
}
