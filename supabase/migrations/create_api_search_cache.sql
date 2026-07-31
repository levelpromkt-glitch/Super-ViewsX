-- SQL Migration: Create api_search_cache table for caching viral engine responses

CREATE TABLE IF NOT EXISTS public.api_search_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key text UNIQUE NOT NULL,
  platform text NOT NULL,
  query text NOT NULL,
  period text NOT NULL,
  min_views integer NOT NULL,
  response jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Index for faster lookup by cache_key
CREATE INDEX IF NOT EXISTS api_search_cache_key_idx ON public.api_search_cache (cache_key);

-- Policy to allow the service role (edge function) to manage the cache
-- (Assuming RLS is enabled, or if disabled, this is just good practice)
ALTER TABLE public.api_search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.api_search_cache
  FOR SELECT USING (true);

-- Usually the service role bypasses RLS, so insert/upsert will work automatically.
