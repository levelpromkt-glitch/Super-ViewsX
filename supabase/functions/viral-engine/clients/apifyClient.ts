import { env } from "../config/env.ts";
import { AppError } from "../utils/errorHandler.ts";
import { logger } from "../utils/logger.ts";

const APIFY_API_URL = "https://api.apify.com/v2";
// We use the Instagram Hashtag Scraper because the official one requires cookies for engagement stats
const ACTOR_ID = "apify~instagram-hashtag-scraper";

export const apifyClient = {
  /**
   * Triggers a new scraping run for an Instagram hashtag.
   * Returns the runId (which we use as the cursor/snapshot ID).
   */
  triggerInstagramHashtag: async (hashtag: string, maxResults: number): Promise<string> => {
    const token = env.APIFY_API_TOKEN;
    if (!token) {
      throw new AppError("APIFY_API_TOKEN is not configured", "MISSING_ENV_VAR", 500);
    }

    const cleanHashtag = hashtag.replace("#", "");

    // Payload for apify/instagram-hashtag-scraper
    const payload = {
      hashtags: [cleanHashtag],
      resultsType: "posts",
      resultsLimit: maxResults || 30
    };

    logger.info(`Triggering Apify Actor ${ACTOR_ID} for hashtag: ${cleanHashtag}`);

    const response = await fetch(`${APIFY_API_URL}/acts/${ACTOR_ID}/runs?token=${token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Apify Trigger error: ${response.status} - ${errorText}`);
      throw new AppError(`Apify API error: ${response.statusText}`, "APIFY_API_ERROR", response.status);
    }

    const data = await response.json();
    const runId = data.data.id;
    return runId;
  },

  /**
   * Checks the status of the Apify Run.
   * Returns { status: "running" } or { status: "ready", defaultDatasetId }
   */
  getRunStatus: async (runId: string): Promise<{ status: "running" | "ready"; defaultDatasetId?: string }> => {
    const token = env.APIFY_API_TOKEN;
    const response = await fetch(`${APIFY_API_URL}/actor-runs/${runId}?token=${token}`, {
      method: "GET"
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Apify GetRun error: ${response.status} - ${errorText}`);
      throw new AppError(`Apify API error: ${response.statusText}`, "APIFY_API_ERROR", response.status);
    }

    const data = await response.json();
    const runStatus = data.data.status; // RUNNING, SUCCEEDED, FAILED, TIMING-OUT, etc.

    if (runStatus === "SUCCEEDED") {
      return { status: "ready", defaultDatasetId: data.data.defaultDatasetId };
    } else if (runStatus === "FAILED" || runStatus === "ABORTED" || runStatus === "TIMED-OUT") {
      throw new AppError(`Apify run failed with status: ${runStatus}`, "APIFY_RUN_FAILED", 500);
    }

    // RUNNING or READY (preparing)
    return { status: "running" };
  },

  /**
   * Fetches the actual items from the Apify Dataset once the run is complete.
   */
  getDatasetItems: async (datasetId: string): Promise<any[]> => {
    const token = env.APIFY_API_TOKEN;
    const response = await fetch(`${APIFY_API_URL}/datasets/${datasetId}/items?token=${token}&format=json`, {
      method: "GET"
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Apify GetDataset error: ${response.status} - ${errorText}`);
      throw new AppError(`Apify API error: ${response.statusText}`, "APIFY_API_ERROR", response.status);
    }

    return await response.json();
  }
};
