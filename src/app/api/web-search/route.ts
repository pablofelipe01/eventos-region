import { TOOL_INPUT_SCHEMAS } from "@/lib/agent/tool-schemas";
import { runVoiceWebSearch } from "@/lib/agent/web-search";
import { jsonError, readJson, rejectCrossOrigin } from "@/lib/http";

// Búsqueda + respuesta breve: normalmente < 15 s; el timeout interno es de 45 s.
export const maxDuration = 60;

/**
 * Búsqueda web para la VOZ (la Realtime API no tiene búsqueda integrada).
 * POST { query } → { result: WebSearchOutput }
 *
 * Ejecuta un `generateText` corto (no streaming) con un modelo rápido de OpenAI
 * y su herramienta nativa `web_search`; devuelve una respuesta breve para leer
 * en voz alta y las URLs de las fuentes. Solo usa OPENAI_API_KEY.
 */
export async function POST(request: Request) {
  const forbidden = rejectCrossOrigin(request);
  if (forbidden) return forbidden;

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const input = TOOL_INPUT_SCHEMAS.webSearch.safeParse(parsed.body);
  if (!input.success) {
    return jsonError(
      400,
      "invalid_arguments",
      `Argumentos inválidos: ${input.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ")}`,
    );
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return jsonError(
      500,
      "missing_api_key",
      "Falta la variable de entorno OPENAI_API_KEY: la búsqueda web por voz usa OpenAI (Responses API + web_search). Añádela en .env.local o en Vercel → Project Settings → Environment Variables.",
      { envKey: "OPENAI_API_KEY" },
    );
  }

  const result = await runVoiceWebSearch(input.data, request.signal);
  return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
}
