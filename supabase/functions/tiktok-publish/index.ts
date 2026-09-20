import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_CAPTION_LENGTH = 150;

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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, code: 'UNAUTHENTICATED', message: 'Sessão inválida.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const videoId: string = body?.videoId;
    const start: number = body?.start;
    const end: number = body?.end;
    const caption: string = String(body?.caption || '').slice(0, MAX_CAPTION_LENGTH);

    if (!videoId || typeof start !== 'number' || typeof end !== 'number' || end <= start) {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_REQUEST', message: 'videoId, start e end são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: account, error: accountError } = await admin
      .from('social_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('platform', 'tiktok')
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ success: false, code: 'NOT_CONNECTED', message: 'Conecte sua conta do TikTok antes de publicar.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');

    let accessToken: string = account.access_token;

    // Refresh the token if it's expired or about to expire.
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

    // 1. Get the rendered clip from our own clip pipeline.
    const clipServiceUrl = Deno.env.get('CLIP_SERVICE_URL');
    const clipServiceApiKey = Deno.env.get('CLIP_SERVICE_API_KEY');
    if (!clipServiceUrl) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_CONFIG', message: 'CLIP_SERVICE_URL não configurada.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clipResponse = await fetch(`${clipServiceUrl.replace(/\/$/, '')}/clip`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(clipServiceApiKey ? { 'x-api-key': clipServiceApiKey } : {}),
      },
      body: JSON.stringify({ videoId, start, end }),
    });

    if (!clipResponse.ok) {
      const errText = await clipResponse.text();
      console.error('clip-service error', clipResponse.status, errText);
      return new Response(
        JSON.stringify({ success: false, code: 'CLIP_FAILED', message: 'Não foi possível gerar o corte para publicar.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const videoBuffer = new Uint8Array(await clipResponse.arrayBuffer());
    const videoSize = videoBuffer.byteLength;

    // 2. Ask TikTok what privacy levels this creator's account allows.
    let privacyLevel = 'SELF_ONLY';
    try {
      const creatorInfoResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      const creatorInfo = await creatorInfoResponse.json();
      const options: string[] = creatorInfo?.data?.privacy_level_options || [];
      if (options.length > 0 && !options.includes(privacyLevel)) {
        privacyLevel = options[0];
      }
    } catch (e) {
      console.error('TikTok creator_info query failed', e);
    }

    // 3. Initialize the post (direct post, single-chunk file upload).
    const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_info: {
          title: caption,
          privacy_level: privacyLevel,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1,
        },
      }),
    });

    const initData = await initResponse.json();
    if (!initResponse.ok || initData.error?.code !== 'ok') {
      console.error('TikTok publish init error', initResponse.status, initData);
      return new Response(
        JSON.stringify({ success: false, code: 'TIKTOK_INIT_FAILED', message: initData?.error?.message || 'O TikTok recusou o início da publicação.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const publishId: string = initData.data.publish_id;
    const uploadUrl: string = initData.data.upload_url;

    // 4. Upload the video bytes.
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
      },
      body: videoBuffer,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.error('TikTok video upload failed', uploadResponse.status, errText);
      return new Response(
        JSON.stringify({ success: false, code: 'UPLOAD_FAILED', message: 'Falha ao enviar o vídeo para o TikTok.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, publishId, privacyLevel }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('tiktok-publish failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
