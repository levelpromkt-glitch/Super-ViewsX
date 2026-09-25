import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getR2SignedGetUrl(key: string) {
  const s3 = new S3Client({
    region: "auto",
    endpoint: Deno.env.get("R2_ENDPOINT")!,
    credentials: {
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
    },
  });
  const command = new GetObjectCommand({ Bucket: Deno.env.get("R2_BUCKET_NAME")!, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

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
    const storagePath: string | undefined = body?.storagePath;
    const r2Key: string | undefined = body?.r2Key;
    // Trusts the caller with an already-resolved URL (e.g. a clip our own
    // clip-video function just cut and uploaded to R2, which lives under a
    // "clips/" prefix rather than the user's own folder). Fine for a
    // single-user app; a multi-tenant one would want to scope this too.
    const directSourceUrl: string | undefined = body?.sourceUrl;

    if (
      !directSourceUrl &&
      (!storagePath || !storagePath.startsWith(`${user.id}/`)) &&
      (!r2Key || !r2Key.startsWith(`${user.id}/`))
    ) {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_REQUEST', message: 'Arquivo de vídeo inválido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let sourceUrl: string;
    if (directSourceUrl) {
      sourceUrl = directSourceUrl;
    } else if (r2Key) {
      sourceUrl = await getR2SignedGetUrl(r2Key);
    } else {
      const { data: signed, error: signError } = await admin.storage
        .from('post-videos')
        .createSignedUrl(storagePath!, 3600);
      if (signError || !signed?.signedUrl) {
        console.error('createSignedUrl failed', signError);
        return new Response(
          JSON.stringify({ success: false, code: 'STORAGE_ERROR', message: 'Não foi possível acessar o vídeo enviado.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      sourceUrl = signed.signedUrl;
    }

    const serviceUrl = Deno.env.get('CLIP_SERVICE_URL');
    const serviceApiKey = Deno.env.get('CLIP_SERVICE_API_KEY');
    if (!serviceUrl) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_CONFIG', message: 'CLIP_SERVICE_URL não configurada.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transcribeResponse = await fetch(`${serviceUrl.replace(/\/$/, '')}/transcribe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(serviceApiKey ? { 'x-api-key': serviceApiKey } : {}),
      },
      body: JSON.stringify({ sourceUrl }),
    });

    if (!transcribeResponse.ok) {
      const errBody = await transcribeResponse.text();
      console.error('clip-service /transcribe error', transcribeResponse.status, errBody);
      let message = 'Não foi possível transcrever o vídeo enviado.';
      try {
        const parsed = JSON.parse(errBody);
        if (parsed?.message) message = parsed.message;
      } catch {
        // ignore parse errors, use default message
      }
      return new Response(
        JSON.stringify({ success: false, code: 'TRANSCRIBE_FAILED', message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await transcribeResponse.json();
    return new Response(
      JSON.stringify({ success: true, lines: data.lines, words: data.words, videoDurationSec: data.videoDurationSec }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('transcribe-upload failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
