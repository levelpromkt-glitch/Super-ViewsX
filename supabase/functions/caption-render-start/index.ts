import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Only spawns the render on Modal and records the job — Modal renders can
// take longer than this function's wall-clock budget, so we never wait here.
// The VM's poll loop (pollCaptionJobs in server.js) checks Modal and copies
// the finished file into our own R2; the client polls the caption_jobs row.
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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const sourceVideoUrl: string = body?.sourceVideoUrl;
    const words: unknown = body?.words;
    const durationSec: number = body?.durationSec;
    const accentColor: string | undefined = body?.accentColor;
    const logoUrl: string | undefined = body?.logoUrl;
    const template: string = body?.template || 'karaoke-yellow';

    if (!sourceVideoUrl || !Array.isArray(words) || typeof durationSec !== 'number' || durationSec <= 0) {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_REQUEST', message: 'sourceVideoUrl, words e durationSec são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const modalUrl = Deno.env.get('MODAL_RENDER_URL');
    const modalKey = Deno.env.get('RENDER_API_KEY');
    if (!modalUrl || !modalKey) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_CONFIG', message: 'MODAL_RENDER_URL/RENDER_API_KEY não configuradas no projeto Supabase.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const modalResponse = await fetch(`${modalUrl.replace(/\/$/, '')}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Render-Key': modalKey },
      body: JSON.stringify({
        composition: template,
        variables: {
          sourceVideo: sourceVideoUrl,
          transcriptJson: JSON.stringify(words),
          durationSec,
          ...(accentColor ? { accentColor } : {}),
          ...(logoUrl ? { logoUrl } : {}),
        },
      }),
    });

    if (!modalResponse.ok) {
      const errText = await modalResponse.text();
      console.error('Modal render spawn failed', modalResponse.status, errText);
      return new Response(
        JSON.stringify({ success: false, code: 'RENDER_SPAWN_FAILED', message: 'Não foi possível iniciar a renderização.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { call_id } = await modalResponse.json();

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: jobRow, error: insertError } = await admin
      .from('caption_jobs')
      .insert({ user_id: user.id, modal_call_id: call_id, status: 'processing' })
      .select('id')
      .single();

    if (insertError || !jobRow) {
      console.error('Failed to record caption job', insertError);
      return new Response(
        JSON.stringify({ success: false, code: 'STORE_FAILED', message: 'Erro ao registrar o job de renderização.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, jobId: jobRow.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('caption-render-start failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
