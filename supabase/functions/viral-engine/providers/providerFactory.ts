import { SocialProvider } from "../types/provider.ts";
import { youtubeProvider } from "./youtubeProvider.ts";
import { instagramProvider } from "./instagramProvider.ts";
import { AppError } from "../utils/errorHandler.ts";

export const providerFactory = {
  getProvider(platform: string): SocialProvider {
    switch (platform.toLowerCase()) {
      case "youtube":
        return youtubeProvider;
      case "instagram":
        return instagramProvider;
      default:
        throw new AppError(`Plataforma não suportada: ${platform}`, "UNSUPPORTED_PLATFORM", 400);
    }
  }
};
