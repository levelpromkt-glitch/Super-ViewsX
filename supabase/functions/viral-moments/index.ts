import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_MODEL = "claude-sonnet-5";
const MAX_LINES = 1200; // safety cap on transcript size sent to the model
const CACHE_TTL_HOURS = 24;

// Allowed clip-duration presets (seconds). Anything else falls back to DEFAULT_DURATION.
const DURATION_PRESETS: Record<string, [number, number]> = {
  "10-30": [10, 30],
  "30-60": [30, 60],
  "60-120": [60, 120],
  "120-180": [120, 180],
};
const DEFAULT_DURATION: [number, number] = [10, 90];
// Hard floor regardless of preset: shorter than this isn't a usable clip anywhere.
const MIN_CLIP_SECONDS = 10;

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

const getCache = async (cacheSeed: string) => {
  try {
    const cacheKey = await generateCacheKey(cacheSeed);
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

const setCache = async (cacheSeed: string, videoId: string, response: unknown) => {
  try {
    const cacheKey = await generateCacheKey(cacheSeed);
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

const buildPrompt = (
  title: string,
  lines: TranscriptLine[],
  duration: [number, number],
  viralHook: boolean
) => {
  const transcriptText = lines
    .slice(0, MAX_LINES)
    .map((l) => `[${l.time}] ${l.text}`)
    .join("\n");

  const [minSec, maxSec] = duration;

  const hookInstructions = viralHook
    ? `

GANCHO VIRAL (modo adicional, obrigatório): os primeiros 2-3 segundos de CADA trecho aprovado precisam ser literalmente a frase do "trigger" (hook) abaixo — não uma introdução antes dela. Se o hook mais forte de uma ideia não estiver no início do recorte óbvio, mova o "start" pra começar exatamente nessa frase (mesmo perdendo um pouco de contexto), e preencha "hookReason" explicando por que ela prende atenção sem nenhum contexto anterior.`
    : "";

  return `Você é o triador editorial de um pipeline profissional de cortes virais para Shorts, Reels e TikTok. O criador que vai receber esses cortes vive de volume: participa de competições de clipagem (minutagem mínima ${MIN_CLIP_SECONDS}s), posta em TikTok, Instagram e YouTube, e precisa do maior número possível de oportunidades genuinamente fortes desse vídeo — não só a melhor. Sua função não é "achar 1 trecho perfeito" — é vasculhar o vídeo inteiro e devolver TODOS os trechos que passem no teste de admissão abaixo.

## Passo 0 — entenda o vídeo antes de procurar cortes

Antes de listar qualquer trecho, identifique em 1-2 frases: qual é o assunto central do vídeo, o nicho/formato (ex: podcast de negócios, entrevista, aula, vlog, debate) e o que o público desse nicho especificamente valoriza (número e resultado concreto importam mais em conteúdo de dinheiro/negócios; revelação pessoal e virada de opinião importam mais em entrevista; contraste/punchline importa mais em humor). Use esse entendimento pra calibrar QUAIS trechos priorizar — o mesmo critério genérico de "tem hook" não filtra igual em nichos diferentes.

## O comportamento que o corte precisa vencer

No feed, ninguém escolheu esse vídeo. A alternativa é um deslize de menos de 1 segundo. Cada trecho precisa responder, nos primeiros segundos, a 4 perguntas silenciosas: o que está acontecendo? por que isso importa? o que vou ganhar continuando? está progredindo?

## Teste de admissão: Hook / Desenvolvimento / Payoff

Um trecho só é candidato se você conseguir responder as três perguntas usando o TEXTO literal da transcrição:

- **Hook (trigger)**: que frase específica prende sem nenhum contexto anterior?
- **Desenvolvimento**: o que sustenta entre o hook e o payoff — mecanismo, prova, virada, contra-argumento? Sem isso o momento é raso (vira observação, não candidato).
- **Payoff**: o que fecha a promessa do hook?

Se qualquer uma das três não existir explicitamente no texto, DESCARTE o trecho. Não invente desenvolvimento ou payoff que não estão na fala.

## Dois portões (os dois têm que passar)

**Editorial**: fiel ao que foi dito · compreensível sozinho · tem desenvolvimento real · tem payoff · termina em ponto de fechamento (resposta, consequência, regra, punchline, decisão) · não depende do resto do episódio para fazer sentido.

**Feed**: orienta rápido (âncora clara logo no início: pessoa, número, conflito, pergunta, resultado, antes/depois ou contradição) · comunica a promessa/stakes cedo · entrega o primeiro valor antes do fim · cada parte soma algo novo (sem enrolação nem repetição sem ganho) · a dívida de contexto (coisas que o espectador precisa aceitar sem explicação) é pequena.

## Reprovação automática — não aprove se:

- o assunto central não dá pra entender sem ter visto o vídeo inteiro;
- a frase inicial depende de algo dito antes ("isso", "ele", "como eu falei" sem referente no próprio trecho);
- a promessa do hook não é paga dentro do trecho;
- o final corta a resposta/resolução no meio;
- é só uma opinião solta, sem razão, consequência ou tensão que a sustente;
- usa suspense genérico ("isso vai mudar tudo") em vez de uma promessa específica;
- número forte aparece sem escala ou comparação que dê sentido a ele.

## Perfis narrativos — classifique cada trecho aprovado em um

- \`fast_answer\`: resposta/resultado → motivo → demonstração → limite
- \`contrarian\`: crença comum → quebra → mecanismo → prova
- \`money\`: número/escala → comparação → mecanismo → consequência
- \`story\`: stakes → contexto mínimo → obstáculo → virada → resolução
- \`humor\`: setup mínimo → expectativa → ruptura → reação
- \`transformation\`: antes/depois → ponto de mudança → processo → significado

## Regras finais

- Duração de cada trecho aprovado ENTRE ${minSec} E ${maxSec} SEGUNDOS (nunca abaixo de ${MIN_CLIP_SECONDS}s — é a minutagem mínima aceita nas competições de clipagem que esses cortes vão disputar). Ajuste o corte (contexto antes/depois, ou aparar excesso) pra caber na faixa sem perder o sentido, mas nunca inclua um trecho que só cabe na faixa cortando o desenvolvimento ou o payoff.
- Não corte no meio de uma frase ou ideia.
- MAXIMIZE VOLUME: percorra o vídeo INTEIRO do início ao fim procurando ativamente todos os momentos independentes que passam no teste de admissão — não pare depois de achar 1, 2 ou 3. Se o vídeo sustenta 15 trechos genuinamente aprovados, devolva os 15. Trechos podem vir de qualquer parte do vídeo e não precisam ser sobre o mesmo sub-tema. O objetivo é dar ao criador o máximo de oportunidades de postar, não uma lista curta e "segura".
- A única razão válida para descartar um candidato é ele genuinamente falhar no teste Hook/Desenvolvimento/Payoff, em um dos dois portões, ou em algum dos reprovadores automáticos acima — nunca descarte um trecho aprovado só porque já existem outros na lista.
- Não invente trecho que não exista na transcrição só para aumentar a contagem — volume alto vem de vasculhar o vídeo inteiro com atenção, não de baixar o rigor.
${hookInstructions}

Transcrição (formato [MM:SS] texto):
${transcriptText}

Responda APENAS com um JSON válido (sem markdown, sem texto antes ou depois), no formato:
{"videoTopic":"1-2 frases sobre o assunto central e o nicho do vídeo (passo 0)","moments":[{"start":123,"end":167,"title":"Título curto e chamativo (máx 60 caracteres)","profile":"fast_answer|contrarian|money|story|humor|transformation","reason":"O hook e o payoff em 1 frase (o que prende e o que resolve)","score":87${viralHook ? ',"hookReason":"Por que a frase do gancho prende sem contexto anterior (1 frase)"' : ""}}]}

"start" e "end" são em SEGUNDOS (inteiros), calculados a partir dos timestamps [MM:SS] da transcrição, com "end - start" sempre entre ${minSec} e ${maxSec}. "score" é de 0 a 100 e reflete o quanto o trecho passou nos dois portões, não só o tema ser interessante. Ordene por score decrescente.`;
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
    const durationKey: string = body?.duration;
    const viralHook: boolean = body?.viralHook === true;
    const duration = DURATION_PRESETS[durationKey] || DEFAULT_DURATION;

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

    const cacheSeed = `viral-moments-v6-${videoId}-${duration[0]}-${duration[1]}-${viralHook}`;

    const cached = await getCache(cacheSeed);
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
    const prompt = buildPrompt(title, lines, duration, viralHook);

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 8000,
        thinking: { type: 'disabled' },
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
    const textBlock = (aiData?.content || []).find((b: any) => b.type === 'text');
    const rawText: string = textBlock?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error('No JSON found in AI response', rawText);
      return new Response(
        JSON.stringify({ success: false, code: 'AI_PARSE_ERROR', message: 'Não foi possível interpretar a resposta da IA.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let parsed: { moments: any[]; videoTopic?: string };
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

    const VALID_PROFILES = ['fast_answer', 'contrarian', 'money', 'story', 'humor', 'transformation'];

    const moments = (parsed.moments || [])
      .filter((m) => typeof m.start === 'number' && typeof m.end === 'number' && m.end > m.start)
      .map((m, i) => ({
        id: `m${i + 1}`,
        start: Math.max(0, Math.min(Math.floor(m.start), Math.floor(videoDurationSec))),
        end: Math.max(0, Math.min(Math.ceil(m.end), Math.ceil(videoDurationSec))),
        title: String(m.title || 'Momento viral').slice(0, 120),
        profile: VALID_PROFILES.includes(m.profile) ? m.profile : undefined,
        reason: String(m.reason || '').slice(0, 300),
        hookReason: viralHook ? String(m.hookReason || '').slice(0, 300) : undefined,
        score: Math.max(0, Math.min(100, Math.round(Number(m.score) || 0))),
      }))
      // AI-reported timestamps can exceed the transcript's real length; drop
      // anything that becomes invalid (or falls under the competition's
      // minimum clip length) after clamping.
      .filter((m) => m.end - m.start >= MIN_CLIP_SECONDS)
      .sort((a, b) => b.score - a.score);

    const executionTime = Date.now() - startTime;
    const videoTopic = typeof parsed.videoTopic === 'string' ? parsed.videoTopic.slice(0, 400) : undefined;
    const meta = { model: ANTHROPIC_MODEL, executionTime, cached: false, videoTopic };

    await setCache(cacheSeed, videoId, { moments, meta });

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
