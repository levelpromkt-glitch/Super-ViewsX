import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INSTAGRAM_REDIRECT_URI = "https://www.superviewsx.com.br/dashboard/configuracoes/instagram/callback";
const GRAPH_VERSION = "v26.0";

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
        JSON.stringify({ success: false, code: 'MISSING_PARAMS', message: 'Parâmetros de retorno do Instagram ausentes.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: stateRow, error: stateError } = await supabase
      .from('social_oauth_states')
      .select('user_id')
      .eq('state', state)
      .eq('platform', 'instagram')
      .single();

    if (stateError || !stateRow) {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_STATE', message: 'Sessão de conexão expirada ou inválida. Tente conectar de novo.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabase.from('social_oauth_states').delete().eq('state', state);

    const clientId = Deno.env.get('INSTAGRAM_CLIENT_ID');
    const clientSecret = Deno.env.get('INSTAGRAM_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_CONFIG', message: 'INSTAGRAM_CLIENT_ID/INSTAGRAM_CLIENT_SECRET não configuradas no projeto Supabase.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Exchange the authorization code for a short-lived access token.
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: INSTAGRAM_REDIRECT_URI,
        code,
      }),
    });
    const tokenData = await tokenResponse.json().catch(() => null);
    // The Instagram Login token endpoint wraps the result in a `data` array.
    const shortLived = tokenData?.data?.[0] || tokenData;

    if (!tokenResponse.ok || !shortLived?.access_token) {
      console.error('Instagram token exchange error', tokenResponse.status, tokenData);
      return new Response(
        JSON.stringify({ success: false, code: 'TOKEN_EXCHANGE_FAILED', message: 'O Instagram recusou a autorização. Tente novamente.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Exchange the short-lived token for a long-lived one (60 days).
    const exchangeUrl = new URL('https://graph.instagram.com/access_token');
    exchangeUrl.searchParams.set('grant_type', 'ig_exchange_token');
    exchangeUrl.searchParams.set('client_secret', clientSecret);
    exchangeUrl.searchParams.set('access_token', shortLived.access_token);
    const longLivedResponse = await fetch(exchangeUrl.toString());
    const longLivedData = await longLivedResponse.json().catch(() => null);

    if (!longLivedResponse.ok || !longLivedData?.access_token) {
      console.error('Instagram long-lived exchange error', longLivedResponse.status, longLivedData);
      return new Response(
        JSON.stringify({ success: false, code: 'TOKEN_EXCHANGE_FAILED', message: 'Não foi possível gerar um token de longa duração do Instagram.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken: string = longLivedData.access_token;
    const expiresIn: number = longLivedData.expires_in || 60 * 24 * 60 * 60; // ~60 days fallback

    // 3. Fetch the connected account's own profile (id + username).
    const profileUrl = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/me`);
    profileUrl.searchParams.set('fields', 'id,username');
    profileUrl.searchParams.set('access_token', accessToken);
    const profileResponse = await fetch(profileUrl.toString());
    const profile = await profileResponse.json().catch(() => null);

    if (!profileResponse.ok || !profile?.id) {
      console.error('Instagram profile fetch failed', profileResponse.status, profile);
      return new Response(
        JSON.stringify({ success: false, code: 'PROFILE_FAILED', message: 'Não foi possível obter os dados da conta do Instagram.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const igUserId: string = profile.id;
    const username: string = profile.username || igUserId;

    // Multiple Instagram accounts per user allowed — conflict key is the
    // actual IG account (user_id, platform, platform_user_id), same pattern
    // as TikTok/YouTube. Instagram has no separate refresh_token: the
    // long-lived access_token itself is what gets refreshed before expiry.
    const { data: existing } = await supabase
      .from('social_accounts')
      .select('label')
      .eq('user_id', stateRow.user_id)
      .eq('platform', 'instagram')
      .eq('platform_user_id', igUserId)
      .maybeSingle();

    const { error: upsertError } = await supabase.from('social_accounts').upsert({
      user_id: stateRow.user_id,
      platform: 'instagram',
      platform_user_id: igUserId,
      platform_username: username,
      label: existing?.label || username,
      access_token: accessToken,
      refresh_token: null,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      scope: 'instagram_business_basic,instagram_business_content_publish',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform,platform_user_id' });

    if (upsertError) {
      console.error('Failed to store Instagram tokens', upsertError);
      return new Response(
        JSON.stringify({ success: false, code: 'STORE_FAILED', message: 'Erro ao salvar a conexão.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, platformUsername: username }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('instagram-oauth-callback failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
