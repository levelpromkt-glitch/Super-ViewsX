import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIKTOK_REDIRECT_URI = "https://www.superviewsx.com.br/dashboard/configuracoes/tiktok/callback";

// Called by the frontend callback page (not directly by TikTok) with the
// {code, state} query params it received. Keeping this a JSON API instead of
// doing the HTTP redirect ourselves means the redirect_uri TikTok verifies
// stays on our own domain, not on supabase.co.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const code: string | undefined = body?.code;
    const state: string | undefined = body?.state;

    if (!code || !state) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_PARAMS', message: 'Parâmetros de retorno do TikTok ausentes.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: stateRow, error: stateError } = await supabase
      .from('social_oauth_states')
      .select('user_id')
      .eq('state', state)
      .eq('platform', 'tiktok')
      .single();

    if (stateError || !stateRow) {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_STATE', message: 'Sessão de conexão expirada ou inválida. Tente conectar de novo.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabase.from('social_oauth_states').delete().eq('state', state);

    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');
    if (!clientKey || !clientSecret) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_CONFIG', message: 'TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET não configuradas no projeto Supabase.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: TIKTOK_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      console.error('TikTok token exchange error', tokenResponse.status, tokenData);
      return new Response(
        JSON.stringify({ success: false, code: 'TOKEN_EXCHANGE_FAILED', message: 'O TikTok recusou a autorização. Tente novamente.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { access_token, refresh_token, expires_in, open_id, scope } = tokenData;

    let displayName: string = open_id;
    try {
      const infoResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const infoData = await infoResponse.json();
      displayName = infoData?.data?.user?.display_name || open_id;
    } catch (e) {
      console.error('TikTok user info fetch failed', e);
    }

    const { error: upsertError } = await supabase.from('social_accounts').upsert({
      user_id: stateRow.user_id,
      platform: 'tiktok',
      platform_user_id: open_id,
      platform_username: displayName,
      access_token,
      refresh_token,
      token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      scope,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform' });

    if (upsertError) {
      console.error('Failed to store TikTok tokens', upsertError);
      return new Response(
        JSON.stringify({ success: false, code: 'STORE_FAILED', message: 'Erro ao salvar a conexão.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, platformUsername: displayName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('tiktok-oauth-callback failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
