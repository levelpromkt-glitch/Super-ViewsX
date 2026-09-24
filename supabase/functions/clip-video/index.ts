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

  try {
    const body = await req.json().catch(() => ({}));
    const { videoId, storagePath, r2Key, start, end, vertical } = body || {};

    if (typeof start !== 'number' || typeof end !== 'number') {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_REQUEST', message: 'start e end são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (typeof videoId !== 'string' && typeof storagePath !== 'string' && typeof r2Key !== 'string') {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_REQUEST', message: 'videoId, storagePath ou r2Key é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceUrl = Deno.env.get('CLIP_SERVICE_URL');
    const serviceApiKey = Deno.env.get('CLIP_SERVICE_API_KEY');

    if (!serviceUrl) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_CONFIG', message: 'CLIP_SERVICE_URL não configurada no projeto Supabase.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clipBody: Record<string, unknown> = { start, end, vertical: vertical === true };

    if (typeof storagePath === 'string' || typeof r2Key === 'string') {
      // Uploaded-file clip: scope to the authenticated user (same convention
      // as the other storage-backed functions) and hand the VM a signed URL
      // instead of a YouTube id — it never touches YouTube for this path.
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
      const ownedPath = storagePath || r2Key;
      if (userError || !user || !ownedPath.startsWith(`${user.id}/`)) {
        return new Response(
          JSON.stringify({ success: false, code: 'UNAUTHENTICATED', message: 'Sessão inválida.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (typeof r2Key === 'string') {
        clipBody.sourceUrl = await getR2SignedGetUrl(r2Key);
      } else {
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const admin = createClient(supabaseUrl, serviceKey);
        const { data: signed, error: signError } = await admin.storage
          .from('post-videos')
          .createSignedUrl(storagePath, 3600);
        if (signError || !signed?.signedUrl) {
          console.error('createSignedUrl failed', signError);
          return new Response(
            JSON.stringify({ success: false, code: 'STORAGE_ERROR', message: 'Não foi possível acessar o vídeo enviado.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        clipBody.sourceUrl = signed.signedUrl;
      }
    } else {
      clipBody.videoId = videoId;
    }

    const clipResponse = await fetch(`${serviceUrl.replace(/\/$/, '')}/clip`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(serviceApiKey ? { 'x-api-key': serviceApiKey } : {}),
      },
      body: JSON.stringify(clipBody),
    });

    if (!clipResponse.ok) {
      const errBody = await clipResponse.text();
      console.error('clip-service error', clipResponse.status, errBody);
      let message = 'Não foi possível gerar o corte do vídeo.';
      try {
        const parsed = JSON.parse(errBody);
        if (parsed?.message) message = parsed.message;
      } catch {
        // ignore parse errors, use default message
      }
      return new Response(
        JSON.stringify({ success: false, code: 'CLIP_SERVICE_ERROR', message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(clipResponse.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': clipResponse.headers.get('content-type') || 'video/mp4',
        'Content-Disposition': clipResponse.headers.get('content-disposition') || 'attachment; filename="clip.mp4"',
      },
    });
  } catch (error: any) {
    console.error('clip-video failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
