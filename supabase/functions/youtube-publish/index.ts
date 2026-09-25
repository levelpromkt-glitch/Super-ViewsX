import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TITLE_LENGTH = 100;

// Accepts EITHER {videoId, start, end} (cuts via our clip-video pipeline,
// same as the "Publicar no TikTok" button in Melhores Momentos) OR
// {storagePath} (a file already uploaded via the Publicar page) — mirrors
// tiktok-publish + tiktok-publish-upload combined into one function, since
// YouTube's upload step is the same either way.
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
    const title: string = String(body?.caption || 'Corte Super Views X').slice(0, MAX_TITLE_LENGTH);

    if (!accountId) {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_REQUEST', message: 'accountId é obrigatório — escolha qual canal do YouTube vai publicar.' }),
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
      .eq('platform', 'youtube')
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ success: false, code: 'NOT_CONNECTED', message: 'Esse canal do YouTube não está mais conectado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record the attempt up front so it always shows in history, even if it fails.
    const { data: postRow } = await admin
      .from('scheduled_posts')
      .insert({
        user_id: user.id,
        platform: 'youtube',
        account_id: accountId,
        video_url: hasUploadSource ? storagePath! : `${videoId}:${start}-${end}`,
        caption: title,
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

    const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
    const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');

    let accessToken: string = account.access_token;
    const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
    if (clientId && clientSecret && expiresAt < Date.now() + 60_000) {
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: account.refresh_token || '',
        }),
      });
      const refreshData = await refreshResponse.json();
      // Google never rotates the refresh_token on refresh — only access_token changes.
      if (refreshResponse.ok && refreshData.access_token) {
        accessToken = refreshData.access_token;
        await admin.from('social_accounts').update({
          access_token: refreshData.access_token,
          token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', account.id);
      } else {
        console.error('YouTube token refresh failed', refreshData);
      }
    }

    // 1. Get the video bytes, from whichever source was given.
    let videoBuffer: Uint8Array;
    if (hasUploadSource) {
      const { data: fileBlob, error: downloadError } = await admin.storage.from('post-videos').download(storagePath!);
      if (downloadError || !fileBlob) {
        await markResult('failed', { error_message: 'Não foi possível ler o vídeo enviado.' });
        return new Response(
          JSON.stringify({ success: false, code: 'DOWNLOAD_FAILED', message: 'Não foi possível ler o vídeo enviado.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      videoBuffer = new Uint8Array(await fileBlob.arrayBuffer());
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
      // The VM's /clip endpoint uploads the finished clip to R2 and responds
      // with {success, downloadUrl} JSON, not raw video bytes.
      const clipResult = await clipResponse.json().catch(() => null);
      if (!clipResult?.downloadUrl) {
        console.error('clip-service returned no downloadUrl', clipResult);
        await markResult('failed', { error_message: 'Não foi possível gerar o corte para publicar.' });
        return new Response(
          JSON.stringify({ success: false, code: 'CLIP_FAILED', message: 'Não foi possível gerar o corte para publicar.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const videoFileResponse = await fetch(clipResult.downloadUrl);
      if (!videoFileResponse.ok) {
        await markResult('failed', { error_message: 'Não foi possível baixar o corte gerado.' });
        return new Response(
          JSON.stringify({ success: false, code: 'CLIP_FAILED', message: 'Não foi possível baixar o corte gerado.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      videoBuffer = new Uint8Array(await videoFileResponse.arrayBuffer());
    }
    const videoSize = videoBuffer.byteLength;

    // 2. Start a resumable upload session.
    const initResponse = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': String(videoSize),
        },
        body: JSON.stringify({
          snippet: { title, description: `${title}\n\n#Shorts` },
          // "private" by default — safe while the Google OAuth app is in
          // Testing status. Change once ready to actually publish publicly.
          status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
        }),
      }
    );

    const uploadUrl = initResponse.headers.get('Location');
    if (!initResponse.ok || !uploadUrl) {
      const errText = await initResponse.text();
      console.error('YouTube resumable init error', initResponse.status, errText);
      await markResult('failed', { error_message: 'O YouTube recusou o início do upload.' });
      return new Response(
        JSON.stringify({ success: false, code: 'YOUTUBE_INIT_FAILED', message: 'O YouTube recusou o início do upload.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Upload the video bytes.
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoSize),
      },
      body: videoBuffer,
    });

    const uploadData = await uploadResponse.json().catch(() => null);
    if (!uploadResponse.ok || !uploadData?.id) {
      console.error('YouTube video upload failed', uploadResponse.status, uploadData);
      await markResult('failed', { error_message: 'Falha ao enviar o vídeo para o YouTube.' });
      return new Response(
        JSON.stringify({ success: false, code: 'UPLOAD_FAILED', message: 'Falha ao enviar o vídeo para o YouTube.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await markResult('posted', { platform_post_id: uploadData.id });

    return new Response(
      JSON.stringify({ success: true, videoId: uploadData.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('youtube-publish failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
