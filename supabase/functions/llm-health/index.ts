import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { callGeminiStructured, geminiModels } from "./llm.ts";

// Diagnostic for the backup AI: is GEMINI_API_KEY set, which models does it see, and does a
// structured (JSON) answer come back? Never returns the key itself.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
  if (!apiKey) return json({ hasKey: false, message: "GEMINI_API_KEY não está cadastrada nos segredos." });

  // Which Gemini models can this key see?
  let models: string[] = [];
  let listError: string | null = null;
  try {
    let res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": apiKey },
    });
    if (res.status === 401 || res.status === 403) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`);
    }
    if (res.ok) {
      const data = await res.json();
      models = (data?.models || [])
        .filter((m: any) => (m?.supportedGenerationMethods || []).includes("generateContent"))
        .map((m: any) => String(m.name).replace(/^models\//, ""))
        .filter((n: string) => n.startsWith("gemini"));
    } else {
      listError = `${res.status} ${(await res.text()).slice(0, 300)}`;
    }
  } catch (e) {
    listError = (e as Error).message;
  }

  // A structured call shaped like the real ones.
  const started = Date.now();
  const test = await callGeminiStructured({
    apiKey,
    prompt: 'Devolva um JSON com "ok": true e "moments" com 2 itens de teste (start 10, end 30, title "teste").',
    schema: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        moments: {
          type: "array",
          items: {
            type: "object",
            properties: { start: { type: "integer" }, end: { type: "integer" }, title: { type: "string" } },
            required: ["start", "end", "title"],
          },
        },
      },
      required: ["ok", "moments"],
    },
    maxOutputTokens: 500,
    timeoutMs: 60000,
  });

  return json({
    hasKey: true,
    keyKind: apiKey.slice(0, 2), // "AI" = classic key, "AQ" = key bound to a service account
    configuredModels: geminiModels(),
    availableModels: models.slice(0, 40),
    listError,
    test,
    ms: Date.now() - started,
  });
});
