// Backup model for the "best moments" AI. The primary model is Claude; when it cannot answer
// (no credits left, rate limited, overloaded, down) the same request is sent to Google Gemini,
// which has a free tier. This file is copied next to each function that needs it (the Supabase
// MCP deploy only ships the files of one function), so keep the copies identical.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// First model that answers wins. Override with the GEMINI_MODELS secret (comma separated).
// Model names retire over time (gemini-2.0-flash already did): "-latest" follows the current one.
// (The "-latest" alias is the most crowded one and answers 503 "overloaded" often, so it is not first.)
const DEFAULT_GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-flash-latest", "gemini-2.5-flash"];

export const geminiModels = (): string[] => {
  const fromEnv = (Deno.env.get("GEMINI_MODELS") || "").split(",").map((m) => m.trim()).filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_GEMINI_MODELS;
};

// Should a failed Claude call fall back to Gemini? Yes for "the provider cannot serve us right
// now" (credits, auth, limits, outages); no for a request the API rejected as malformed (a bug
// that Gemini would only hide).
export const isFallbackEligible = (status: number, errText: string): boolean =>
  status === 0 ||
  /credit balance is too low/i.test(errText) ||
  [401, 403, 429, 500, 502, 503, 529].includes(status);

// Claude tool schemas are plain JSON Schema; Gemini's responseSchema wants upper-case types and
// only a subset of keywords.
export const toGeminiSchema = (schema: any): any => {
  if (!schema || typeof schema !== "object") return schema;
  const out: any = {};
  if (typeof schema.type === "string") out.type = schema.type.toUpperCase();
  if (typeof schema.description === "string") out.description = schema.description;
  if (Array.isArray(schema.enum)) out.enum = schema.enum;
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) out.properties[k] = toGeminiSchema(v);
  }
  if (Array.isArray(schema.required)) out.required = schema.required;
  return out;
};

export type GeminiResult =
  | { ok: true; data: any; model: string; trace: string[] }
  | { ok: false; status: number; error: string; trace: string[] };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One structured (JSON) answer from Gemini, following `schema`. Retries rate limits (the free
// tier is tight) and moves on to the next model when one is unknown or still limited.
export async function callGeminiStructured(opts: {
  apiKey: string;
  prompt: string;
  schema: any; // Claude-style JSON schema of the object to return
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<GeminiResult> {
  const { apiKey, prompt, schema } = opts;
  // Hidden "thinking" costs time and output budget, and the work here (reading text, filling a
  // schema) does not need it: 2.5 models take a budget, newer ones a level.
  const thinking = (model: string, withThinking: boolean) =>
    !withThinking ? {} : model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : { thinkingConfig: { thinkingLevel: "low" } };
  const body = (model: string, withThinking = true) => ({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: toGeminiSchema(schema),
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 16000,
      ...thinking(model, withThinking),
    },
  });
  const noThinkingParam = new Set<string>(); // models that rejected the thinking setting

  // Every failed attempt is kept, so a diagnosis shows what each model said.
  const errors: string[] = [];
  const trace: string[] = []; // "model#attempt:status:ms" per request
  let lastStatus = 0;
  const fail = (status: number, error: string) => {
    lastStatus = status;
    errors.push(error);
    return { ok: false, status, error, trace } as GeminiResult;
  };

  for (const model of geminiModels()) {
    const rateLimitWaits = [6000, 15000];
    for (let attempt = 0; attempt <= rateLimitWaits.length; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 110000);
      const t0 = Date.now();
      try {
        const url = `${GEMINI_BASE}/models/${model}:generateContent`;
        let res = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body(model, !noThinkingParam.has(model))),
        });
        // Keys bound to a service account are documented with the ?key= form: try it once.
        if (res.status === 401 || res.status === 403) {
          res = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
            method: "POST",
            signal: controller.signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body(model, !noThinkingParam.has(model))),
          });
        }
        trace.push(`${model}#${attempt}:${res.status}:${Date.now() - t0}ms`);
        if (!res.ok) {
          const errText = await res.text();
          // This model does not take the thinking setting: repeat the call without it.
          if (res.status === 400 && /think/i.test(errText) && !noThinkingParam.has(model)) {
            noThinkingParam.add(model);
            continue;
          }
          const failed = fail(res.status, `${model}: ${res.status} ${errText.slice(0, 300)}`);
          if (res.status === 404) break; // unknown model: try the next one
          // Rate limit: wait and retry (the free tier recovers within seconds). Overloaded: one quick
          // retry, then another model, which is usually faster than waiting.
          const waits = res.status === 429 ? rateLimitWaits : res.status === 503 ? [1500] : [];
          if (attempt < waits.length) {
            await sleep(waits[attempt]);
            continue;
          }
          if (res.status === 429 || res.status === 503) break; // still limited: next model
          return { ...failed, error: errors.join(" | "), trace }; // 400/401/403/...: another model will not help
        }
        const data = await res.json();
        const cand = data?.candidates?.[0];
        const text = (cand?.content?.parts || []).map((p: any) => p?.text || "").join("");
        if (!text) {
          fail(200, `${model}: resposta vazia (finishReason=${cand?.finishReason})`);
          break;
        }
        try {
          return { ok: true, data: JSON.parse(text), model, trace };
        } catch {
          fail(200, `${model}: JSON inválido (finishReason=${cand?.finishReason})`);
          break;
        }
      } catch (err) {
        fail(0, `${model}: ${(err as Error).message}`);
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return { ok: false, status: lastStatus, error: errors.join(" | ") || "Gemini não respondeu.", trace };
}
