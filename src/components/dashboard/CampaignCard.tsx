import type { Campaign } from "@/lib/types";

const colors = [
  "linear-gradient(135deg,#0D1A10,#0B2614)",
  "linear-gradient(135deg,#0F1A12,#0B2A15)",
  "linear-gradient(135deg,#121A14,#0D2618)",
  "linear-gradient(135deg,#0E1A14,#0B2818)",
  "linear-gradient(135deg,#0D1A12,#0A2414)",
  "linear-gradient(135deg,#101A14,#0C2818)",
  "linear-gradient(135deg,#0F1A12,#0D2618)",
];

export function CampaignCard({
  campaign,
  onClick,
}: {
  campaign: Campaign;
  onClick: () => void;
}) {
  const colorIndex = parseInt(campaign.id, 36) % colors.length;
  const statusColor = campaign.status === "Ativa" ? "#38E07B" : "#6D756B";

  return (
    <div className="campaign-card" onClick={onClick}>
      <div
        className="campaign-image"
        style={
          campaign.coverImage
            ? { backgroundImage: `url(${campaign.coverImage})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: colors[colorIndex] }
        }
      >
        <span
          className="status-badge"
          style={{ background: statusColor, color: "#050805" }}
        >
          {campaign.status}
        </span>
        <span className="format-badge">{campaign.format}</span>
      </div>
      <div className="campaign-info">
        <div className="campaign-name">{campaign.name}</div>
        <div className="campaign-sub">{campaign.sub}</div>
        <div className="platform-icons">
          {campaign.platforms.map((p) => (
            <span key={p} className="platform-label">
              {p}
            </span>
          ))}
        </div>
        <div className="budget-row">
          <span className="budget">{campaign.budget}</span>
          <span className="promoter">
            por <strong>{campaign.promoter}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
