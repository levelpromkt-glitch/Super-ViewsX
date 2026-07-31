import { AppError } from "../utils/errorHandler.ts";

export const sociaVaultClient = {
  fetchInstagramHashtag: async (hashtag: string, maxResults: number, cursor?: string) => {
    const url = Deno.env.get("SOCIAVAULT_URL");
    const apiKey = Deno.env.get("SOCIAVAULT_API_KEY");

    if (!url || !apiKey) {
      throw new AppError("SociaVault configuration is missing.", "CONFIG_ERROR", 500);
    }

    try {
      let fetchUrl = `${url}?hashtag=${encodeURIComponent(hashtag)}&limit=${maxResults}`;
      if (cursor) {
        fetchUrl += `&next_max_id=${encodeURIComponent(cursor)}`;
      }

      const response = await fetch(fetchUrl, {
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
