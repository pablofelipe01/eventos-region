import "server-only";
/**
 * Búsqueda web con las herramientas NATIVAS de cada proveedor (sin APIs ni
 * claves de terceros):
 *
 * - Chat con Claude  → `anthropic.tools.webSearch_20260318` (server tool de
 *   Anthropic; Claude busca, filtra y cita las fuentes).
 * - Chat con OpenAI  → `openai.tools.webSearch` (herramienta `web_search` de la
 *   Responses API; cita con anotaciones `url_citation`).
 * - Voz (Realtime API, que no tiene búsqueda integrada) → `runVoiceWebSearch`:
 *   un `generateText` corto, no streaming, con OpenAI + `web_search`, que
 *   devuelve una respuesta breve y las URLs de las fuentes. Solo necesita
 *   OPENAI_API_KEY.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { LIMITS, WEB_SEARCH, type ProviderId } from "./config";
import type { WebSearchInput, WebSearchOutput, WebSource } from "./tool-schemas";
import { errorMessage } from "../redact";

/**
 * Herramienta nativa de búsqueda web para el chat de texto. Se registra con la
 * clave `web_search` en el ToolSet. Las fábricas de herramientas no leen
 * claves: solo describen la herramienta que ejecuta el proveedor.
 */
export function createNativeWebSearchTool(provider: ProviderId) {
  switch (provider) {
    case "anthropic":
      // Versión recomendada por @ai-sdk/anthropic (filtrado dinámico de resultados).
      return anthropic.tools.webSearch_20260318({
        maxUses: WEB_SEARCH.anthropicMaxUses,
        // Anthropic no acepta el código de país CO: solo se envía la zona horaria.
        userLocation: { type: "approximate", timezone: WEB_SEARCH.userLocation.timezone },
        responseInclusion: "excluded",
      });
    case "openai":
      return openai.tools.webSearch({
        searchContextSize: WEB_SEARCH.openaiSearchContextSize,
        userLocation: WEB_SEARCH.userLocation,
      });
  }
}

const VOICE_SEARCH_INSTRUCTIONS = `Eres el módulo de búsqueda web de un asistente de voz en español.
Busca en la web y responde la consulta con datos verificados y actuales.
- Responde en español, en 2 a 5 frases claras (máximo ~120 palabras), aptas para leerse en voz alta.
- No incluyas URLs, markdown ni listas en la respuesta; las fuentes se envían aparte.
- Si los resultados no son concluyentes, dilo.`;

function hostname(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** Ejecuta la búsqueda web de la voz. Nunca lanza. */
export async function runVoiceWebSearch(
  input: WebSearchInput,
  signal?: AbortSignal,
): Promise<WebSearchOutput> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      code: "missing_api_key",
      error:
        "La búsqueda web por voz no está disponible: falta OPENAI_API_KEY en el servidor. Responde con lo que sabes e indica que no pudiste verificarlo en la web.",
    };
  }

  const timeout = AbortSignal.timeout(WEB_SEARCH.voiceTimeoutMs);
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    const provider = createOpenAI({ apiKey });
    const result = await generateText({
      model: provider.responses(WEB_SEARCH.voiceModel),
      instructions: VOICE_SEARCH_INSTRUCTIONS,
      prompt: input.query,
      tools: {
        web_search: provider.tools.webSearch({
          searchContextSize: WEB_SEARCH.voiceSearchContextSize,
          userLocation: WEB_SEARCH.userLocation,
        }),
      },
      toolChoice: { type: "tool", toolName: "web_search" },
      maxOutputTokens: WEB_SEARCH.voiceMaxOutputTokens,
      providerOptions: { openai: { reasoningEffort: WEB_SEARCH.voiceReasoningEffort } },
      maxRetries: 1,
      abortSignal,
    });

    // Fuentes: citas (`url_citation` → sources) + fuentes consultadas por la herramienta.
    const byUrl = new Map<string, WebSource>();
    for (const source of result.sources) {
      if (source.sourceType === "url" && !byUrl.has(source.url)) {
        byUrl.set(source.url, { url: source.url, title: source.title ?? hostname(source.url) });
      }
    }
    for (const toolResult of result.toolResults) {
      if (toolResult.toolName !== "web_search") continue;
      const output = toolResult.output as { sources?: Array<{ type: string; url?: string }> } | undefined;
      for (const source of output?.sources ?? []) {
        if (source.type === "url" && source.url && !byUrl.has(source.url)) {
          byUrl.set(source.url, { url: source.url, title: hostname(source.url) });
        }
      }
    }

    const answer = result.text.trim();
    if (!answer) {
      return { ok: false, code: "web_search_empty", error: "La búsqueda web no devolvió resultados útiles." };
    }
    return {
      ok: true,
      query: input.query,
      answer,
      sources: [...byUrl.values()].slice(0, LIMITS.voiceWebSearchSources),
      model: WEB_SEARCH.voiceModel,
    };
  } catch (error) {
    console.error("[webSearch:voz] error", error);
    const timedOut = timeout.aborted && !signal?.aborted;
    return {
      ok: false,
      code: timedOut ? "web_search_timeout" : "web_search_failed",
      error: timedOut
        ? "La búsqueda web tardó demasiado. Responde con lo que sabes o propón intentarlo de nuevo."
        : `La búsqueda web falló: ${errorMessage(error)}`,
    };
  }
}
