import { useState, type KeyboardEvent } from "react";
import { AlertCircle, RotateCcw, X } from "lucide-react";
import { PlatformLogo } from "@/components/social/PlatformLogo";
import {
  LIMITS,
  PLATFORM_AUDITED,
  TIKTOK_PRIVACY_LABELS,
  YOUTUBE_PRIVACY_LABELS,
  byteLength,
  countHashtags,
  countMentions,
  normalizeInstagramUsername,
  type InstagramOptions,
  type PlatformSettings,
  type PostPlan,
  type PublishPlatform,
  type TikTokCreatorInfo,
  type TikTokOptions,
  type YoutubeOptions,
  type YoutubePrivacy,
} from "@/lib/platformRules";
import { PLATFORM_SHORT } from "./publishUtils";

type TikTokUi = { privacyOptions: string[]; info: TikTokCreatorInfo | null; loading: boolean; error: string | null };

function Counter({ value, max, unit = "" }: { value: number; max: number; unit?: string }) {
  return (
    <span className={`pb-count${value > max ? " over" : ""}`}>
      {value}/{max}
      {unit}
    </span>
  );
}

function FollowsGeneral({ overridden, onReset }: { overridden: boolean; onReset: () => void }) {
  return overridden ? (
    <button type="button" className="pb-link" onClick={onReset}>
      <RotateCcw size={10} /> Voltar ao texto geral
    </button>
  ) : (
    <span className="pb-hint">Seguindo o texto geral</span>
  );
}

function UsernameField({
  label,
  hint,
  values,
  max,
  onAdd,
  onRemove,
  disabled,
}: {
  label: string;
  hint: string;
  values?: string[];
  max?: number;
  onAdd: (username: string) => void;
  onRemove?: (username: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = max !== undefined && (values?.length ?? 0) >= max;

  const submit = () => {
    if (!text.trim()) return;
    const name = normalizeInstagramUsername(text);
    if (!name) {
      setError("Usuário inválido. Use só letras, números, ponto e underline.");
      return;
    }
    if (values?.includes(name)) {
      setError("Esse usuário já foi adicionado.");
      return;
    }
    onAdd(name);
    setText("");
    setError(null);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="pb-ufield">
      <div className="pb-field-head">
        <span className="pb-flabel">{label}</span>
        {max !== undefined && <Counter value={values?.length ?? 0} max={max} />}
      </div>
      <div className="pb-ufield-row">
        <input
          className="pb-input"
          value={text}
          disabled={disabled || full}
          placeholder={full ? "Limite atingido" : "@usuario"}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={onKey}
        />
        <button type="button" className="hs-btn-ghost" style={{ flex: "none" }} disabled={disabled || full || !text.trim()} onClick={submit}>
          Adicionar
        </button>
      </div>
      {error ? <span className="pb-field-error">{error}</span> : <span className="pb-hint">{hint}</span>}
      {values && values.length > 0 && (
        <div className="pb-uchips">
          {values.map((u) => (
            <button key={u} type="button" className="pb-uchip" disabled={disabled} onClick={() => onRemove?.(u)} title="Remover">
              @{u} <X size={10} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Check({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`pb-check${disabled ? " disabled" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function ContentSection({
  platforms,
  base,
  onBase,
  settings,
  onSettings,
  plan,
  tiktok,
  disabled,
}: {
  platforms: PublishPlatform[];
  base: string;
  onBase: (v: string) => void;
  settings: PlatformSettings;
  onSettings: (next: PlatformSettings) => void;
  plan: PostPlan;
  tiktok: TikTokUi;
  disabled: boolean;
}) {
  const [tab, setTab] = useState<"general" | PublishPlatform>("general");
  const active: "general" | PublishPlatform = tab === "general" || platforms.includes(tab) ? tab : "general";

  const yt = plan.options.youtube as YoutubeOptions | undefined;
  const tt = plan.options.tiktok as TikTokOptions | undefined;
  const ig = plan.options.instagram as InstagramOptions | undefined;

  const setYt = (patch: Partial<PlatformSettings["youtube"]>) => onSettings({ ...settings, youtube: { ...settings.youtube, ...patch } });
  const setTt = (patch: Partial<PlatformSettings["tiktok"]>) => onSettings({ ...settings, tiktok: { ...settings.tiktok, ...patch } });
  const setIg = (patch: Partial<PlatformSettings["instagram"]>) => onSettings({ ...settings, instagram: { ...settings.instagram, ...patch } });

  const errorsFor = (platform: PublishPlatform) => plan.errors[platform] || [];

  return (
    <div className="pb-content">
      <div className="pb-ctabs">
        <button type="button" className={`pb-ctab${active === "general" ? " active" : ""}`} onClick={() => setTab("general")}>
          Geral
        </button>
        {platforms.map((p) => (
          <button key={p} type="button" className={`pb-ctab${active === p ? " active" : ""}`} onClick={() => setTab(p)}>
            <PlatformLogo platform={p} size={16} />
            {PLATFORM_SHORT[p]}
            {errorsFor(p).length > 0 && <span className="pb-ctab-dot" aria-label="Há erros" />}
          </button>
        ))}
      </div>

      <div className="pb-cbody">
        {active === "general" && (
          <div className="pb-cpanel">
            <div className="pb-field-head">
              <span className="pb-flabel">Legenda geral</span>
              <Counter value={base.length} max={LIMITS.tiktokCaption} />
            </div>
            <textarea
              className="pb-caption"
              value={base}
              maxLength={LIMITS.tiktokCaption}
              disabled={disabled}
              placeholder="Escreva a legenda do post..."
              onChange={(e) => onBase(e.target.value)}
            />
            <span className="pb-hint">
              Serve de ponto de partida para todas as redes. Cada rede tem as suas próprias regras e pode ter um texto diferente
              na aba dela.
            </span>
          </div>
        )}

        {active === "youtube" && yt && (
          <div className="pb-cpanel">
            {!PLATFORM_AUDITED.youtube && (
              <div className="pb-warn">
                <AlertCircle size={14} />
                <span>
                  O app ainda não foi verificado pelo Google, então o YouTube publica o vídeo como <strong>privado</strong>,
                  mesmo que você escolha outra visibilidade.
                </span>
              </div>
            )}
            <div className="pb-field-head">
              <span className="pb-flabel">Título</span>
              <FollowsGeneral overridden={settings.youtube.title !== null} onReset={() => setYt({ title: null })} />
              <Counter value={yt.title.length} max={LIMITS.youtubeTitle} />
            </div>
            <input
              className="pb-input"
              value={yt.title}
              disabled={disabled}
              placeholder="Título do vídeo"
              onChange={(e) => setYt({ title: e.target.value })}
            />
            <div className="pb-field-head">
              <span className="pb-flabel">Descrição</span>
              <FollowsGeneral overridden={settings.youtube.description !== null} onReset={() => setYt({ description: null })} />
              <Counter value={byteLength(yt.description)} max={LIMITS.youtubeDescriptionBytes} unit=" bytes" />
            </div>
            <textarea
              className="pb-caption"
              value={yt.description}
              disabled={disabled}
              placeholder="Descrição do vídeo"
              onChange={(e) => setYt({ description: e.target.value })}
            />
            <div className="pb-field-head">
              <span className="pb-flabel">Visibilidade</span>
            </div>
            <select
              className="pb-input"
              value={yt.privacy}
              disabled={disabled || !PLATFORM_AUDITED.youtube}
              onChange={(e) => setYt({ privacy: e.target.value as YoutubePrivacy })}
            >
              {(Object.keys(YOUTUBE_PRIVACY_LABELS) as YoutubePrivacy[]).map((k) => (
                <option key={k} value={k}>
                  {YOUTUBE_PRIVACY_LABELS[k]}
                </option>
              ))}
            </select>
            <Check checked={settings.youtube.madeForKids} disabled={disabled} onChange={(v) => setYt({ madeForKids: v })}>
              Este vídeo é feito para crianças
            </Check>
            <Check checked={settings.youtube.aiContent} disabled={disabled} onChange={(v) => setYt({ aiContent: v })}>
              Contém conteúdo alterado ou gerado por IA
            </Check>
          </div>
        )}

        {active === "tiktok" && tt && (
          <div className="pb-cpanel">
            {!PLATFORM_AUDITED.tiktok && (
              <div className="pb-warn">
                <AlertCircle size={14} />
                <span>
                  O app ainda não passou na auditoria do TikTok, então o TikTok publica o vídeo como <strong>privado (só você vê)</strong>,
                  mesmo que você escolha outra visibilidade.
                </span>
              </div>
            )}
            <div className="pb-field-head">
              <span className="pb-flabel">Legenda</span>
              <FollowsGeneral overridden={settings.tiktok.caption !== null} onReset={() => setTt({ caption: null })} />
              <Counter value={tt.caption.length} max={LIMITS.tiktokCaption} />
            </div>
            <textarea
              className="pb-caption"
              value={tt.caption}
              disabled={disabled}
              placeholder="Legenda do vídeo"
              onChange={(e) => setTt({ caption: e.target.value })}
            />
            <div className="pb-field-head">
              <span className="pb-flabel">Quem pode ver</span>
            </div>
            {tiktok.loading ? (
              <span className="pb-hint">Carregando as opções da conta...</span>
            ) : (
              <select
                className="pb-input"
                value={tt.privacy}
                disabled={disabled || !PLATFORM_AUDITED.tiktok}
                onChange={(e) => setTt({ privacy: e.target.value })}
              >
                {(tiktok.privacyOptions.length > 0 ? tiktok.privacyOptions : ["SELF_ONLY"]).map((k) => (
                  <option key={k} value={k}>
                    {TIKTOK_PRIVACY_LABELS[k] ?? k}
                  </option>
                ))}
              </select>
            )}
            {tiktok.error && <span className="pb-field-error">{tiktok.error}</span>}
            <Check
              checked={settings.tiktok.allowComment && !tiktok.info?.commentDisabled}
              disabled={disabled || !!tiktok.info?.commentDisabled}
              onChange={(v) => setTt({ allowComment: v })}
            >
              Permitir comentários
            </Check>
            <Check
              checked={settings.tiktok.allowDuet && !tiktok.info?.duetDisabled}
              disabled={disabled || !!tiktok.info?.duetDisabled}
              onChange={(v) => setTt({ allowDuet: v })}
            >
              Permitir Duet
            </Check>
            <Check
              checked={settings.tiktok.allowStitch && !tiktok.info?.stitchDisabled}
              disabled={disabled || !!tiktok.info?.stitchDisabled}
              onChange={(v) => setTt({ allowStitch: v })}
            >
              Permitir Stitch
            </Check>
            <Check checked={settings.tiktok.aiContent} disabled={disabled} onChange={(v) => setTt({ aiContent: v })}>
              Conteúdo gerado por IA
            </Check>
          </div>
        )}

        {active === "instagram" && ig && (
          <div className="pb-cpanel">
            <div className="pb-field-head">
              <span className="pb-flabel">Legenda</span>
              <FollowsGeneral overridden={settings.instagram.caption !== null} onReset={() => setIg({ caption: null })} />
              <Counter value={ig.caption.length} max={LIMITS.instagramCaption} />
            </div>
            <textarea
              className="pb-caption"
              value={ig.caption}
              disabled={disabled}
              placeholder="Legenda do Reel"
              onChange={(e) => setIg({ caption: e.target.value })}
            />
            <div className="pb-meta-row">
              <span className={countHashtags(ig.caption) > LIMITS.instagramHashtags ? "pb-field-error" : "pb-hint"}>
                Hashtags: {countHashtags(ig.caption)}/{LIMITS.instagramHashtags}
              </span>
              <span className={countMentions(ig.caption) > LIMITS.instagramMentions ? "pb-field-error" : "pb-hint"}>
                Menções: {countMentions(ig.caption)}/{LIMITS.instagramMentions}
              </span>
            </div>
            <UsernameField
              label="Marcar no vídeo"
              hint="Aparece como marcação no Reel. A conta marcada precisa ser pública."
              values={settings.instagram.userTags}
              max={LIMITS.instagramUserTags}
              disabled={disabled}
              onAdd={(u) => setIg({ userTags: [...settings.instagram.userTags, u] })}
              onRemove={(u) => setIg({ userTags: settings.instagram.userTags.filter((x) => x !== u) })}
            />
            <Check checked={settings.instagram.aiContent} disabled={disabled} onChange={(v) => setIg({ aiContent: v })}>
              Conteúdo gerado por IA
            </Check>
          </div>
        )}

        {active !== "general" && errorsFor(active).length > 0 && (
          <ul className="pb-errors">
            {errorsFor(active).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
