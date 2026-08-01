import { AppError } from "../utils/errorHandler.ts";

export const sociaVaultClient = {
  fetchInstagramHashtag: async (hashtag: string, maxResults: number) => {
    const url = Deno.env.get("SOCIAVAULT_URL");
    const rawKeys = Deno.env.get("SOCIAVAULT_API_KEY");

    if (!url || !rawKeys) {
      throw new AppError("SociaVault configuration is missing.", "CONFIG_ERROR", 500);
    }

    // Split by comma, trim whitespace, remove empty
    let apiKeys = rawKeys.split(",").map(k => k.trim()).filter(Boolean);

    // Shuffle the array to distribute the load (Randomized usage)
    for (let i = apiKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [apiKeys[i], apiKeys[j]] = [apiKeys[j], apiKeys[i]];
    }

    let lastError: Error | null = null;

    for (const apiKey of apiKeys) {
      try {
        const response = await fetch(`${url}?hashtag=${encodeURIComponent(hashtag)}&limit=${maxResults}`, {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        if (!response.ok || data.success === false) {
           // If error (e.g. out of credits or 429 limit), throw so it catches and tries next key
           throw new Error(data.message || `API Error: ${response.status}`);
        }

        // Success!
        return data;
      } catch (err: any) {
        lastError = err;
        // console.log(`Key ${apiKey.substring(0,4)} failed. Trying next... Error: ${err.message}`);
        continue;
      }
    }

    throw new AppError(lastError?.message || "Todas as chaves da API falharam ou estão sem créditos.", "SOCIAVAULT_FETCH_ERROR", 500);
  }
};
