import { useEffect, useState } from "react";
import { fetchCampaigns, subscribeCampaigns } from "@/lib/campaigns";
import type { Campaign } from "@/lib/types";
import { CampaignCard } from "./CampaignCard";
import { CampaignModal } from "./CampaignModal";

export function CampaignGrid() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Campaign | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchCampaigns()
        .then((c) => !cancelled && setCampaigns(c))
        .catch(() => !cancelled && setError(true));
    load();
    const unsub = subscribeCampaigns(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return (
    <div className="campaigns-wrapper">
      <div className="campaigns-header">
        <h1 className="campaigns-title">
          Sugestões <span className="highlight">pra Você</span>
        </h1>
        <p className="campaigns-subtitle">
          Escolha uma competição e comece a lucrar imediatamente com seus clipes virais
        </p>
      </div>
      <div className="campaigns-grid">
        {error ? (
          <div className="empty-state">❌ Erro ao carregar campanhas.</div>
        ) : !campaigns ? (
          <div className="empty-state">⏳ Carregando campanhas...</div>
        ) : campaigns.length === 0 ? (
          <div className="empty-state">Nenhuma campanha disponível no momento.</div>
        ) : (
          campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} onClick={() => setSelected(c)} />
          ))
        )}
      </div>
      <CampaignModal campaign={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
