import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const YOUTUBE_REDIRECT_URI = "https://www.superviewsx.com.br/dashboard/configuracoes/youtube/callback";

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
        JSON.stringify({ success: false, code: 'MISSING_PARAMS', message: 'Parâmetros de retorno do Google ausentes.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: stateRow, error: stateError } = await supabase
      .from('social_oauth_states')
      .select('user_id')
      .eq('state', state)
      .eq('platform', 'youtube')
      .single();

    if (stateError || !stateRow) {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_STATE', message: 'Sessão de conexão expirada ou inválida. Tente conectar de novo.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabase.from('social_oauth_states').delete().eq('state', state);

    const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
    const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_CONFIG', message: 'YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET não configuradas no projeto Supabase.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: YOUTUBE_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      console.error('Google token exchange error', tokenResponse.status, tokenData);
      return new Response(
        JSON.stringify({ success: false, code: 'TOKEN_EXCHANGE_FAILED', message: 'O Google recusou a autorização. Tente novamente.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { access_token, refresh_token, expires_in, scope } = tokenData;

    // Fetch the channel this token belongs to.
    const channelResponse = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const channelData = await channelResponse.json();
    const channel = channelData?.items?.[0];

    if (!channel) {
      console.error('No YouTube channel found for this account', channelData);
      return new Response(
        JSON.stringify({ success: false, code: 'NO_CHANNEL', message: 'Essa conta do Google não tem um canal do YouTube.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const channelId: string = channel.id;
    const channelTitle: string = channel.snippet?.title || channelId;

    // Multiple YouTube channels per user are allowed — conflict key is the
    // actual channel (user_id, platform, platform_user_id), same pattern as
    // TikTok. Google only returns refresh_token reliably on first consent
    // (we force prompt=consent so it always comes back here, but keep the
    // old one as a fallback just in case).
    const { data: existing } = await supabase
      .from('social_accounts')
      .select('label, refresh_token')
      .eq('user_id', stateRow.user_id)
      .eq('platform', 'youtube')
      .eq('platform_user_id', channelId)
      .maybeSingle();

    const { error: upsertError } = await supabase.from('social_accounts').upsert({
      user_id: stateRow.user_id,
      platform: 'youtube',
      platform_user_id: channelId,
      platform_username: channelTitle,
      label: existing?.label || channelTitle,
      access_token,
      refresh_token: refresh_token || existing?.refresh_token,
      token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      scope,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform,platform_user_id' });

    if (upsertError) {
      console.error('Failed to store YouTube tokens', upsertError);
      return new Response(
        JSON.stringify({ success: false, code: 'STORE_FAILED', message: 'Erro ao salvar a conexão.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, platformUsername: channelTitle }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('youtube-oauth-callback failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
