import type { ConnectedAccount } from "@/services/socialAccountsService";

export const PLATFORM_SHORT: Record<string, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
};

export const accountName = (a: ConnectedAccount) =>
  a.label || a.platform_username || PLATFORM_SHORT[a.platform] || a.platform;
