import { useState } from "react";
import { AlertCircle, Calendar, Film, Play, Plus, X } from "lucide-react";
import type { ConnectedAccount } from "@/services/socialAccountsService";
import { PlatformLogo } from "@/components/social/PlatformLogo";
import { formatDuration, type PostDraft } from "./postDraft";

export const PLATFORM_SHORT: Record<string, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
};

export const accountName = (a: ConnectedAccount) => a.label || a.platform_username || PLATFORM_SHORT[a.platform] || a.platform;

export function PostCard({
  draft,
  accounts,
  requireDate,
  showErrors,
  disabled,
  onChange,
  onRemove,
}: {
  draft: PostDraft;
  accounts: ConnectedAccount[];
  requireDate: boolean;
  showErrors: boolean;
  disabled: boolean;
  onChange: (patch: Partial<PostDraft>) => void;
  onRemove: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const missingAccount = draft.accountIds.length === 0;
  const dateInPast = draft.scheduledAt !== "" && new Date(draft.scheduledAt).getTime() <= Date.now();
  const missingDate = requireDate && (draft.scheduledAt === "" || dateInPast);
  const hasError = showErrors && (missingAccount || missingDate);

  const toggleAccount = (id: string) =>
    onChange({
      accountIds: draft.accountIds.includes(id) ? draft.accountIds.filter((a) => a !== id) : [...draft.accountIds, id],
    });

  return (
    <article className={`pb-card${hasError ? " pb-card-error" : ""}`}>
      <div className="pb-thumb">
        {previewing ? (
          <video src={draft.previewUrl} controls autoPlay className="pb-thumb-media" onEnded={() => setPreviewing(false)} />
        ) : (
          <button type="button" className="pb-thumb-btn" onClick={() => setPreviewing(true)} aria-label="Assistir vídeo">
            {draft.thumbnail ? (
              <img src={draft.thumbnail} alt="" className="pb-thumb-media" />
            ) : (
              <Film size={26} />
            )}
            <span className="pb-thumb-play"><Play size={18} /></span>
            {draft.duration !== null && <span className="pb-thumb-dur">{formatDuration(draft.duration)}</span>}
          </button>
        )}
        <button type="button" className="pb-thumb-x" onClick={onRemove} disabled={disabled} aria-label="Remover vídeo">
          <X size={12} />
        </button>
      </div>

      <div className="pb-body">
        <div className="pb-filename" title={draft.file.name}>{draft.file.name}</div>
        <textarea
          className="pb-caption"
          value={draft.caption}
          maxLength={150}
          disabled={disabled}
          placeholder="Escreva a legenda..."
          onChange={(e) => onChange({ caption: e.target.value })}
        />

        <div className="pb-chips">
          {draft.accountIds.map((id) => {
            const acc = accounts.find((a) => a.id === id);
            if (!acc) return null;
            return (
              <button
                key={id}
                type="button"
                className="pb-chip pb-chip-on"
                disabled={disabled}
                onClick={() => toggleAccount(id)}
                title="Remover esta conta"
              >
                <PlatformLogo platform={acc.platform} size={16} />
                {accountName(acc)} <X size={10} />
              </button>
            );
          })}
          <button type="button" className="pb-chip" disabled={disabled} onClick={() => setPickerOpen((v) => !v)}>
            <Plus size={10} /> {missingAccount ? "Escolher contas" : "Contas"}
          </button>
        </div>
        {pickerOpen && (
          <div className="pb-picker">
            {accounts.map((a) => (
              <label key={a.id} className="pb-picker-row">
                <input type="checkbox" checked={draft.accountIds.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                <PlatformLogo platform={a.platform} size={20} />
                {accountName(a)}
              </label>
            ))}
          </div>
        )}

        {requireDate && (
          <label className={`pb-when${showErrors && missingDate ? " pb-when-error" : ""}`}>
            <Calendar size={12} />
            <input
              type="datetime-local"
              value={draft.scheduledAt}
              disabled={disabled}
              onChange={(e) => onChange({ scheduledAt: e.target.value })}
            />
          </label>
        )}

        {hasError && (
          <div className="pb-card-msg">
            <AlertCircle size={12} />
            {missingAccount ? "Escolha ao menos uma conta" : dateInPast ? "A data precisa ser no futuro" : "Defina data e hora"}
          </div>
        )}
      </div>
    </article>
  );
}
