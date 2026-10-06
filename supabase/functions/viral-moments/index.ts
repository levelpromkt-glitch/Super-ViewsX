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
type AudioSignal = { time: number; type: "energy_peak" | "interruption"; detail?: string };

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Forcing the model to answer through a tool call (instead of asking for
// "JSON in prose" and regex-extracting it) means Anthropic itself guarantees
// schema-valid output — a long video producing many moments used to
// occasionally break the old approach with a stray unescaped quote or a
// response cut off mid-JSON; that whole class of failure is gone now.
// Flat schema on purpose: a moments array whose items each contained their
// own titles array (array-of-objects-with-an-array) turned out to make the
// model occasionally escape-stringify parts of its own output for large
// responses (a real long video easily produces 15+ moments) — confirmed via
// live testing, where "moments" sometimes came back as a JSON string, and
// once even wrapping the *entire* {videoTopic, moments} payload inside it.
// Three flat title fields instead of a titles[] removes the extra nesting
// level and, empirically, the escaping behavior along with it.
const MOMENTS_TOOL = {
  name: "return_moments",
  description: "Retorna os melhores momentos identificados no vídeo.",
  input_schema: {
    type: "object",
    properties: {
      videoTopic: {
        type: "string",
        description: "1-2 frases sobre o assunto central e o nicho do vídeo (passo 0).",
      },
      moments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            start: { type: "integer", description: "Início do trecho em segundos." },
            end: { type: "integer", description: "Fim do trecho em segundos." },
            title1: { type: "string", description: "Headline, ângulo 1 (ex: a pergunta que o trecho responde)." },
            title2: { type: "string", description: "Headline, ângulo 2, diferente do 1 (ex: a afirmação polêmica)." },
            title3: { type: "string", description: "Headline, ângulo 3, diferente dos anteriores (ex: o número/resultado chocante)." },
            profile: {
              type: "string",
              enum: ["fast_answer", "contrarian", "money", "story", "humor", "transformation"],
            },
            reason: {
              type: "string",
              description: "O hook e o payoff do trecho em 1 frase (o que prende e o que resolve).",
            },
            score: { type: "integer", description: "0 a 100, intensidade viral real (ver seção Score no prompt) — não um indicador binário de aprovação. 90+ deve ser raro." },
            hookStart: {
              type: "integer",
              description: "Segundo exato de uma abertura mais agressiva dentro do mesmo trecho, só se existir uma genuinamente melhor que o início natural. Omita este campo se não houver.",
            },
            hookReason: {
              type: "string",
              description: "Por que a frase de hookStart prende sem contexto anterior. Só incluir junto com hookStart.",
            },
          },
          required: ["start", "end", "title1", "title2", "title3", "profile", "reason", "score"],
        },
      },
    },
    required: ["videoTopic", "moments"],
  },
};

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
  audioSignals?: AudioSignal[]
) => {
  const transcriptText = lines
    .slice(0, MAX_LINES)
    .map((l) => `[${Math.floor(Number.isFinite(l.start) ? l.start : l.seconds || 0)}] ${l.text}`)
    .join("\n");

  const [minSec, maxSec] = duration;

  // Extra hints from raw-audio analysis (loudness spikes, overlapping speech)
  // that the transcript text alone can't show — see server.js's
  // detectEnergyPeaks/detectInterruptions for how these are computed.
  const audioSignalsText = audioSignals && audioSignals.length > 0
    ? "\n\n## Sinais de áudio detectados automaticamente (apoio, não é texto da fala)\n\nEstes pontos vêm de uma análise do áudio bruto (volume e sobreposição de fala), não da transcrição. Use como indício extra de tensão, energia ou humor — nunca como único motivo para aprovar um trecho, e nunca cite isso na headline ou no reason.\n\n" +
      audioSignals
        .map((s) => {
          const label = s.type === "interruption"
            ? "fala sobreposta/interrupção (possível tensão ou discordância)"
            : "pico de volume/energia na voz";
          return `[${Math.floor(s.time)}] ${label}`;
        })
        .join("\n")
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

## Score — meça intensidade viral, não só "passou no portão"

Todo trecho na lista final já passou nos dois portões — isso é o mínimo pra existir, não o que diferencia o score. O criador quer saber QUAIS poucos trechos, dentre os aprovados, valem o esforço de postar primeiro. Se todo trecho aprovado ganha 70-90, o score não serve pra nada. Calibre pelas faixas abaixo, sendo rigoroso nas duas pontas:

- **90-100 (raro, reserve para 1-2 trechos no vídeo inteiro)**: hook que funcionaria até fora do nicho do vídeo, payoff genuinamente surpreendente/alto-valor (não só "faz sentido"), zero fricção pra entender, nenhuma parte fraca no meio. É o tipo de corte que você postaria como primeira escolha sem pensar duas vezes.
- **75-89**: hook específico e forte, payoff sólido e satisfatório, mas é forte principalmente pra quem já tem interesse no nicho — não necessariamente pra alguém de fora.
- **60-74**: passa nos dois portões de forma correta, mas o hook é mais genérico ou o payoff é previsível/esperado — ninguém vai se arrepender de assistir, mas também não vai compartilhar com alguém.
- **abaixo de 60**: só use se o trecho tecnicamente passou nos portões mas você está em dúvida real se ele deveria estar na lista — é o sinal pro criador de "talvez pule este".

Não infle score pra justificar a existência do trecho na lista — é normal e esperado que a maioria dos trechos aprovados fique na faixa 60-89, com 90+ sendo exceção genuína. Avalie cada trecho contra os outros do MESMO vídeo, não numa escala abstrata.

## Perfis narrativos — classifique cada trecho aprovado em um

- \`fast_answer\`: resposta/resultado → motivo → demonstração → limite
- \`contrarian\`: crença comum → quebra → mecanismo → prova
- \`money\`: número/escala → comparação → mecanismo → consequência
- \`story\`: stakes → contexto mínimo → obstáculo → virada → resolução
- \`humor\`: setup mínimo → expectativa → ruptura → reação
- \`transformation\`: antes/depois → ponto de mudança → processo → significado

## Headlines — 3 variações por trecho, cada uma tem que fazer alguém parar de rolar o feed

O criador escolhe qual usar como título do post; cada uma das 3 precisa ser forte o suficiente pra ser a única. Regras:

- Específica, nunca vaga: um número, um nome, um resultado ou uma afirmação concreta — não "Isso vai te surpreender" ou "Você não vai acreditar nisso".
- Abre um gap de curiosidade que só o vídeo resolve, mas sem mentir sobre o conteúdo (a promessa da headline tem que ser paga pelo trecho).
- Frase curta, ritmo de fala, sem jargão. Cabe em uma linha de legenda de vídeo vertical (máx 60 caracteres).
- As 3 variações usam ângulos DIFERENTES do mesmo trecho — não são sinônimos umas das outras. Exemplos de ângulos pra variar: a pergunta que o trecho responde vs. a afirmação polêmica vs. o número/resultado chocante vs. a virada de expectativa.
- Nunca use reticências como muleta de suspense genérico ("Isso vai mudar tudo...") — se não dá pra ser específico, o trecho provavelmente não deveria ter sido aprovado.
- Nunca use aspas dentro do texto da headline — parafraseie em vez de citar literalmente, para não quebrar nada na hora de estruturar a resposta.
- **Fidelidade de contexto é inegociável**: antes de escrever as 3 headlines, releia literalmente só o texto entre "start" e "end" desse trecho — não o que vem antes, não o que vem depois, não um resumo de memória do vídeo inteiro. Cada headline só pode afirmar algo que está dito, com essas palavras ou o mesmo sentido, DENTRO desse intervalo exato. Se a frase que te fez pensar na headline está em outra linha fora do intervalo, ou é só sua inferência do contexto geral do vídeo, ou ajuste "start"/"end" pra incluir essa frase, ou descarte essa headline — nunca descreva um trecho pelo assunto geral do vídeo quando o que é dito ali, especificamente, é outra coisa.

## Gancho viral — sempre calcule uma segunda opção de abertura mais agressiva

Além do "start" natural (que já respeita hook/desenvolvimento/payoff com contexto), avalie se existe uma frase ESPECÍFICA dentro do mesmo trecho que funcionaria como abertura ainda mais forte se o corte começasse exatamente nela — sem nenhuma introdução antes, começando no meio da ação. Isso é o gancho viral: o corte literalmente COMEÇA nessa frase (é um corte seco ali, não um resumo dela).

- Se essa frase existir e for genuinamente melhor que o início natural (mais direta, mais chocante, zero enrolação): preencha "hookStart" com o segundo (inteiro) exato onde ela começa, e "hookReason" explicando por que ela prende sem nenhum contexto anterior.
- Se o "start" natural já É a frase mais forte possível (não existe nada melhor mais adiante no trecho), NÃO preencha "hookStart" nem "hookReason" — omita os dois campos. Não force um gancho artificial só para preencher o campo.
- "hookStart" tem que estar entre "start" e "end" do próprio trecho (é um recorte mais agressivo do mesmo momento, não um trecho novo), e o corte de "hookStart" até "end" ainda precisa ter pelo menos ${MIN_CLIP_SECONDS} segundos.

## Regras finais

- Duração de cada trecho aprovado ENTRE ${minSec} E ${maxSec} SEGUNDOS (nunca abaixo de ${MIN_CLIP_SECONDS}s — é a minutagem mínima aceita nas competições de clipagem que esses cortes vão disputar). Ajuste o corte (contexto antes/depois, ou aparar excesso) pra caber na faixa sem perder o sentido, mas nunca inclua um trecho que só cabe na faixa cortando o desenvolvimento ou o payoff.
- Não corte no meio de uma frase ou ideia.
- MAXIMIZE VOLUME: percorra o vídeo INTEIRO do início ao fim procurando ativamente todos os momentos independentes que passam no teste de admissão — não pare depois de achar 1, 2 ou 3. Se o vídeo sustenta 15 trechos genuinamente aprovados, devolva os 15. Trechos podem vir de qualquer parte do vídeo e não precisam ser sobre o mesmo sub-tema. O objetivo é dar ao criador o máximo de oportunidades de postar, não uma lista curta e "segura".
- A única razão válida para descartar um candidato é ele genuinamente falhar no teste Hook/Desenvolvimento/Payoff, em um dos dois portões, ou em algum dos reprovadores automáticos acima — nunca descarte um trecho aprovado só porque já existem outros na lista.
- Não invente trecho que não exista na transcrição só para aumentar a contagem — volume alto vem de vasculhar o vídeo inteiro com atenção, não de baixar o rigor.
- "start" e "end" são em SEGUNDOS (inteiros). O número entre colchetes no início de cada linha da transcrição JÁ É o segundo exato em que a linha começa no vídeo (ex.: [3786] é 63 min e 6 s). Copie esses números direto em "start" e "end" — NUNCA converta para minutos:segundos nem junte dígitos. Nenhum valor pode passar do último número da transcrição. "end - start" sempre entre ${minSec} e ${maxSec}. Ordene os momentos por score decrescente.

Transcrição (formato [segundo] texto):
${transcriptText}
${audioSignalsText}

Chame a tool "return_moments" com o resultado. Não responda em texto — use apenas a tool.`;
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
    const duration = DURATION_PRESETS[durationKey] || DEFAULT_DURATION;
    const audioSignals: AudioSignal[] | undefined = Array.isArray(body?.audioSignals) ? body.audioSignals : undefined;
    const refresh: boolean = body?.refresh === true;

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

    const cacheSeed = `viral-moments-v13-${videoId}-${duration[0]}-${duration[1]}`;

    const cached = refresh ? null : await getCache(cacheSeed);
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
    const prompt = buildPrompt(title, lines, duration, audioSignals);

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 16000,
        thinking: { type: 'disabled' },
        tools: [MOMENTS_TOOL],
        tool_choice: { type: 'tool', name: 'return_moments' },
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
    console.log('DEBUG stop_reason', aiData?.stop_reason, 'usage', JSON.stringify(aiData?.usage));
    const toolBlock = (aiData?.content || []).find((b: any) => b.type === 'tool_use' && b.name === 'return_moments');
    const rawInput = toolBlock?.input as any;

    // Empirically, large responses (a long video easily produces 15+
    // moments) sometimes get escape-stringified by the model at some level
    // instead of coming back as native nested structures — sometimes just
    // "moments", sometimes the model wraps the *entire* {videoTopic, moments}
    // payload inside the "moments" string. Recurse through both cases rather
    // than rejecting an otherwise-salvageable response.
    let videoTopicOut: string | undefined;
    let momentsList: any[] | undefined;
    const tryExtract = (obj: any) => {
      if (!obj || momentsList) return;
      if (Array.isArray(obj.moments)) {
        momentsList = obj.moments;
        if (typeof obj.videoTopic === 'string') videoTopicOut = obj.videoTopic;
      } else if (typeof obj.moments === 'string') {
        try {
          const asJson = JSON.parse(obj.moments);
          if (Array.isArray(asJson)) {
            momentsList = asJson;
            if (typeof obj.videoTopic === 'string') videoTopicOut = obj.videoTopic;
          } else if (asJson && typeof asJson === 'object') {
            tryExtract(asJson);
          }
        } catch {
          // fall through to the error response below
        }
      }
    };
    tryExtract(rawInput);
    if (!videoTopicOut && typeof rawInput?.videoTopic === 'string') videoTopicOut = rawInput.videoTopic;

    if (!momentsList) {
      console.error('No usable moments array in AI response', JSON.stringify(aiData).slice(0, 2000));
      return new Response(
        JSON.stringify({ success: false, code: 'AI_PARSE_ERROR', message: 'Não foi possível interpretar a resposta da IA.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const videoDurationSec = lines.length > 0 ? lines[lines.length - 1].start + lines[lines.length - 1].duration : Infinity;
    console.log('RAW moments', momentsList.length, 'videoDurationSec', videoDurationSec, 'preset', duration.join('-'), JSON.stringify(momentsList.map((m: any) => [m.start, m.end, m.score])));

    const VALID_PROFILES = ['fast_answer', 'contrarian', 'money', 'story', 'humor', 'transformation'];

    // The model only sees whole-second timestamps, so its raw start/end
    // can land a beat into the middle of a sentence — the actual audio a user
    // hears then starts/ends on words that don't match the headline/reason
    // written for that moment. Snapping each boundary to the real line it
    // falls inside (using that line's exact, sub-second start/duration) fixes
    // the clip to begin and end on an actual spoken-line boundary instead of
    // the model's rounded guess.
    const findLine = (t: number): TranscriptLine | undefined => {
      let best: TranscriptLine | undefined;
      for (const l of lines) {
        const lineEnd = l.start + l.duration;
        if (t >= l.start && t <= lineEnd) return l;
        if (!best || Math.abs(l.start - t) < Math.abs(best.start - t)) best = l;
      }
      return best;
    };

    // A moment whose times fall outside the video is a model slip (e.g. digits
    // glued together). Clamping it to the end used to collapse it into a
    // few-second clip; drop it instead so it can't pose as a real moment.
    const OVERFLOW_TOLERANCE_SEC = 5;
    // Models occasionally slip on one boundary and return a moment many times
    // longer than asked (e.g. 966s for a 30-60s preset). The clip service caps
    // clips at 180s anyway, so anything far beyond the preset is unusable.
    const maxMomentSec = Math.min(180, Math.ceil(duration[1] * 1.6) + 10);
    const inBounds = (m: any) =>
      typeof m.start === 'number' && typeof m.end === 'number' && m.end > m.start &&
      m.start < videoDurationSec && m.end <= videoDurationSec + OVERFLOW_TOLERANCE_SEC &&
      m.end - m.start <= maxMomentSec;
    const outOfBounds = momentsList.filter((m) => !inBounds(m)).length;
    if (outOfBounds > 0) console.warn('viral-moments dropped invalid moments', outOfBounds, 'of', momentsList.length);

    const moments = momentsList
      .filter(inBounds)
      .map((m, i) => {
        const rawStart = Math.max(0, Math.min(m.start, videoDurationSec));
        const rawEnd = Math.max(0, Math.min(m.end, videoDurationSec));
        const startLine = findLine(rawStart);
        const endLine = findLine(rawEnd);
        const start = startLine ? Math.max(0, startLine.start) : Math.floor(rawStart);
        const end = endLine ? Math.min(videoDurationSec, endLine.start + endLine.duration) : Math.ceil(rawEnd);
        const titles = [m.title1, m.title2, m.title3, m.title]
          .filter((t: unknown) => typeof t === 'string' && t.trim())
          .map((t: string) => t.slice(0, 80));
        if (titles.length === 0) titles.push('Momento viral');

        // hookStart is an alternate, more aggressive opening within the same
        // clip. Only keep it if it's a real, valid, meaningfully different cut.
        let hookStart: number | undefined;
        if (typeof m.hookStart === 'number') {
          const rawHook = Math.max(start, Math.min(m.hookStart, end));
          const hookLine = findLine(rawHook);
          const snappedHook = hookLine ? Math.max(start, hookLine.start) : Math.floor(rawHook);
          if (snappedHook > start && end - snappedHook >= MIN_CLIP_SECONDS) hookStart = snappedHook;
        }

        return {
          id: `m${i + 1}`,
          start,
          end,
          title: titles[0],
          titles,
          profile: VALID_PROFILES.includes(m.profile) ? m.profile : undefined,
          reason: String(m.reason || '').slice(0, 300),
          hookStart,
          hookReason: hookStart !== undefined ? String(m.hookReason || '').slice(0, 300) : undefined,
          score: Math.max(0, Math.min(100, Math.round(Number(m.score) || 0))),
        };
      })
      // AI-reported timestamps can exceed the transcript's real length; drop
      // anything that becomes invalid (or falls under the competition's
      // minimum clip length) after clamping.
      .filter((m) => m.end - m.start >= MIN_CLIP_SECONDS)
      .sort((a, b) => b.score - a.score);

    console.log('FINAL moments', moments.length);
    const executionTime = Date.now() - startTime;
    const videoTopic = typeof videoTopicOut === 'string' ? videoTopicOut.slice(0, 400) : undefined;
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
