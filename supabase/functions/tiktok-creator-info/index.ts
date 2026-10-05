import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Tells the Publicar form what this TikTok account allows (who can view,
// comments/duet/stitch switches, max video length) so the form never offers
// an option TikTok would reject.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, code: 'UNAUTHENTICATED', message: 'Não autenticado.' }, 401);

    const userClient = createClient(supabaseUrl, anonKey);
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !user) return json({ success: false, code: 'UNAUTHENTICATED', message: 'Sessão inválida.' }, 401);

    const body = await req.json().catch(() => ({}));
    const accountId: string | undefined = body?.accountId;
    if (!accountId) return json({ success: false, code: 'INVALID_REQUEST', message: 'accountId é obrigatório.' }, 400);

    const { data: account, error: accountError } = await admin
      .from('social_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .eq('platform', 'tiktok')
      .single();
    if (accountError || !account) {
      return json({ success: false, code: 'NOT_CONNECTED', message: 'Essa conta do TikTok não está mais conectada.' }, 400);
    }

    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');

    let accessToken: string = account.access_token;
    const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
    if (clientKey && clientSecret && expiresAt < Date.now() + 60_000) {
      const refreshResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: account.refresh_token || '',
        }),
      });
      const refreshData = await refreshResponse.json();
      if (refreshResponse.ok && refreshData.access_token) {
        accessToken = refreshData.access_token;
        await admin.from('social_accounts').update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token || account.refresh_token,
          token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', account.id);
      } else {
        console.error('TikTok token refresh failed', refreshData);
      }
    }

    const infoResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    });
    const infoData = await infoResponse.json().catch(() => null);
    if (!infoResponse.ok || infoData?.error?.code !== 'ok' || !infoData?.data) {
      console.error('TikTok creator_info failed', infoResponse.status, infoData);
      return json({
        success: false,
        code: 'TIKTOK_INFO_FAILED',
        message: infoData?.error?.message || 'Não foi possível consultar as opções da conta do TikTok.',
      }, 502);
    }

    const d = infoData.data;
    return json({
      success: true,
      info: {
        privacyOptions: Array.isArray(d.privacy_level_options) ? d.privacy_level_options : ['SELF_ONLY'],
        commentDisabled: d.comment_disabled === true,
        duetDisabled: d.duet_disabled === true,
        stitchDisabled: d.stitch_disabled === true,
        maxVideoDurationSec: typeof d.max_video_post_duration_sec === 'number' ? d.max_video_post_duration_sec : null,
      },
    });
  } catch (error: any) {
    console.error('tiktok-creator-info failed', error);
    return json({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }, 500);
  }
});
