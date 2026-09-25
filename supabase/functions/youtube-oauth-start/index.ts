import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const YOUTUBE_REDIRECT_URI = "https://www.superviewsx.com.br/dashboard/configuracoes/youtube/callback";
const YOUTUBE_SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: 'Não autenticado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey);
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await userClient.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: 'Sessão inválida.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
    if (!clientId) {
      return new Response(
        JSON.stringify({ success: false, message: 'YOUTUBE_CLIENT_ID não configurada no projeto Supabase.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const state = crypto.randomUUID();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { error: insertError } = await adminClient
      .from('social_oauth_states')
      .insert({ state, user_id: user.id, platform: 'youtube' });

    if (insertError) {
      console.error('Failed to store oauth state', insertError);
      return new Response(
        JSON.stringify({ success: false, message: 'Erro ao iniciar conexão.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('scope', YOUTUBE_SCOPES);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('redirect_uri', YOUTUBE_REDIRECT_URI);
    authorizeUrl.searchParams.set('state', state);
    // access_type=offline + prompt=consent guarantee a refresh_token comes
    // back every time — Google otherwise only issues one on the very first
    // consent, which would silently break reconnecting later.
    authorizeUrl.searchParams.set('access_type', 'offline');
    authorizeUrl.searchParams.set('prompt', 'consent');

    return new Response(
      JSON.stringify({ success: true, authorizeUrl: authorizeUrl.toString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('youtube-oauth-start failed', error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
