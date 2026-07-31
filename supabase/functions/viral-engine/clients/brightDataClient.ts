import { AppError } from "../utils/errorHandler.ts";
import { logger } from "../utils/logger.ts";

export const brightDataClient = {
  fetchInstagramHashtag: async (hashtag: string, maxResults: number, cursor?: string) => {
    const apiKey = Deno.env.get("BRIGHTDATA_API_KEY");
    const datasetId = Deno.env.get("BRIGHTDATA_COLLECTOR_ID") || "gd_lyclm20il4r5helnj"; // Default to the one provided by user

    if (!apiKey) {
      throw new AppError("Bright Data API key is missing.", "CONFIG_ERROR", 500);
    }

    try {
      // For Bright Data "Discover by URL", the target URL is the hashtag explore page.
      const targetUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(hashtag)}/`;

      // The synchronous endpoint for discovery
      const apiUrl = `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${datasetId}&notify=false&include_errors=true&type=discover_new&discover_by=url`;
      
      logger.info(`Triggering Bright Data scraper for: ${targetUrl}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: [
            {
              url: targetUrl,
              country_code: "BR",
              start_date: "",
              end_date: ""
            }
          ],
          limit_per_input: maxResults
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Bright Data API error: ${response.status} - ${errorText}`);
        throw new AppError(`Bright Data API error: ${response.statusText}`, "BRIGHTDATA_API_ERROR", response.status);
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error(`Bright Data fetch failed: ${err.message}`);
      throw new AppError(err.message || "Failed to fetch from Bright Data.", "BRIGHTDATA_FETCH_ERROR", 500);
    }
  }
};
