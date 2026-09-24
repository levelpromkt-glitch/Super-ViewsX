import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { S3Client, PutObjectCommand, GetObjectCommand } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: Deno.env.get("R2_ENDPOINT")!,
    credentials: {
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
    },
  });
}

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
    const userClient = createClient(supabaseUrl, anonKey);
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, code: 'UNAUTHENTICATED', message: 'Sessão inválida.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bucket = Deno.env.get('R2_BUCKET_NAME');
    if (!bucket || !Deno.env.get('R2_ENDPOINT') || !Deno.env.get('R2_ACCESS_KEY_ID') || !Deno.env.get('R2_SECRET_ACCESS_KEY')) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_CONFIG', message: 'R2 não configurado no projeto.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const ext = typeof body?.ext === 'string' && /^[a-zA-Z0-9]{1,8}$/.test(body.ext) ? body.ext : 'mp4';
    const key = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const s3 = getR2Client();
    const putCommand = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'video/mp4' });
    const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: 3600 });

    return new Response(
      JSON.stringify({ success: true, key, uploadUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('r2-upload-url failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
