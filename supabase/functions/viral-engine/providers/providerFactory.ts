import { SocialProvider } from "../types/provider.ts";
import { youtubeProvider } from "./youtubeProvider.ts";
import { tiktokProvider } from "./tiktokProvider.ts";
import { AppError } from "../utils/errorHandler.ts";

// instagramProvider.ts exists (Apify-based) but is intentionally NOT wired
// here yet -- tested live and it returns real posts, but Instagram hides
// view counts from unauthenticated scraping so every video comes back with
// views: 0, which breaks the whole "sort/filter by views" premise of this
// search. Revisit only if we're willing to score Instagram by likes instead.
export const providerFactory = {
  getProvider(platform: string): SocialProvider {
    switch (platform.toLowerCase()) {
      case "youtube":
        return youtubeProvider;
      case "tiktok":
        return tiktokProvider;
      default:
        throw new AppError(`Plataforma não suportada: ${platform}`, "UNSUPPORTED_PLATFORM", 400);
    }
  }
};
