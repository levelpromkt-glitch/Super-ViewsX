/**
 * supabase-js only puts a generic "Edge Function returned a non-2xx status
 * code" in `error.message` — the actual JSON body we return (message/code)
 * lives on `error.context`, a Response object that must be read separately.
 */
export async function readEdgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.clone().json();
      if (body?.message) return body.message as string;
    } catch {
      // response body wasn't JSON, fall through to fallback
    }
  }
  return (error as Error)?.message || fallback;
}
