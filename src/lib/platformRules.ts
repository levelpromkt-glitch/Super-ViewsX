export type PublishPlatform = "youtube" | "tiktok" | "instagram";

export const LIMITS = {
  youtubeTitle: 100,
  youtubeDescriptionBytes: 5000,
  tiktokCaption: 2200,
  instagramCaption: 2200,
  instagramHashtags: 30,
  instagramMentions: 20,
  instagramUserTags: 20,
} as const;

// Flip to true once Google/TikTok audit the app. Until then both platforms
// force every uploaded video to private, whatever visibility is chosen.
export const PLATFORM_AUDITED: Record<"youtube" | "tiktok", boolean> = {
  youtube: false,
  tiktok: false,
};

export type YoutubePrivacy = "public" | "unlisted" | "private";

export const YOUTUBE_PRIVACY_LABELS: Record<YoutubePrivacy, string> = {
  public: "Público",
  unlisted: "Não listado",
  private: "Privado",
};

export const TIKTOK_PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Todos",
  MUTUAL_FOLLOW_FRIENDS: "Amigos (seguem um ao outro)",
  FOLLOWER_OF_CREATOR: "Seguidores",
  SELF_ONLY: "Só eu",
};

// null on a text field means "follow the general caption".
export type PlatformSettings = {
  youtube: { title: string | null; description: string | null; privacy: YoutubePrivacy; madeForKids: boolean; aiContent: boolean };
  tiktok: {
    caption: string | null;
    privacy: string | null;
    allowComment: boolean;
    allowDuet: boolean;
    allowStitch: boolean;
    aiContent: boolean;
  };
  instagram: { caption: string | null; aiContent: boolean; userTags: string[] };
};

export const defaultSettings = (): PlatformSettings => ({
  youtube: { title: null, description: null, privacy: PLATFORM_AUDITED.youtube ? "public" : "private", madeForKids: false, aiContent: false },
  tiktok: { caption: null, privacy: null, allowComment: true, allowDuet: true, allowStitch: true, aiContent: false },
  instagram: { caption: null, aiContent: false, userTags: [] },
});

export type YoutubeOptions = {
  title: string;
  description: string;
  privacy: YoutubePrivacy;
  madeForKids: boolean;
  aiContent: boolean;
};
export type TikTokOptions = {
  caption: string;
  privacy: string;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  aiContent: boolean;
};
export type InstagramOptions = { caption: string; aiContent: boolean; userTags: string[] };
export type PostOptions = YoutubeOptions | TikTokOptions | InstagramOptions;

export type TikTokCreatorInfo = {
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoDurationSec: number | null;
};

export const byteLength = (s: string) => new TextEncoder().encode(s).length;

export const countHashtags = (s: string) => (s.match(/#[\p{L}\p{N}_]+/gu) || []).length;

const INSTAGRAM_USERNAME = /^[a-z0-9._]{1,30}$/;

// "@Fulano " -> "fulano"; returns null when it isn't a valid Instagram username.
export function normalizeInstagramUsername(raw: string): string | null {
  const name = raw.trim().replace(/^@+/, "").toLowerCase();
  return INSTAGRAM_USERNAME.test(name) ? name : null;
}

export const countMentions = (s: string) => (s.match(/@[A-Za-z0-9._]+/g) || []).length;

// First line of the general caption, cut at a word boundary to fit the title limit.
export function defaultYoutubeTitle(base: string) {
  const firstLine = base.split("\n")[0].trim();
  if (firstLine.length <= LIMITS.youtubeTitle) return firstLine;
  const cut = firstLine.slice(0, LIMITS.youtubeTitle);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
}

export function resolveYoutube(base: string, s: PlatformSettings["youtube"]): YoutubeOptions {
  return {
    title: s.title ?? defaultYoutubeTitle(base),
    description: s.description ?? base,
    privacy: PLATFORM_AUDITED.youtube ? s.privacy : "private",
    madeForKids: s.madeForKids,
    aiContent: s.aiContent,
  };
}

export function resolveTikTok(base: string, s: PlatformSettings["tiktok"], privacyOptions: string[]): TikTokOptions {
  const privacy = !PLATFORM_AUDITED.tiktok
    ? "SELF_ONLY"
    : s.privacy && privacyOptions.includes(s.privacy)
      ? s.privacy
      : privacyOptions[0] || "SELF_ONLY";
  return {
    caption: s.caption ?? base,
    privacy,
    disableComment: !s.allowComment,
    disableDuet: !s.allowDuet,
    disableStitch: !s.allowStitch,
    aiContent: s.aiContent,
  };
}

export function resolveInstagram(base: string, s: PlatformSettings["instagram"]): InstagramOptions {
  return { caption: s.caption ?? base, aiContent: s.aiContent, userTags: s.userTags };
}

export function validateYoutube(o: YoutubeOptions): string[] {
  const errors: string[] = [];
  if (!o.title.trim()) errors.push("O título é obrigatório.");
  if (o.title.length > LIMITS.youtubeTitle) errors.push(`O título passa de ${LIMITS.youtubeTitle} caracteres.`);
  if (/[<>]/.test(o.title)) errors.push("O título não pode ter os caracteres < ou >.");
  if (byteLength(o.description) > LIMITS.youtubeDescriptionBytes) errors.push(`A descrição passa do limite de ${LIMITS.youtubeDescriptionBytes} bytes.`);
  if (/[<>]/.test(o.description)) errors.push("A descrição não pode ter os caracteres < ou >.");
  return errors;
}

export function validateTikTok(o: TikTokOptions, videoDurationSec: number | null, info: TikTokCreatorInfo | null): string[] {
  const errors: string[] = [];
  if (o.caption.length > LIMITS.tiktokCaption) errors.push(`A legenda passa de ${LIMITS.tiktokCaption} caracteres.`);
  if (info?.maxVideoDurationSec && videoDurationSec && videoDurationSec > info.maxVideoDurationSec) {
    errors.push(`O vídeo tem ${Math.ceil(videoDurationSec)}s e o TikTok aceita no máximo ${info.maxVideoDurationSec}s nessa conta.`);
  }
  return errors;
}

export function validateInstagram(o: InstagramOptions): string[] {
  const errors: string[] = [];
  if (o.caption.length > LIMITS.instagramCaption) errors.push(`A legenda passa de ${LIMITS.instagramCaption} caracteres.`);
  const tags = countHashtags(o.caption);
  if (tags > LIMITS.instagramHashtags) errors.push(`A legenda tem ${tags} hashtags e o Instagram aceita no máximo ${LIMITS.instagramHashtags}.`);
  const mentions = countMentions(o.caption);
  if (mentions > LIMITS.instagramMentions) errors.push(`A legenda tem ${mentions} menções (@) e o Instagram aceita no máximo ${LIMITS.instagramMentions}.`);
  if (o.userTags.length > LIMITS.instagramUserTags) errors.push(`Marque no máximo ${LIMITS.instagramUserTags} pessoas no vídeo.`);
  return errors;
}

// Text stored in scheduled_posts.caption (shown in the history list).
export function summaryText(platform: PublishPlatform, o: PostOptions) {
  return platform === "youtube" ? (o as YoutubeOptions).title : (o as TikTokOptions | InstagramOptions).caption;
}

export type TikTokState = { privacyOptions: string[]; info: TikTokCreatorInfo | null };

export type PostPlan = {
  options: Partial<Record<PublishPlatform, PostOptions>>;
  errors: Partial<Record<PublishPlatform, string[]>>;
};

// Resolves the final text/options per selected platform and lists everything
// that would be rejected, so the form can block the submit up front.
export function buildPlan(
  platforms: PublishPlatform[],
  base: string,
  settings: PlatformSettings,
  tiktok: TikTokState,
  videoDurationSec: number | null
): PostPlan {
  const plan: PostPlan = { options: {}, errors: {} };
  for (const platform of platforms) {
    if (platform === "youtube") {
      const o = resolveYoutube(base, settings.youtube);
      plan.options.youtube = o;
      plan.errors.youtube = validateYoutube(o);
    } else if (platform === "tiktok") {
      const o = resolveTikTok(base, settings.tiktok, tiktok.privacyOptions);
      plan.options.tiktok = o;
      plan.errors.tiktok = validateTikTok(o, videoDurationSec, tiktok.info);
    } else {
      const o = resolveInstagram(base, settings.instagram);
      plan.options.instagram = o;
      plan.errors.instagram = validateInstagram(o);
    }
  }
  return plan;
}
