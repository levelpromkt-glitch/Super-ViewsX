import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { videoId, start, end, vertical } = body || {};

    if (typeof videoId !== 'string' || typeof start !== 'number' || typeof end !== 'number') {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_REQUEST', message: 'videoId, start e end são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceUrl = Deno.env.get('CLIP_SERVICE_URL');
    const serviceApiKey = Deno.env.get('CLIP_SERVICE_API_KEY');

    if (!serviceUrl) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_CONFIG', message: 'CLIP_SERVICE_URL não configurada no projeto Supabase.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clipResponse = await fetch(`${serviceUrl.replace(/\/$/, '')}/clip`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(serviceApiKey ? { 'x-api-key': serviceApiKey } : {}),
      },
      body: JSON.stringify({ videoId, start, end, vertical: vertical === true }),
    });

    if (!clipResponse.ok) {
      const errBody = await clipResponse.text();
      console.error('clip-service error', clipResponse.status, errBody);
      let message = 'Não foi possível gerar o corte do vídeo.';
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

    return new Response(clipResponse.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': clipResponse.headers.get('content-type') || 'video/mp4',
        'Content-Disposition': clipResponse.headers.get('content-disposition') || 'attachment; filename="clip.mp4"',
      },
    });
  } catch (error: any) {
    console.error('clip-video failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
