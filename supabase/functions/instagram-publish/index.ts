import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_CAPTION_LENGTH = 2200;
const GRAPH_VERSION = "v26.0";
// Instagram processes the container asynchronously — poll status_code until
// FINISHED, capped so this stays well under the Edge Function's wall-clock
// limit even though most Reels finish processing in well under a minute.
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 30;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Accepts EITHER {videoId, start, end} (cuts via our clip pipeline, same as
// the "Publicar" button in Melhores Momentos) OR {storagePath} (a file
// already uploaded via the Publicar page) — mirrors youtube-publish, except
// Instagram's container API needs a public video URL, not raw bytes, so we
// never download the file ourselves.
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
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, code: 'UNAUTHENTICATED', message: 'Não autenticado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    const accountId: string | undefined = body?.accountId;
    const videoId: string | undefined = body?.videoId;
    const start: number | undefined = body?.start;
    const end: number | undefined = body?.end;
    const storagePath: string | undefined = body?.storagePath;
    const caption: string = String(body?.caption || '').slice(0, MAX_CAPTION_LENGTH);

    if (!accountId) {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_REQUEST', message: 'accountId é obrigatório — escolha qual conta do Instagram vai publicar.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const hasClipSource = videoId && typeof start === 'number' && typeof end === 'number' && end > start;
    const hasUploadSource = storagePath && storagePath.startsWith(`${user.id}/`);
    if (!hasClipSource && !hasUploadSource) {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_REQUEST', message: 'Origem do vídeo inválida.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: account, error: accountError } = await admin
      .from('social_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .eq('platform', 'instagram')
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ success: false, code: 'NOT_CONNECTED', message: 'Essa conta do Instagram não está mais conectada.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record the attempt up front so it always shows in history, even if it fails.
    const { data: postRow } = await admin
      .from('scheduled_posts')
      .insert({
        user_id: user.id,
        platform: 'instagram',
        account_id: accountId,
        video_url: hasUploadSource ? storagePath! : `${videoId}:${start}-${end}`,
        caption,
        scheduled_at: new Date().toISOString(),
        status: 'processing',
      })
      .select('id')
      .single();
    const postId = postRow?.id;
    const markResult = async (status: 'posted' | 'failed', extra: Record<string, unknown> = {}) => {
      if (!postId) return;
      await admin.from('scheduled_posts').update({ status, updated_at: new Date().toISOString(), ...extra }).eq('id', postId);
    };

    const clientSecret = Deno.env.get('INSTAGRAM_CLIENT_SECRET');

    // Instagram has no separate refresh_token — the current long-lived
    // access_token itself is exchanged for a fresh one. Do this proactively
    // if we're within a week of expiry (tokens last ~60 days).
    let accessToken: string = account.access_token;
    const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
    if (clientSecret && expiresAt < Date.now() + 7 * 24 * 60 * 60 * 1000) {
      const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
      refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
      refreshUrl.searchParams.set('access_token', accessToken);
      const refreshResponse = await fetch(refreshUrl.toString());
      const refreshData = await refreshResponse.json().catch(() => null);
      if (refreshResponse.ok && refreshData?.access_token) {
        accessToken = refreshData.access_token;
        await admin.from('social_accounts').update({
          access_token: refreshData.access_token,
          token_expires_at: new Date(Date.now() + (refreshData.expires_in || 60 * 24 * 60 * 60) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', account.id);
      } else {
        console.error('Instagram token refresh failed', refreshData);
      }
    }

    // 1. Get a publicly fetchable URL for the video — Instagram's servers
    // download it themselves, so a raw signed R2/Storage URL is enough.
    let videoUrl: string;
    if (hasUploadSource) {
      const { data: signed, error: signError } = await admin.storage
        .from('post-videos')
        .createSignedUrl(storagePath!, 3600);
      if (signError || !signed?.signedUrl) {
        await markResult('failed', { error_message: 'Não foi possível acessar o vídeo enviado.' });
        return new Response(
          JSON.stringify({ success: false, code: 'STORAGE_ERROR', message: 'Não foi possível acessar o vídeo enviado.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      videoUrl = signed.signedUrl;
    } else {
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
        await markResult('failed', { error_message: 'Não foi possível gerar o corte para publicar.' });
        return new Response(
          JSON.stringify({ success: false, code: 'CLIP_FAILED', message: 'Não foi possível gerar o corte para publicar.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const clipResult = await clipResponse.json().catch(() => null);
      if (!clipResult?.downloadUrl) {
        console.error('clip-service returned no downloadUrl', clipResult);
        await markResult('failed', { error_message: 'Não foi possível gerar o corte para publicar.' });
        return new Response(
          JSON.stringify({ success: false, code: 'CLIP_FAILED', message: 'Não foi possível gerar o corte para publicar.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      videoUrl = clipResult.downloadUrl;
    }

    const igUserId = account.platform_user_id;

    // 2. Create the media container (Reels is the only video post type the
    // Instagram Login API publishes organically).
    const createUrl = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/${igUserId}/media`);
    createUrl.searchParams.set('access_token', accessToken);
    const createResponse = await fetch(createUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: videoUrl, media_type: 'REELS', caption }),
    });
    const createData = await createResponse.json().catch(() => null);
    if (!createResponse.ok || !createData?.id) {
      console.error('Instagram media create failed', createResponse.status, createData);
      await markResult('failed', { error_message: createData?.error?.message || 'O Instagram recusou o vídeo.' });
      return new Response(
        JSON.stringify({ success: false, code: 'CONTAINER_FAILED', message: createData?.error?.message || 'O Instagram recusou o vídeo.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const containerId: string = createData.id;

    // 3. Poll until Instagram finishes downloading/processing the video.
    let ready = false;
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      const statusUrl = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/${containerId}`);
      statusUrl.searchParams.set('fields', 'status_code');
      statusUrl.searchParams.set('access_token', accessToken);
      const statusResponse = await fetch(statusUrl.toString());
      const statusData = await statusResponse.json().catch(() => null);
      const statusCode = statusData?.status_code;
      if (statusCode === 'FINISHED') {
        ready = true;
        break;
      }
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        console.error('Instagram container failed', statusData);
        await markResult('failed', { error_message: 'O Instagram não conseguiu processar o vídeo.' });
        return new Response(
          JSON.stringify({ success: false, code: 'CONTAINER_FAILED', message: 'O Instagram não conseguiu processar o vídeo.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!ready) {
      // The container survives on Instagram's side — this just means
      // processing took longer than we waited here.
      await markResult('failed', { error_message: 'O Instagram está demorando para processar o vídeo. Tente publicar de novo em alguns minutos.' });
      return new Response(
        JSON.stringify({ success: false, code: 'STILL_PROCESSING', message: 'O Instagram está demorando para processar o vídeo. Tente publicar de novo em alguns minutos.' }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Publish the finished container.
    const publishUrl = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/${igUserId}/media_publish`);
    publishUrl.searchParams.set('access_token', accessToken);
    const publishResponse = await fetch(publishUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerId }),
    });
    const publishData = await publishResponse.json().catch(() => null);
    if (!publishResponse.ok || !publishData?.id) {
      console.error('Instagram publish failed', publishResponse.status, publishData);
      await markResult('failed', { error_message: publishData?.error?.message || 'Falha ao publicar no Instagram.' });
      return new Response(
        JSON.stringify({ success: false, code: 'PUBLISH_FAILED', message: publishData?.error?.message || 'Falha ao publicar no Instagram.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await markResult('posted', { platform_post_id: publishData.id });

    return new Response(
      JSON.stringify({ success: true, mediaId: publishData.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('instagram-publish failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
