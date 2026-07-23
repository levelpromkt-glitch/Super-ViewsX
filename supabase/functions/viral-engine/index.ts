import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleError } from "./utils/errorHandler.ts";
import { logger } from "./utils/logger.ts";
import { parsePeriodToISO } from "./utils/date.ts";
import { parseQuery } from "./parsers/queryParser.ts";
import { validateSearchRequest } from "./validators/requestValidator.ts";
import { youtubeService } from "./services/youtubeService.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const rawBody = await req.json().catch(() => ({}));
    
    // 1. Validator
    const validatedRequest = validateSearchRequest(rawBody);
    
    // 2. Parser
    const parsedQuery = parseQuery(validatedRequest.query);
    const publishedAfter = parsePeriodToISO(validatedRequest.period);

    logger.info("Starting viral mining", { query: parsedQuery, period: validatedRequest.period });

    // 3. Service Orchestration
    const { videos, quotaUsed } = await youtubeService.searchVideos(
      parsedQuery,
      publishedAfter,
      validatedRequest.maxResults,
      validatedRequest.minViews
    );

    const executionTime = Date.now() - startTime;

    // 4. Build Context-Rich Response
    const responseBody = {
      success: true,
      search: {
        type: "hashtag",
        query: validatedRequest.query,
        parsedQuery,
        period: validatedRequest.period,
        minViews: validatedRequest.minViews
      },
      meta: {
        source: "youtube",
        executionTime,
        quotaUsed,
        totalResults: videos.length
      },
      videos,
    };

    logger.info("Mining complete", { executionTime, quotaUsed, totalResults: videos.length });

    return new Response(
      JSON.stringify(responseBody),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorResponse = handleError(error);
    for (const [key, value] of Object.entries(corsHeaders)) {
      errorResponse.headers.set(key, value);
    }
    return errorResponse;
  }
});
