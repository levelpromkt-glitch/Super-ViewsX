import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Second pass of the "Melhores Momentos" pipeline. viral-moments casts a wide
// net over the whole transcript; this function re-reads the exact text of each
// candidate with a stronger model, throws out the weak ones, moves the cut to
// open on the hook and close on the payoff, and rewrites the headlines using
// only what is actually said inside the cut.
const JUDGE_MODELS = ["claude-opus-5-5", "claude-sonnet-5"]; // first that works wins
const BATCH_SIZE = 8;
const CACHE_TTL_HOURS = 24;
const MIN_CLIP_SECONDS = 10;
const MAX_CLIP_SECONDS = 180;

const DURATION_PRESETS: Record<string, [number, number]> = {
  "10-30": [10, 30],
  "30-60": [30, 60],
  "60-120": [60, 120],
  "120-180": [120, 180],
};
const DEFAULT_DURATION: [number, number] = [10, 90];
const VALID_PROFILES = ['fast_answer', 'contrarian', 'money', 'story', 'humor', 'transformation'];

type Candidate = {
  id: string;
  start: number;
  end: number;
  title?: string;
  titles?: string[];
  profile?: string;
  reason?: string;
  score?: number;
  slice?: string[]; // "start|end|text"
};
type SliceSentence = { start: number; end: number; text: string };

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const JUDGE_TOOL = {
  name: "judge_candidates",
  description: "Devolve o veredito sobre cada candidato a corte viral.",
  input_schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "O id do candidato, exatamente como recebido." },
            keep: { type: "boolean", description: "true só se o trecho realmente tem potencial viral alto." },
            start: { type: "number", description: "Rótulo (segundo) da PRIMEIRA frase do corte, copiado da transcrição do candidato." },
            end: { type: "number", description: "Rótulo (segundo) da ÚLTIMA frase do corte, copiado da transcrição. Essa frase inteira entra no corte." },
            hook: { type: "string", description: "A frase de abertura do corte, copiada literalmente." },
            score: { type: "integer", description: "0 a 100, potencial viral real (ver rubrica)." },
            profile: { type: "string", enum: VALID_PROFILES },
            reason: { type: "string", description: "1 frase: o que prende (hook) e o que paga (payoff), só com base no texto do trecho." },
            title1: { type: "string", description: "Headline ângulo 1, até 60 caracteres." },
            title2: { type: "string", description: "Headline ângulo 2, diferente da 1." },
            title3: { type: "string", description: "Headline ângulo 3, diferente das anteriores." },
          },
          required: ["id", "keep", "score", "reason"],
        },
      },
    },
    required: ["results"],
  },
};

const parseSlice = (slice: unknown): SliceSentence[] => {
  if (!Array.isArray(slice)) return [];
  const out: SliceSentence[] = [];
  for (const row of slice) {
    if (typeof row !== 'string') continue;
    const i1 = row.indexOf('|');
    const i2 = row.indexOf('|', i1 + 1);
    if (i1 < 0 || i2 < 0) continue;
    const start = Number(row.slice(0, i1));
    const end = Number(row.slice(i1 + 1, i2));
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.push({ start, end, text: row.slice(i2 + 1) });
  }
  return out.sort((a, b) => a.start - b.start);
};

const buildPrompt = (batch: Candidate[], duration: [number, number], videoTopic: string) => {
  const [minSec, maxSec] = duration;
  const blocks = batch.map((c) => {
    const sentences = parseSlice(c.slice);
    const text = sentences.map((s) => `[${s.start.toFixed(1)} → ${s.end.toFixed(1)}] ${s.text}`).join('\n');
    return `### Candidato ${c.id} (proposta inicial: ${c.start.toFixed(1)}s até ${c.end.toFixed(1)}s, ${Math.round(c.end - c.start)}s)\nHeadline proposta: ${c.title || ''}\n\nTranscrição (entre colchetes: segundo em que a frase começa → segundo em que termina; há contexto antes e depois da proposta):\n${text}`;
  }).join('\n\n');

  return `Você é o editor-chefe de uma operação de cortes virais para TikTok, Reels e Shorts. Você é EXIGENTE e cético: o criador já recebeu listas longas de cortes medianos e o que ele precisa agora é só de cortes que realmente podem viralizar. Aprovar um corte fraco custa a ele tempo e alcance; reprovar um corte bom custa quase nada, porque existem outros candidatos.

Assunto do vídeo: ${videoTopic || '(não informado)'}
Duração desejada de cada corte: entre ${minSec} e ${maxSec} segundos (nunca menos de ${MIN_CLIP_SECONDS}s).

Para CADA candidato abaixo, leia a transcrição inteira dele e decida:

## 1. keep (aprovar ou reprovar)
Aprove SÓ se o trecho passar em tudo:
- HOOK: existe uma frase que prende sozinha, sem depender do que veio antes (afirmação forte, número, pergunta que o trecho responde, virada, confissão, polêmica com razão).
- DESENVOLVIMENTO: entre o hook e o fecho há conteúdo real (mecanismo, exemplo concreto, prova, história), não enrolação.
- PAYOFF: a promessa do hook é paga e a ideia fecha.
- Faz sentido para quem nunca viu o resto do vídeo.
- Dá vontade de compartilhar, comentar ou salvar: é específico, surpreendente, útil ou emocional.
REPROVE se for: conselho genérico e previsível; opinião sem razão; conversa de bastidor ou transição entre assuntos; o entrevistador falando mais que o entrevistado; história que só funciona com contexto de outra parte; repetição; promessa que o trecho não entrega; trecho que só faz sentido se você já conhece a pessoa.

## 2. Corte exato (start e end) — o que mais pesa na qualidade
Escolha os rótulos de início e fim DENTRO da transcrição do candidato (pode ir além da proposta inicial, ou aparar):
- start = rótulo da PRIMEIRA frase do corte, e ela tem que ser o HOOK. Corte fora qualquer frase de introdução, muleta ("então", "né", "cara"), frase pela metade, pergunta de transição do entrevistador (a menos que a própria pergunta seja o hook) ou contexto que só faz sentido depois.
- end = rótulo da ÚLTIMA frase do corte (ela entra inteira): a frase que fecha a ideia, dita por quem está contando. Pare no payoff. NUNCA termine numa pergunta dirigida ao outro participante ("faz sentido?", "como foi isso?"), nem inclua a pergunta seguinte do entrevistador, agradecimento, "então...", nem frase que ficou no meio ou cortada.
- A duração (do início da primeira frase ao fim da última) tem que ficar entre ${minSec}s e ${maxSec}s — é um limite RÍGIDO (cortes acima disso são descartados automaticamente). Se a melhor versão do trecho for maior que o limite, escolha o recorte mais forte dentro do limite que ainda feche a ideia; se não der para fechar a ideia dentro do limite, reprove.
- Calcule a duração antes de responder: (fim da última frase) − (início da primeira frase). Se passar de ${maxSec}s, escolha frases mais perto do hook/payoff até caber.
- Em start e end copie o PRIMEIRO número do colchete (o início da frase), exatamente como aparece.
- Responda SEMPRE chamando a tool judge_candidates, nunca em texto.

## 3. score (0 a 100) — potencial viral REAL
- 90 a 100: raríssimo, 1 ou 2 no vídeo inteiro. Você apostaria que vai performar muito acima da média.
- 80 a 89: forte, hook específico e payoff claro, funciona também para quem é de fora do nicho.
- 70 a 79: bom e postável, mas não excepcional.
- abaixo de 70: fraco → keep=false.
Não infle. Compare os candidatos entre si dentro desta lista.

## 4. Headlines (title1, title2, title3)
Escreva as 3 usando SOMENTE o que é dito entre o início e o fim que você escolheu. Se a headline afirma algo que não está no corte, está errada. Cada uma: específica (número, nome, resultado ou afirmação concreta), até 60 caracteres, ritmo de fala, sem aspas, sem reticências de suspense, sem promessa que o corte não paga. Os 3 ângulos devem ser diferentes (pergunta que o trecho responde / afirmação forte / número ou resultado / virada de expectativa).

## Formato
Chame a tool judge_candidates com UM resultado para cada candidato recebido (todos os ids). Para reprovados basta id, keep=false, score e reason (o motivo da reprovação em 1 frase). Para aprovados preencha tudo (start, end, hook, score, profile, reason, title1, title2, title3).

${blocks}`;
};

const callJudge = async (apiKey: string, model: string, prompt: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 110000);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        // Opus rejects a forced tool_choice (and thinks by default), so it gets "auto" + room for
        // thinking; the other models are forced to answer through the tool with thinking off.
        max_tokens: model.includes('opus') ? 16000 : 6000,
        ...(model.includes('opus') ? {} : { thinking: { type: 'disabled' } }),
        tools: [JUDGE_TOOL],
        tool_choice: model.includes('opus') ? { type: 'auto' } : { type: 'tool', name: 'judge_candidates' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      return { ok: false as const, status: response.status, errText };
    }
    const data = await response.json();
    const block = (data?.content || []).find((b: any) => b.type === 'tool_use' && b.name === 'judge_candidates');
    let results = block?.input?.results;
    if (typeof results === 'string') {
      try { results = JSON.parse(results); } catch { results = undefined; }
    }
    if (!Array.isArray(results)) {
      // No usable tool call (e.g. auto mode answered in text): let the next model try.
      return { ok: false as const, status: 200, errText: `no tool result, stop_reason=${data?.stop_reason}` };
    }
    return { ok: true as const, results, usage: data?.usage };
  } finally {
    clearTimeout(timer);
  }
};

const generateCacheKey = async (text: string) => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => ({}));
    const videoId: string = body?.videoId;
    const duration = DURATION_PRESETS[body?.duration] || DEFAULT_DURATION;
    const videoTopic: string = typeof body?.videoTopic === 'string' ? body.videoTopic : '';
    const refresh = body?.refresh === true;
    const candidates: Candidate[] = Array.isArray(body?.candidates)
      ? body.candidates.filter((c: any) => c && typeof c.id === 'string' && typeof c.start === 'number' && typeof c.end === 'number' && Array.isArray(c.slice) && c.slice.length > 0)
      : [];

    if (!videoId || candidates.length === 0) {
      return json({ success: false, code: 'INVALID_REQUEST', message: 'videoId e candidatos são obrigatórios.' }, 400);
    }

    const cacheSeed = `viral-judge-v3-${videoId}-${duration[0]}-${duration[1]}-${candidates.length}`;
    const cacheKey = await generateCacheKey(cacheSeed);
    if (!refresh) {
      const { data } = await supabase.from('api_search_cache').select('response, created_at').eq('cache_key', cacheKey).maybeSingle();
      if (data && (Date.now() - new Date(data.created_at).getTime()) / 36e5 <= CACHE_TTL_HOURS) {
        return json({ success: true, videoId, ...(data.response as object), meta: { ...(data.response as any).meta, cached: true } });
      }
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ success: false, code: 'MISSING_API_KEY', message: 'ANTHROPIC_API_KEY não configurada.' }, 500);

    const startedAt = Date.now();
    const batches: Candidate[][] = [];
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) batches.push(candidates.slice(i, i + BATCH_SIZE));

    let modelUsed = JUDGE_MODELS[0];
    const modelErrors: string[] = [];
    const runBatch = async (batch: Candidate[]) => {
      const prompt = buildPrompt(batch, duration, videoTopic);
      for (const model of JUDGE_MODELS) {
        try {
          const result = await callJudge(apiKey, model, prompt);
          if (result.ok) {
            modelUsed = model;
            return result.results as any[];
          }
          modelErrors.push(`${model}: ${result.status} ${result.errText.slice(0, 200)}`);
          console.error('viral-judge model error', model, result.status, result.errText.slice(0, 300));
        } catch (err) {
          modelErrors.push(`${model}: ${(err as Error).message}`);
          console.error('viral-judge call failed', model, (err as Error).message);
        }
      }
      return null;
    };

    const batchResults = await Promise.all(batches.map(runBatch));
    const judged: any[] = [];
    let failedBatches = 0;
    batchResults.forEach((r) => (r ? judged.push(...r) : failedBatches++));
    if (judged.length === 0) {
      return json({ success: false, code: 'JUDGE_FAILED', message: 'Não foi possível refinar os cortes.' }, 502);
    }
    console.log('JUDGE', 'candidates', candidates.length, 'judged', judged.length, 'kept', judged.filter((j) => j?.keep === true).length, 'failedBatches', failedBatches);

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const maxAllowed = Math.min(MAX_CLIP_SECONDS, Math.ceil(duration[1] * 1.15) + 2);
    const nearest = (list: SliceSentence[], t: number) =>
      list.reduce((best, s, i) => (Math.abs(s.start - t) < Math.abs(list[best].start - t) ? i : best), 0);

    const final: any[] = [];
    let droppedByLength = 0;
    for (const j of judged) {
      const cand = j && typeof j.id === 'string' ? byId.get(j.id) : undefined;
      if (!cand || j.keep !== true) continue;

      const sentences = parseSlice(cand.slice);
      let start = cand.start;
      let end = cand.end;
      if (sentences.length > 0 && typeof j.start === 'number' && typeof j.end === 'number') {
        let si = nearest(sentences, j.start);
        let ei = Math.max(si, nearest(sentences, j.end));
        // A sentence that starts lowercase is the tail of one the transcript split
        // at a speaker change: begin on the next real sentence instead.
        while (si < ei && /^[a-z\u00e0-\u00fc]/.test(sentences[si].text.trim())) si++;
        // A last "sentence" with no closing punctuation was cut mid-thought: end on the previous one.
        while (ei > si && !/[.!?\u2026"\u201d)]\s*$/.test(sentences[ei].text.trim())) ei--;
        const cutStart = sentences[si].start;
        const cutEnd = sentences[ei].end;
        const dur = cutEnd - cutStart;
        if (dur >= MIN_CLIP_SECONDS && dur <= maxAllowed) {
          start = cutStart;
          end = cutEnd;
        }
      }
      // Hard limit: a cut still over the requested length is dropped, never shipped.
      if (end - start > maxAllowed || end - start < MIN_CLIP_SECONDS) { droppedByLength++; continue; }

      const titles = [j.title1, j.title2, j.title3]
        .filter((t: unknown) => typeof t === 'string' && t.trim())
        .map((t: string) => t.trim().replace(/["“”]/g, '').slice(0, 80));
      if (titles.length === 0) titles.push(...(cand.titles || (cand.title ? [cand.title] : [])));
      if (titles.length === 0) titles.push('Momento viral');

      final.push({
        start,
        end,
        title: titles[0],
        titles,
        profile: VALID_PROFILES.includes(j.profile) ? j.profile : (VALID_PROFILES.includes(cand.profile as string) ? cand.profile : undefined),
        reason: String(j.reason || cand.reason || '').slice(0, 300),
        score: Math.max(0, Math.min(100, Math.round(Number(j.score) || 0))),
      });
    }

    final.sort((a, b) => b.score - a.score);
    // Two candidates can land on the same passage: keep only the higher-scored one
    // when more than half of the shorter cut is shared.
    const unique: any[] = [];
    for (const m of final) {
      const dup = unique.some((u) => {
        const overlap = Math.min(u.end, m.end) - Math.max(u.start, m.start);
        return overlap > 0.5 * Math.min(u.end - u.start, m.end - m.start);
      });
      if (!dup) unique.push(m);
    }
    const moments = unique.map((m, i) => ({ id: `m${i + 1}`, ...m }));
    const meta = { model: modelUsed, executionTime: Date.now() - startedAt, candidates: candidates.length, keptByJudge: judged.filter((j) => j?.keep === true).length, droppedByLength, kept: moments.length, failedBatches, modelErrors, cached: false };

    // Don't cache a partial result: a failed batch would otherwise stick for 24h.
    if (failedBatches === 0) {
      await supabase.from('api_search_cache').upsert({
        cache_key: cacheKey,
        platform: 'viral-judge',
        query: videoId,
        period: 'na',
        min_views: 0,
        response: { moments, meta },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'cache_key' });
    }

    return json({ success: true, videoId, moments, meta });
  } catch (error: any) {
    console.error('viral-judge failed', error);
    return json({ success: false, code: 'INTERNAL_ERROR', message: error.message || 'Erro inesperado.' }, 500);
  }
});
