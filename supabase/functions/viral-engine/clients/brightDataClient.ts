import { AppError } from "../utils/errorHandler.ts";
import { logger } from "../utils/logger.ts";

export const brightDataClient = {
  triggerInstagramHashtag: async (hashtag: string, maxResults: number) => {
    const apiKey = Deno.env.get("BRIGHTDATA_API_KEY");
    const datasetId = Deno.env.get("BRIGHTDATA_COLLECTOR_ID") || "gd_lyclm20il4r5helnj";

    if (!apiKey) {
      throw new AppError("Bright Data API key is missing.", "CONFIG_ERROR", 500);
    }

    try {
      const targetUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(hashtag)}/`;
      const apiUrl = `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${datasetId}&include_errors=true&type=discover_new&discover_by=url`;
      
      logger.info(`Triggering ASYNC Bright Data scraper for: ${targetUrl}`);

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
        logger.error(`Bright Data Trigger error: ${response.status} - ${errorText}`);
        throw new AppError(`Bright Data API error: ${response.statusText}`, "BRIGHTDATA_API_ERROR", response.status);
      }

      const data = await response.json();
      return data.snapshot_id;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error(`Bright Data trigger failed: ${err.message}`);
      throw new AppError(err.message || "Failed to trigger Bright Data.", "BRIGHTDATA_FETCH_ERROR", 500);
    }
  },

  getSnapshot: async (snapshotId: string) => {
    const apiKey = Deno.env.get("BRIGHTDATA_API_KEY");
    if (!apiKey) {
      throw new AppError("Bright Data API key is missing.", "CONFIG_ERROR", 500);
    }

    try {
      const apiUrl = `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`;
      
      logger.info(`Checking Bright Data snapshot: ${snapshotId}`);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      // 202 Accepted usually means it's still running
      if (response.status === 202) {
        return { status: "running" };
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Bright Data Snapshot error: ${response.status} - ${errorText}`);
        throw new AppError(`Bright Data Snapshot error: ${response.statusText}`, "BRIGHTDATA_API_ERROR", response.status);
      }

      const data = await response.json();
      return { status: "ready", data };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error(`Bright Data snapshot check failed: ${err.message}`);
      throw new AppError(err.message || "Failed to get Bright Data snapshot.", "BRIGHTDATA_FETCH_ERROR", 500);
    }
  }
};
