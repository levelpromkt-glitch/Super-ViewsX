import type { Campaign } from "@/lib/types";

export function CampaignModal({
  campaign,
  onClose,
}: {
  campaign: Campaign | null;
  onClose: () => void;
}) {
  return (
    <div
      className={`campaign-modal-overlay${campaign ? " active" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {campaign && (
        <div className="campaign-modal">
          <div className="modal-header">
            <h3>{campaign.name}</h3>
            <button className="modal-close-btn" onClick={onClose} aria-label="Fechar">
              ✕
            </button>
          </div>
          <div className="campaign-detail">
            <div className="label">Descrição</div>
            <div className="value description">
              {campaign.description || "Sem descrição disponível."}
            </div>
          </div>
          <div className="campaign-detail">
            <div className="label">Formato</div>
            <div className="value">{campaign.format || "—"}</div>
          </div>
          <div className="campaign-detail">
            <div className="label">Plataformas</div>
            <div className="value platforms">
              {campaign.platforms.length > 0 ? (
                campaign.platforms.map((p) => <span key={p}>{p}</span>)
              ) : (
                <span>Não especificado</span>
              )}
            </div>
          </div>
          <div className="campaign-detail">
            <div className="label">Orçamento</div>
            <div className="value budget">{campaign.budget || "R$ 0"}</div>
          </div>
          <div className="campaign-detail">
            <div className="label">Promotor</div>
            <div className="value">{campaign.promoter || "—"}</div>
          </div>
          <div className="campaign-detail">
            <div className="label">Status</div>
            <div className="value">{campaign.status || "Ativa"}</div>
          </div>
          {campaign.signupLink && (
            <div className="modal-actions">
              <a
                href={campaign.signupLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-signup"
              >
                Cadastrar na campanha
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
