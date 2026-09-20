import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_MODEL = "claude-sonnet-5";
const MAX_LINES = 1200; // safety cap on transcript size sent to the model
const CACHE_TTL_HOURS = 24;

type TranscriptLine = { time: string; seconds: number; text: string; start: number; duration: number };

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const generateCacheKey = async (text: string) => {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const getCache = async (videoId: string) => {
  try {
    const cacheKey = await generateCacheKey(`viral-moments-v1-${videoId}`);
    const { data, error } = await supabase
      .from('api_search_cache')
      .select('response, created_at')
      .eq('cache_key', cacheKey)
      .single();
    if (error || !data) return null;
    const hoursDiff = (Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursDiff > CACHE_TTL_HOURS) return null;
    return data.response as { moments: any[]; meta: any };
  } catch {
    return null;
  }
};

const setCache = async (videoId: string, response: unknown) => {
  try {
    const cacheKey = await generateCacheKey(`viral-moments-v1-${videoId}`);
    await supabase.from('api_search_cache').upsert({
      cache_key: cacheKey,
      platform: 'viral-moments',
      query: videoId,
      period: 'na',
      min_views: 0,
      response,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cache_key' });
  } catch (e) {
    console.error('viral-moments cache set error', e);
  }
};

const buildPrompt = (title: string, lines: TranscriptLine[]) => {
  const transcriptText = lines
    .slice(0, MAX_LINES)
    .map((l) => `[${l.time}] ${l.text}`)
    .join("\n");

  return `Você é um editor de vídeo especialista em cortes virais para Shorts, Reels e TikTok.

Analise a transcrição abaixo do vídeo "${title || "sem título"}" e identifique de 4 a 8 trechos com o MAIOR potencial viral como vídeo curto (short-form).

Critérios para um bom trecho:
- Início forte (gancho) que funciona sem contexto do resto do vídeo
- Contém uma ideia completa: revelação, virada, piada, dado surpreendente, momento emocional ou polêmico
- Duração entre 15 e 90 segundos
- Não corte no meio de uma frase ou ideia

Transcrição (formato [MM:SS] texto):
${transcriptText}

Responda APENAS com um JSON válido (sem markdown, sem texto antes ou depois), no formato:
{"moments":[{"start":123,"end":167,"title":"Título curto e chamativo (máx 60 caracteres)","reason":"Por que esse trecho tem potencial viral (1 frase)","score":87}]}

"start" e "end" são em SEGUNDOS (inteiros), calculados a partir dos timestamps [MM:SS] da transcrição. "score" é de 0 a 100. Ordene por score decrescente.`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const videoId: string = body?.videoId;
    const title: string = body?.title || "";
    const lines: TranscriptLine[] = Array.isArray(body?.lines) ? body.lines : [];

    if (!videoId || typeof videoId !== 'string') {
      return new Response(
        JSON.stringify({ success: false, code: 'INVALID_VIDEO_ID', message: 'videoId é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (lines.length === 0) {
      return new Response(
        JSON.stringify({ success: false, code: 'EMPTY_TRANSCRIPT', message: 'Transcrição vazia.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cached = await getCache(videoId);
    if (cached) {
      return new Response(
        JSON.stringify({ success: true, videoId, moments: cached.moments, meta: { ...cached.meta, cached: true } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_API_KEY', message: 'ANTHROPIC_API_KEY não configurada no projeto Supabase.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startTime = Date.now();
    const prompt = buildPrompt(title, lines);

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('Anthropic API error', aiResponse.status, errText);
      return new Response(
        JSON.stringify({ success: false, code: 'AI_API_ERROR', message: 'Falha ao analisar o vídeo com IA.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const rawText: string = aiData?.content?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error('No JSON found in AI response', rawText);
      return new Response(
        JSON.stringify({ success: false, code: 'AI_PARSE_ERROR', message: 'Não foi possível interpretar a resposta da IA.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let parsed: { moments: any[] };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('JSON parse error', e, rawText);
      return new Response(
        JSON.stringify({ success: false, code: 'AI_PARSE_ERROR', message: 'Não foi possível interpretar a resposta da IA.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const videoDurationSec = lines.length > 0 ? lines[lines.length - 1].start + lines[lines.length - 1].duration : Infinity;

    const moments = (parsed.moments || [])
      .filter((m) => typeof m.start === 'number' && typeof m.end === 'number' && m.end > m.start)
      .map((m, i) => ({
        id: `m${i + 1}`,
        start: Math.max(0, Math.floor(m.start)),
        end: Math.min(Math.ceil(m.end), Math.ceil(videoDurationSec)),
        title: String(m.title || 'Momento viral').slice(0, 120),
        reason: String(m.reason || '').slice(0, 300),
        score: Math.max(0, Math.min(100, Math.round(Number(m.score) || 0))),
      }))
      .sort((a, b) => b.score - a.score);

    const executionTime = Date.now() - startTime;
    const meta = { model: ANTHROPIC_MODEL, executionTime, cached: false };

    await setCache(videoId, { moments, meta });

    return new Response(
      JSON.stringify({ success: true, videoId, moments, meta }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('viral-moments failed', error);
    return new Response(
      JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
