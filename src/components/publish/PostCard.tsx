import { useState } from "react";
import { AlertCircle, Check, Film, Play, X } from "lucide-react";
import type { ConnectedAccount } from "@/services/socialAccountsService";
import { PlatformLogo } from "@/components/social/PlatformLogo";
import { formatDuration, type PostDraft } from "./postDraft";

export const PLATFORM_SHORT: Record<string, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
};

export const accountName = (a: ConnectedAccount) => a.label || a.platform_username || PLATFORM_SHORT[a.platform] || a.platform;

export function isDraftIncomplete(d: PostDraft) {
  return (
    d.accountIds.length === 0 ||
    (d.mode === "schedule" && (d.scheduledAt === "" || new Date(d.scheduledAt).getTime() <= Date.now()))
  );
}

export function PostCard({
  draft,
  accounts,
  showErrors,
  disabled,
  canApplyToAll,
  onChange,
  onRemove,
  onApplyAccountsToAll,
}: {
  draft: PostDraft;
  accounts: ConnectedAccount[];
  showErrors: boolean;
  disabled: boolean;
  canApplyToAll: boolean;
  onChange: (patch: Partial<PostDraft>) => void;
  onRemove: () => void;
  onApplyAccountsToAll: () => void;
}) {
  const [previewing, setPreviewing] = useState(false);

  const missingAccount = draft.accountIds.length === 0;
  const dateInPast = draft.scheduledAt !== "" && new Date(draft.scheduledAt).getTime() <= Date.now();
  const missingDate = draft.mode === "schedule" && (draft.scheduledAt === "" || dateInPast);
  const hasError = showErrors && (missingAccount || missingDate);

  const toggleAccount = (id: string) =>
    onChange({
      accountIds: draft.accountIds.includes(id) ? draft.accountIds.filter((a) => a !== id) : [...draft.accountIds, id],
    });

  const selectedNames = draft.accountIds
    .map((id) => accounts.find((a) => a.id === id))
    .filter((a): a is ConnectedAccount => !!a)
    .map(accountName);

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

        <div className="pb-accts">
          <div className="pb-accts-head">
            <span className="pb-label">Contas</span>
            {canApplyToAll && !missingAccount && (
              <button type="button" className="pb-link" disabled={disabled} onClick={onApplyAccountsToAll}>
                Aplicar a todos
              </button>
            )}
          </div>
          <div className="pb-accts-list">
            {accounts.map((a) => {
              const on = draft.accountIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`pb-acct${on ? " on" : ""}`}
                  disabled={disabled}
                  onClick={() => toggleAccount(a.id)}
                  title={`${accountName(a)} (${PLATFORM_SHORT[a.platform] ?? a.platform})`}
                  aria-pressed={on}
                >
                  <PlatformLogo platform={a.platform} size={30} />
                  {on && (
                    <span className="pb-acct-check">
                      <Check size={9} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {selectedNames.length > 0 && <span className="pb-selected-names">{selectedNames.join(" · ")}</span>}
        </div>

        <textarea
          className="pb-caption"
          value={draft.caption}
          maxLength={150}
          disabled={disabled}
          placeholder="Escreva a legenda..."
          onChange={(e) => onChange({ caption: e.target.value })}
        />

        <div className="pb-when-block">
          <span className="pb-label">Quando publicar</span>
          <div className="pb-radios">
            <label className="pb-radio">
              <input
                type="radio"
                name={`when-${draft.id}`}
                checked={draft.mode === "now"}
                disabled={disabled}
                onChange={() => onChange({ mode: "now" })}
              />
              Agora
            </label>
            <label className="pb-radio">
              <input
                type="radio"
                name={`when-${draft.id}`}
                checked={draft.mode === "schedule"}
                disabled={disabled}
                onChange={() => onChange({ mode: "schedule" })}
              />
              Programar
            </label>
          </div>
          {draft.mode === "schedule" && (
            <input
              type="datetime-local"
              className={`pb-datetime${showErrors && missingDate ? " pb-datetime-error" : ""}`}
              value={draft.scheduledAt}
              disabled={disabled}
              onChange={(e) => onChange({ scheduledAt: e.target.value })}
            />
          )}
        </div>

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
