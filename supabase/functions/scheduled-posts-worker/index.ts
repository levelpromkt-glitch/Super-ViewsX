import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Triggered by a pg_cron job (see the migration), not by users or the frontend.
// Gated by CRON_SECRET so it can't be used to force-publish someone else's
// scheduled post early.
serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ success: false, message: 'Forbidden' }), { status: 403 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');
  const googleClientId = Deno.env.get('YOUTUBE_CLIENT_ID');
  const googleClientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');
  const instagramClientSecret = Deno.env.get('INSTAGRAM_CLIENT_SECRET');
  const GRAPH_VERSION = 'v26.0';
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const { data: duePosts, error } = await admin
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .limit(10);

  if (error) {
    console.error('Failed to load due posts', error);
    return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500 });
  }

  const results: Array<{ id: string; status: string }> = [];

  for (const post of duePosts || []) {
    // Claim it first so a second worker run can't double-publish.
    const { data: claimed } = await admin
      .from('scheduled_posts')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', post.id)
      .eq('status', 'pending')
      .select('id')
      .single();
    if (!claimed) continue;

    try {
      if (post.platform !== 'tiktok' && post.platform !== 'youtube' && post.platform !== 'instagram') {
        await admin.from('scheduled_posts').update({
          status: 'failed',
          error_message: `Plataforma ${post.platform} ainda não suportada.`,
          updated_at: new Date().toISOString(),
        }).eq('id', post.id);
        results.push({ id: post.id, status: 'failed' });
        continue;
      }

      // Older rows created before multi-account support may not have
      // account_id set — fall back to "the" account for this platform in
      // those cases, same as the old single-account behavior. New rows
      // always carry account_id.
      const accountQuery = admin.from('social_accounts').select('*').eq('user_id', post.user_id).eq('platform', post.platform);
      const { data: account } = post.account_id
        ? await accountQuery.eq('id', post.account_id).single()
        : await accountQuery.limit(1).maybeSingle();

      if (!account) {
        throw new Error(`Conta do ${post.platform} não está mais conectada.`);
      }

      let publishedId: string;

      if (post.platform === 'instagram') {
        // Instagram's container API fetches the video from a public URL
        // itself — no need to download bytes here, unlike TikTok/YouTube.
        let accessToken: string = account.access_token;
        const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
        if (instagramClientSecret && expiresAt < Date.now() + 7 * 24 * 60 * 60 * 1000) {
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

        const { data: signed, error: signError } = await admin.storage.from('post-videos').createSignedUrl(post.video_url, 3600);
        if (signError || !signed?.signedUrl) {
          throw new Error('Não foi possível acessar o vídeo salvo.');
        }

        const igUserId = account.platform_user_id;
        const createUrl = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/${igUserId}/media`);
        createUrl.searchParams.set('access_token', accessToken);
        const createResponse = await fetch(createUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_url: signed.signedUrl, media_type: 'REELS', caption: post.caption || '' }),
        });
        const createData = await createResponse.json().catch(() => null);
        if (!createResponse.ok || !createData?.id) {
          throw new Error(createData?.error?.message || 'O Instagram recusou o vídeo.');
        }
        const containerId: string = createData.id;

        let ready = false;
        for (let attempt = 0; attempt < 30; attempt++) {
          await sleep(3000);
          const statusUrl = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/${containerId}`);
          statusUrl.searchParams.set('fields', 'status_code');
          statusUrl.searchParams.set('access_token', accessToken);
          const statusResponse = await fetch(statusUrl.toString());
          const statusData = await statusResponse.json().catch(() => null);
          if (statusData?.status_code === 'FINISHED') {
            ready = true;
            break;
          }
          if (statusData?.status_code === 'ERROR' || statusData?.status_code === 'EXPIRED') {
            throw new Error('O Instagram não conseguiu processar o vídeo.');
          }
        }
        if (!ready) {
          throw new Error('O Instagram demorou demais para processar o vídeo.');
        }

        const publishUrl = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/${igUserId}/media_publish`);
        publishUrl.searchParams.set('access_token', accessToken);
        const publishResponse = await fetch(publishUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: containerId }),
        });
        const publishData = await publishResponse.json().catch(() => null);
        if (!publishResponse.ok || !publishData?.id) {
          throw new Error(publishData?.error?.message || 'Falha ao publicar no Instagram.');
        }
        publishedId = publishData.id;

        await admin.from('scheduled_posts').update({
          status: 'posted',
          platform_post_id: publishedId,
          updated_at: new Date().toISOString(),
        }).eq('id', post.id);
        results.push({ id: post.id, status: 'posted' });
        continue;
      }

      const { data: fileBlob, error: downloadError } = await admin.storage.from('post-videos').download(post.video_url);
      if (downloadError || !fileBlob) {
        throw new Error('Não foi possível ler o vídeo salvo.');
      }
      const videoBuffer = new Uint8Array(await fileBlob.arrayBuffer());
      const videoSize = videoBuffer.byteLength;

      if (post.platform === 'tiktok') {
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
          }
        }

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
          console.error('creator_info query failed', e);
        }

        const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            post_info: {
              title: post.caption || '',
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
          throw new Error(initData?.error?.message || 'O TikTok recusou o início da publicação.');
        }

        const uploadUrl: string = initData.data.upload_url;
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
          },
          body: videoBuffer,
        });
        if (!uploadResponse.ok) {
          throw new Error('Falha ao enviar o vídeo para o TikTok.');
        }
        publishedId = initData.data.publish_id;
      } else {
        // youtube
        let accessToken: string = account.access_token;
        const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
        if (googleClientId && googleClientSecret && expiresAt < Date.now() + 60_000) {
          const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: googleClientId,
              client_secret: googleClientSecret,
              grant_type: 'refresh_token',
              refresh_token: account.refresh_token || '',
            }),
          });
          const refreshData = await refreshResponse.json();
          if (refreshResponse.ok && refreshData.access_token) {
            accessToken = refreshData.access_token;
            await admin.from('social_accounts').update({
              access_token: refreshData.access_token,
              token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', account.id);
          }
        }

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
              snippet: { title: post.caption || 'Corte Super Views X', description: `${post.caption || ''}\n\n#Shorts` },
              status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
            }),
          }
        );
        const uploadUrl = initResponse.headers.get('Location');
        if (!initResponse.ok || !uploadUrl) {
          throw new Error('O YouTube recusou o início do upload.');
        }

        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(videoSize) },
          body: videoBuffer,
        });
        const uploadData = await uploadResponse.json().catch(() => null);
        if (!uploadResponse.ok || !uploadData?.id) {
          throw new Error('Falha ao enviar o vídeo para o YouTube.');
        }
        publishedId = uploadData.id;
      }

      await admin.from('scheduled_posts').update({
        status: 'posted',
        platform_post_id: publishedId,
        updated_at: new Date().toISOString(),
      }).eq('id', post.id);
      results.push({ id: post.id, status: 'posted' });
    } catch (err: any) {
      console.error('Failed to publish scheduled post', post.id, err);
      await admin.from('scheduled_posts').update({
        status: 'failed',
        error_message: err.message || 'Erro inesperado.',
        updated_at: new Date().toISOString(),
      }).eq('id', post.id);
      results.push({ id: post.id, status: 'failed' });
    }
  }

  return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
