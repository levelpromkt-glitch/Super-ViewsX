import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INSTAGRAM_REDIRECT_URI = "https://www.superviewsx.com.br/dashboard/configuracoes/instagram/callback";
// "API do Instagram com o Login do Instagram" — no Facebook Page required,
// just a Business/Creator Instagram account added as a tester on the Meta app.
const INSTAGRAM_SCOPES = "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights";

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

    const clientId = Deno.env.get('INSTAGRAM_CLIENT_ID');
    if (!clientId) {
      return new Response(
        JSON.stringify({ success: false, message: 'INSTAGRAM_CLIENT_ID não configurada no projeto Supabase.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const state = crypto.randomUUID();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { error: insertError } = await adminClient
      .from('social_oauth_states')
      .insert({ state, user_id: user.id, platform: 'instagram' });

    if (insertError) {
      console.error('Failed to store oauth state', insertError);
      return new Response(
        JSON.stringify({ success: false, message: 'Erro ao iniciar conexão.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authorizeUrl = new URL('https://www.instagram.com/oauth/authorize');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', INSTAGRAM_REDIRECT_URI);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', INSTAGRAM_SCOPES);
    authorizeUrl.searchParams.set('state', state);

    return new Response(
      JSON.stringify({ success: true, authorizeUrl: authorizeUrl.toString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('instagram-oauth-start failed', error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
