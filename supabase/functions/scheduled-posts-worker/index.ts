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
      if (post.platform !== 'tiktok') {
        await admin.from('scheduled_posts').update({
          status: 'failed',
          error_message: `Plataforma ${post.platform} ainda não suportada.`,
          updated_at: new Date().toISOString(),
        }).eq('id', post.id);
        results.push({ id: post.id, status: 'failed' });
        continue;
      }

      const { data: account } = await admin
        .from('social_accounts')
        .select('*')
        .eq('user_id', post.user_id)
        .eq('platform', 'tiktok')
        .single();

      if (!account) {
        throw new Error('Conta do TikTok não está mais conectada.');
      }

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

      const { data: fileBlob, error: downloadError } = await admin.storage.from('post-videos').download(post.video_url);
      if (downloadError || !fileBlob) {
        throw new Error('Não foi possível ler o vídeo salvo.');
      }
      const videoBuffer = new Uint8Array(await fileBlob.arrayBuffer());
      const videoSize = videoBuffer.byteLength;

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

      const publishId: string = initData.data.publish_id;
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

      await admin.from('scheduled_posts').update({
        status: 'posted',
        platform_post_id: publishId,
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
