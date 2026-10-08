/**
 * Fuentes web de un mensaje, para mostrarlas como enlaces (cliente y servidor).
 *
 * - `source-url`: citas que emiten los proveedores (Anthropic: citas de
 *   `web_search`; OpenAI: anotaciones `url_citation`). Requiere `sendSources`.
 * - `tool-web_search`: resultados consultados por la búsqueda nativa.
 * - `tool-webSearch`: búsqueda de la voz (`/api/web-search`).
 */
import type { WebSource } from "./tool-schemas";

type LoosePart = {
  type: string;
  state?: string;
  url?: string;
  title?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
};

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isHttpUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

/** Fuentes de la salida de la búsqueda nativa (formato Anthropic u OpenAI). */
export function nativeWebSearchSources(output: unknown): WebSource[] {
  const sources: WebSource[] = [];
  if (Array.isArray(output)) {
    // Anthropic: [{ type: "web_search_result", url, title, ... }]
    for (const item of output as Array<{ url?: unknown; title?: unknown }>) {
      if (isHttpUrl(item?.url)) {
        sources.push({ url: item.url, title: typeof item.title === "string" ? item.title : undefined });
      }
    }
  } else if (output && typeof output === "object") {
    // OpenAI: { action, sources: [{ type: "url", url }] }
    const list = (output as { sources?: Array<{ type?: string; url?: unknown }> }).sources ?? [];
    for (const item of list) {
      if (isHttpUrl(item?.url)) sources.push({ url: item.url });
    }
    const action = (output as { action?: { type?: string; url?: unknown } }).action;
    if (action?.type === "openPage" && isHttpUrl(action.url)) sources.push({ url: action.url });
  }
  return sources;
}

/** Consulta usada por la búsqueda nativa (si el proveedor la expone). */
export function nativeWebSearchQuery(input: unknown, output: unknown): string | undefined {
  const fromInput = (input as { query?: unknown } | undefined)?.query;
  if (typeof fromInput === "string" && fromInput.trim()) return fromInput;
  const action = (output as { action?: { query?: unknown; queries?: unknown } } | undefined)?.action;
  if (Array.isArray(action?.queries) && action.queries.length) return action.queries.join(" · ");
  if (typeof action?.query === "string") return action.query;
  return undefined;
}

export function isNativeWebSearchPart(part: LoosePart): boolean {
  return part.type === "tool-web_search" || (part.type === "dynamic-tool" && part.toolName === "web_search");
}

/**
 * Fuentes de un mensaje, sin duplicados. Primero las citadas (`source-url`),
 * luego las consultadas por las herramientas.
 */
export function collectMessageSources(parts: ReadonlyArray<{ type: string }>): {
  cited: WebSource[];
  consulted: WebSource[];
} {
  const cited = new Map<string, WebSource>();
  const consulted = new Map<string, WebSource>();
  for (const raw of parts) {
    const part = raw as LoosePart;
    if (part.type === "source-url" && isHttpUrl(part.url)) {
      if (!cited.has(part.url)) cited.set(part.url, { url: part.url, title: part.title || undefined });
    } else if (isNativeWebSearchPart(part) && part.state === "output-available") {
      for (const s of nativeWebSearchSources(part.output)) if (!consulted.has(s.url)) consulted.set(s.url, s);
    } else if (part.type === "tool-webSearch" && part.state === "output-available") {
      const output = part.output as { ok?: boolean; sources?: WebSource[] } | undefined;
      if (output?.ok) for (const s of output.sources ?? []) if (!cited.has(s.url)) cited.set(s.url, s);
    }
  }
  for (const url of cited.keys()) consulted.delete(url);
  return { cited: [...cited.values()], consulted: [...consulted.values()] };
}
