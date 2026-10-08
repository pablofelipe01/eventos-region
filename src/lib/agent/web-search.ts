import "server-only";
/**
 * Búsqueda web detrás de una interfaz pequeña para poder cambiar de proveedor
 * (Tavily hoy; Brave, Exa, Perplexity, etc. mañana) sin tocar las herramientas.
 */
import { LIMITS } from "./config";
import type { WebSearchInput, WebSearchOutput, WebSearchResult } from "./tool-schemas";
import { errorMessage } from "../redact";

export interface WebSearchProvider {
  readonly name: string;
  search(query: string, options: { maxResults: number; signal?: AbortSignal }): Promise<{
    answer?: string;
    results: WebSearchResult[];
  }>;
}

class TavilySearchProvider implements WebSearchProvider {
  readonly name = "tavily";
  constructor(private readonly apiKey: string) {}

  async search(query: string, { maxResults, signal }: { maxResults: number; signal?: AbortSignal }) {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: "basic",
      }),
      signal,
      cache: "no-store",
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { detail?: { error?: string } };
        detail = body.detail?.error ?? "";
      } catch {
        // cuerpo no JSON: ignorar
      }
      throw new Error(`Tavily respondió ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const data = (await response.json()) as {
      answer?: string | null;
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    return {
      answer: data.answer ?? undefined,
      results: (data.results ?? [])
        .filter((r): r is { title?: string; url: string; content?: string } => typeof r.url === "string")
        .map((r) => ({
          title: r.title?.trim() || r.url,
          url: r.url,
          snippet: (r.content ?? "").slice(0, 600),
        })),
    };
  }
}

/** Devuelve el proveedor configurado o `null` si no hay ninguno. */
export function getWebSearchProvider(): WebSearchProvider | null {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  if (tavilyKey) return new TavilySearchProvider(tavilyKey);
  // TODO: añadir aquí otros proveedores (p. ej. BRAVE_SEARCH_API_KEY).
  return null;
}

export async function runWebSearch(
  input: WebSearchInput,
  signal?: AbortSignal,
): Promise<WebSearchOutput> {
  const provider = getWebSearchProvider();
  if (!provider) {
    return {
      ok: false,
      configured: false,
      code: "web_search_not_configured",
      error:
        "La búsqueda web no está configurada (falta TAVILY_API_KEY en el servidor). Responde con lo que sabes, indica que no pudiste verificarlo en la web y sugiere configurarla.",
    };
  }

  try {
    const maxResults = Math.min(input.maxResults ?? LIMITS.webSearchResults, 8);
    const { answer, results } = await provider.search(input.query, { maxResults, signal });
    return { ok: true, provider: provider.name, query: input.query, answer, results };
  } catch (error) {
    console.error("[webSearch] error", error);
    return {
      ok: false,
      code: "web_search_failed",
      error: `La búsqueda web falló: ${errorMessage(error)}`,
    };
  }
}
