import { AppError } from "../utils/errorHandler.ts";

export const sociaVaultClient = {
  fetchInstagramHashtag: async (hashtag: string, maxResults: number) => {
    const url = Deno.env.get("SOCIAVAULT_URL");
    const apiKey = Deno.env.get("SOCIAVAULT_API_KEY");

    if (!url || !apiKey) {
      throw new AppError("SociaVault configuration is missing.", "CONFIG_ERROR", 500);
    }

    try {
      const response = await fetch(`${url}?hashtag=${encodeURIComponent(hashtag)}&limit=${maxResults}`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new AppError(`SociaVault API error: ${response.statusText}`, "SOCIAVAULT_API_ERROR", response.status);
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      throw new AppError(err.message || "Failed to fetch from SociaVault.", "SOCIAVAULT_FETCH_ERROR", 500);
    }
  }
};
