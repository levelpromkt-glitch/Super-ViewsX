import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PERIOD_HOURS: Record<string, number> = {
  '24h': 24,
  '48h': 48,
  '72h': 72,
  '7d': 24 * 7,
  '30d': 24 * 30,
};
const PLATFORM_LABELS: Record<string, string> = { tiktok: 'TikTok', youtube: 'YouTube', instagram: 'Instagram' };

// Pure DB read + aggregation — no calls out to TikTok/YouTube/Instagram here,
// so this stays fast. The actual API fetching happens in the separate
// social-performance-sync function (cron + on-demand), which keeps the
// social_posts table warm.
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

    const body = await req.json().catch(() => ({}));
    const period: string = PERIOD_HOURS[body?.period] ? body.period : '7d';
    const accountId: string | null = body?.accountId && body.accountId !== 'all' ? body.accountId : null;
    const hours = PERIOD_HOURS[period];
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const bucketByHour = hours <= 72;

    const { data: accounts } = await admin
      .from('social_accounts')
      .select('id, platform, label, platform_username')
      .eq('user_id', user.id);

    let postsQuery = admin
      .from('social_posts')
      .select('account_id, platform, title, views, url, published_at')
      .eq('user_id', user.id)
      .gte('published_at', since.toISOString())
      .order('views', { ascending: false });
    if (accountId) postsQuery = postsQuery.eq('account_id', accountId);
    const { data: posts, error: postsError } = await postsQuery;
    if (postsError) throw new Error(postsError.message);

    const accountLabelById = new Map((accounts || []).map((a) => [a.id, a.label || a.platform_username || a.platform]));

    const totalViews = (posts || []).reduce((sum, p) => sum + Number(p.views || 0), 0);
    const postsCount = (posts || []).length;
    const topClip = (posts || [])[0]
      ? {
          platform: posts![0].platform,
          title: posts![0].title,
          views: Number(posts![0].views),
          url: posts![0].url,
          publishedAt: posts![0].published_at,
        }
      : null;

    // Full ranked list (capped) so the frontend can show a "top N" and a
    // browsable recent-posts table, not just a single top clip.
    const postList = (posts || []).slice(0, 50).map((p) => ({
      platform: p.platform,
      accountLabel: accountLabelById.get(p.account_id) || p.platform,
      title: p.title,
      views: Number(p.views || 0),
      url: p.url,
      publishedAt: p.published_at,
    }));

    // Bucket into a continuous series (0-filled) so the chart has no gaps.
    // Tracked both as a combined total and split per platform, so the chart
    // can show a stacked breakdown instead of one undifferentiated line.
    const bucketMap = new Map<string, { views: number; posts: number; tiktok: number; youtube: number; instagram: number }>();
    const bucketCount = bucketByHour ? hours : Math.ceil(hours / 24);
    const now = new Date();
    for (let i = bucketCount - 1; i >= 0; i--) {
      const d = new Date(now);
      if (bucketByHour) {
        d.setMinutes(0, 0, 0);
        d.setHours(d.getHours() - i);
        bucketMap.set(d.toISOString().slice(0, 13), { views: 0, posts: 0, tiktok: 0, youtube: 0, instagram: 0 });
      } else {
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        bucketMap.set(d.toISOString().slice(0, 10), { views: 0, posts: 0, tiktok: 0, youtube: 0, instagram: 0 });
      }
    }
    for (const post of posts || []) {
      const d = new Date(post.published_at);
      const key = bucketByHour ? d.toISOString().slice(0, 13) : d.toISOString().slice(0, 10);
      const bucket = bucketMap.get(key);
      if (bucket) {
        const v = Number(post.views || 0);
        bucket.views += v;
        bucket.posts += 1;
        if (post.platform === 'tiktok') bucket.tiktok += v;
        else if (post.platform === 'youtube') bucket.youtube += v;
        else if (post.platform === 'instagram') bucket.instagram += v;
      }
    }
    const series = Array.from(bucketMap.entries()).map(([bucket, v]) => ({ bucket, ...v }));

    // Per-account breakdown within the period, so the frontend can show
    // "todas juntas" and still let the user see each account's slice.
    const byAccountMap = new Map<string, { accountId: string; label: string; platform: string; views: number; posts: number }>();
    for (const account of accounts || []) {
      byAccountMap.set(account.id, {
        accountId: account.id,
        label: account.label || account.platform_username || account.platform,
        platform: account.platform,
        views: 0,
        posts: 0,
      });
    }
    for (const post of posts || []) {
      const entry = byAccountMap.get(post.account_id);
      if (entry) {
        entry.views += Number(post.views || 0);
        entry.posts += 1;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        period,
        accountId: accountId || 'all',
        totalViews,
        postsCount,
        topClip,
        posts: postList,
        series,
        byAccount: Array.from(byAccountMap.values()),
        accounts: (accounts || []).map((a) => ({
          id: a.id,
          label: a.label || a.platform_username || a.platform,
          platform: a.platform,
          platformLabel: PLATFORM_LABELS[a.platform] || a.platform,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('social-performance failed', error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
