import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cuts OUT one or more ranges from an already-loaded Editor video and joins
// what's left — the "remove a piece from the middle" feature. Unlike
// clip-video (which resolves a storagePath/r2Key/videoId into a source URL
// itself), this takes the sourceUrl the Editor is already playing directly,
// since by the time something is open in the Editor it's always already a
// resolved, playable URL regardless of where it originally came from.
//
// Requires auth (any signed-in user) and restricts sourceUrl to our own R2
// endpoint, so this can't be turned into an open fetch-anything proxy.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, code: 'UNAUTHENTICATED', message: 'Não autenticado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey);
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, code: 'UNAUTHENTICATED', message: 'Sessão inválida.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const sourceUrl: string | undefined = body?.sourceUrl;
    const segments = body?.segments;
    const vertical = body?.vertical === true;

    const r2Endpoint = Deno.env.get('R2_ENDPOINT') || '';
    if (typeof sourceUrl !== 'string' || !sourceUrl.startsWith('http') || (r2Endpoint && !sourceUrl.startsWith(r2Endpoint))) {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_REQUEST', message: 'sourceUrl inválida.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!Array.isArray(segments) || segments.length === 0) {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_REQUEST', message: 'segments é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceUrl = Deno.env.get('CLIP_SERVICE_URL');
    const serviceApiKey = Deno.env.get('CLIP_SERVICE_API_KEY');
    if (!serviceUrl) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_CONFIG', message: 'CLIP_SERVICE_URL não configurada.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clipResponse = await fetch(`${serviceUrl.replace(/\/$/, '')}/clip`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(serviceApiKey ? { 'x-api-key': serviceApiKey } : {}),
      },
      body: JSON.stringify({ sourceUrl, segments, vertical }),
    });

    if (!clipResponse.ok) {
      const errBody = await clipResponse.text();
      console.error('clip-service error', clipResponse.status, errBody);
      let message = 'Não foi possível cortar o vídeo.';
      try {
        const parsed = JSON.parse(errBody);
        if (parsed?.message) message = parsed.message;
      } catch {
        // ignore parse errors, use default message
      }
      return new Response(
        JSON.stringify({ success: false, code: 'CLIP_SERVICE_ERROR', message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clipResult = await clipResponse.json().catch(() => null);
    if (!clipResult?.downloadUrl) {
      console.error('clip-service returned no downloadUrl', clipResult);
      return new Response(
        JSON.stringify({ success: false, code: 'CLIP_SERVICE_ERROR', message: clipResult?.message || 'Não foi possível cortar o vídeo.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, downloadUrl: clipResult.downloadUrl, filename: clipResult.filename }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('clip-segments failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
