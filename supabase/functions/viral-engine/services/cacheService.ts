import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ProviderResponse } from "../types/provider.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Hash function to create a cache key
const generateCacheKey = async (text: string) => {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const cacheService = {
  get: async (platform: string, query: string, period: string, minViews: number, cursor?: string): Promise<ProviderResponse | null> => {
    try {
      const keyString = `v4-${platform}-${query}-${period}-${minViews}-${cursor || 'page1'}`;
      const cacheKey = await generateCacheKey(keyString);
      
      const { data, error } = await supabase
        .from('api_search_cache')
        .select('response, created_at')
        .eq('cache_key', cacheKey)
        .single();
        
      if (error || !data) return null;
      
      // Check expiration (e.g., 2 hours cache)
      const createdAt = new Date(data.created_at).getTime();
      const now = Date.now();
      const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
      
      if (hoursDiff > 2) {
        return null; // Expired
      }
      
      return data.response as ProviderResponse;
    } catch (e) {
      return null;
    }
  },
  
  set: async (platform: string, query: string, period: string, minViews: number, response: ProviderResponse, cursor?: string) => {
    try {
      const keyString = `v4-${platform}-${query}-${period}-${minViews}-${cursor || 'page1'}`;
      const cacheKey = await generateCacheKey(keyString);
      
      await supabase
        .from('api_search_cache')
        .upsert({
          cache_key: cacheKey,
          platform,
          query,
          period,
          min_views: minViews,
          response,
          updated_at: new Date().toISOString()
        }, { onConflict: 'cache_key' });
    } catch (e) {
      console.error("Cache set error:", e);
    }
  }
};
