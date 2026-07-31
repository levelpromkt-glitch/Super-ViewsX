import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleError } from "./utils/errorHandler.ts";
import { logger } from "./utils/logger.ts";
import { parsePeriodToISO } from "./utils/date.ts";
import { parseQuery } from "./parsers/queryParser.ts";
import { validateSearchRequest } from "./validators/requestValidator.ts";
import { providerFactory } from "./providers/providerFactory.ts";
import { cacheService } from "./services/cacheService.ts";

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
    const parsedQuery = parseQuery(validatedRequest.query, validatedRequest.platform);
    const publishedAfter = parsePeriodToISO(validatedRequest.period);

    logger.info("Starting viral mining", { query: parsedQuery, period: validatedRequest.period });

    // 3. Cache Check
    const cachedData = await cacheService.get(
      validatedRequest.platform,
      parsedQuery,
      validatedRequest.period,
      validatedRequest.minViews,
      validatedRequest.cursor
    );

    if (cachedData) {
      logger.info("Cache hit", { query: parsedQuery, platform: validatedRequest.platform });
      return new Response(
        JSON.stringify({
          success: true,
          search: {
            type: "hashtag",
            query: validatedRequest.query,
            parsedQuery,
            period: validatedRequest.period,
            minViews: validatedRequest.minViews
          },
          meta: {
            ...cachedData.meta,
            executionTime: Date.now() - startTime,
            cached: true,
            totalResults: cachedData.videos.length
          },
          videos: cachedData.videos,
          nextCursor: cachedData.nextCursor,
          status: cachedData.status || "ready"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Service Orchestration via Factory
    const provider = providerFactory.getProvider(validatedRequest.platform);
    const providerResponse = await provider.searchByHashtag(
      parsedQuery,
      publishedAfter,
      validatedRequest.maxResults,
      validatedRequest.minViews,
      validatedRequest.cursor
    );

    const executionTime = Date.now() - startTime;

    // 5. Build Context-Rich Response
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
        ...(providerResponse.meta || {}),
        source: validatedRequest.platform,
        executionTime,
        quotaUsed: providerResponse.quotaUsed,
        totalResults: providerResponse.videos.length,
        cached: false
      },
      videos: providerResponse.videos,
      nextCursor: providerResponse.nextCursor,
      status: providerResponse.status || "ready"
    };

    // 6. Save to Cache
    await cacheService.set(
      validatedRequest.platform,
      parsedQuery,
      validatedRequest.period,
      validatedRequest.minViews,
      providerResponse,
      validatedRequest.cursor
    );

    logger.info("Mining complete", { executionTime, platform: validatedRequest.platform, totalResults: providerResponse.videos.length });

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
