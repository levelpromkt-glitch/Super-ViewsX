import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const POSTS_PER_ACCOUNT = 25;

type FetchedPost = {
  externalId: string;
  title: string;
  views: number;
  url: string | null;
  publishedAt: string; // ISO
};

// Does the actual per-platform API calls and upserts results into
// social_posts — the slow, rate-limited part. Runs on a cron schedule (every
// 30 min, all accounts) and can also be called by an authenticated user to
// refresh just their own accounts on demand. The dashboard itself never
// calls out to these platform APIs directly — it only reads the cached table
// (see the `social-performance` function), which is why the page loads fast.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const cronSecret = Deno.env.get('CRON_SECRET');
  const isCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;

  let scopedUserId: string | null = null;
  if (!isCron) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: 'Não autenticado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userClient = createClient(supabaseUrl, anonKey);
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: 'Sessão inválida.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    scopedUserId = user.id;
  }

  try {
    let accountsQuery = admin.from('social_accounts').select('*');
    if (scopedUserId) accountsQuery = accountsQuery.eq('user_id', scopedUserId);
    const { data: accounts } = await accountsQuery;

    const googleClientId = Deno.env.get('YOUTUBE_CLIENT_ID');
    const googleClientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');
    const tiktokClientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
    const tiktokClientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');
    const instagramClientSecret = Deno.env.get('INSTAGRAM_CLIENT_SECRET');

    let syncedAccounts = 0;
    let syncedPosts = 0;
    const accountErrors: Array<{ accountId: string; platform: string; label: string; message: string }> = [];

    for (const account of accounts || []) {
      const label = account.label || account.platform_username || account.platform;
      const posts: FetchedPost[] = [];
      try {
        if (account.platform === 'youtube') {
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

          const channelResponse = await fetch(
            'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const channelData = await channelResponse.json();
          const uploadsPlaylistId = channelData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
          if (!channelResponse.ok || !uploadsPlaylistId) {
            throw new Error(channelData?.error?.message || 'Não foi possível ler o canal.');
          }

          const playlistResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${POSTS_PER_ACCOUNT}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const playlistData = await playlistResponse.json();
          const videoIds: string[] = (playlistData?.items || [])
            .map((item: any) => item?.snippet?.resourceId?.videoId)
            .filter(Boolean);

          if (videoIds.length > 0) {
            const statsResponse = await fetch(
              `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(',')}`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const statsData = await statsResponse.json();
            for (const video of statsData?.items || []) {
              posts.push({
                externalId: video.id,
                title: video?.snippet?.title || 'Vídeo do YouTube',
                views: Number(video?.statistics?.viewCount || 0),
                url: `https://youtube.com/watch?v=${video.id}`,
                publishedAt: video?.snippet?.publishedAt || new Date().toISOString(),
              });
            }
          }
        } else if (account.platform === 'tiktok') {
          let accessToken: string = account.access_token;
          const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
          if (tiktokClientKey && tiktokClientSecret && expiresAt < Date.now() + 60_000) {
            const refreshResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
              body: new URLSearchParams({
                client_key: tiktokClientKey,
                client_secret: tiktokClientSecret,
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

          const listResponse = await fetch(
            'https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,share_url,view_count',
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ max_count: Math.min(POSTS_PER_ACCOUNT, 20) }),
            }
          );
          const listData = await listResponse.json();
          if (!listResponse.ok || listData.error?.code !== 'ok') {
            throw new Error(listData?.error?.message || 'A conta do TikTok precisa ser reconectada (permissão video.list).');
          }
          for (const video of listData?.data?.videos || []) {
            posts.push({
              externalId: String(video.id),
              title: video.title || 'Vídeo do TikTok',
              views: Number(video.view_count || 0),
              url: video.share_url || null,
              publishedAt: new Date((video.create_time || 0) * 1000).toISOString(),
            });
          }
        } else if (account.platform === 'instagram') {
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
            }
          }

          const mediaUrl = new URL(`https://graph.instagram.com/${account.platform_user_id}/media`);
          mediaUrl.searchParams.set('fields', 'id,caption,media_type,permalink,timestamp');
          mediaUrl.searchParams.set('limit', String(POSTS_PER_ACCOUNT));
          mediaUrl.searchParams.set('access_token', accessToken);
          const mediaResponse = await fetch(mediaUrl.toString());
          const mediaData = await mediaResponse.json();
          if (!mediaResponse.ok) {
            throw new Error(mediaData?.error?.message || 'A conta do Instagram precisa ser reconectada (permissão de insights).');
          }

          for (const media of mediaData?.data || []) {
            let views = 0;
            try {
              const insightsUrl = new URL(`https://graph.instagram.com/${media.id}/insights`);
              insightsUrl.searchParams.set('metric', 'views');
              insightsUrl.searchParams.set('access_token', accessToken);
              const insightsResponse = await fetch(insightsUrl.toString());
              const insightsData = await insightsResponse.json();
              if (insightsResponse.ok) {
                views = Number(insightsData?.data?.[0]?.values?.[0]?.value || 0);
              }
            } catch {
              // Some media types (plain images) don't support "views" — leave at 0.
            }
            posts.push({
              externalId: media.id,
              title: (media.caption || 'Post do Instagram').slice(0, 200),
              views,
              url: media.permalink || null,
              publishedAt: media.timestamp || new Date().toISOString(),
            });
          }
        } else {
          continue;
        }

        if (posts.length > 0) {
          const rows = posts.map((p) => ({
            user_id: account.user_id,
            account_id: account.id,
            platform: account.platform,
            external_id: p.externalId,
            title: p.title,
            views: p.views,
            url: p.url,
            published_at: p.publishedAt,
            fetched_at: new Date().toISOString(),
          }));
          const { error: upsertError } = await admin.from('social_posts').upsert(rows, { onConflict: 'account_id,external_id' });
          if (upsertError) throw new Error(upsertError.message);
          syncedPosts += rows.length;
        }
        syncedAccounts++;
      } catch (err: any) {
        console.error(`social-performance-sync: ${account.platform} account ${account.id} failed`, err);
        accountErrors.push({ accountId: account.id, platform: account.platform, label, message: err.message || 'Erro ao sincronizar.' });
      }
    }

    return new Response(
      JSON.stringify({ success: true, syncedAccounts, syncedPosts, accountErrors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('social-performance-sync failed', error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
