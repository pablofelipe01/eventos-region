import "server-only";
/**
 * Prepara el historial (UIMessages del navegador) antes de convertirlo en
 * mensajes del modelo para un NUEVO turno de texto.
 *
 * - Turnos de voz: ya son mensajes user/assistant normales (transcripciones);
 *   sus herramientas de artefactos/imágenes se conservan como llamadas de
 *   herramienta. La búsqueda de la voz (`webSearch`, que no existe en el chat
 *   de texto) se convierte en una nota de texto con la respuesta y las fuentes.
 * - Búsquedas nativas de turnos anteriores (`web_search`, ejecutadas por
 *   Anthropic/OpenAI) y otras herramientas del proveedor: se reemplazan por una
 *   nota breve. Así el historial funciona aunque el usuario cambie de proveedor
 *   y no reenviamos resultados cifrados/específicos de un proveedor al otro.
 * - Razonamiento de turnos anteriores: se omite (los proveedores no lo
 *   necesitan y en OpenAI evita referencias a items de razonamiento huérfanos).
 * - Herramientas incompletas (stream interrumpido): se omiten.
 */
import { isNativeWebSearchPart, nativeWebSearchQuery, nativeWebSearchSources } from "./sources";
import type { WebSearchOutput } from "./tool-schemas";
import type { RegionUIMessage, RegionUIPart } from "./types";

type LoosePart = { type: string; state?: string; toolName?: string; input?: unknown; output?: unknown; errorText?: string };

const TERMINAL_STATES = new Set(["output-available", "output-error", "output-denied"]);

function note(text: string): RegionUIPart {
  return { type: "text", text, state: "done" };
}

function formatSources(urls: string[]): string {
  return urls.length ? ` Fuentes: ${urls.slice(0, 6).join(", ")}` : "";
}

function convertPart(raw: RegionUIPart): RegionUIPart[] {
  const part = raw as unknown as LoosePart;

  if (part.type === "reasoning") return [];

  if (part.type === "tool-webSearch") {
    if (part.state !== "output-available") return [];
    const output = part.output as WebSearchOutput;
    const query = (part.input as { query?: string } | undefined)?.query ?? "";
    if (!output?.ok) return [note(`[Búsqueda web por voz "${query}" sin resultado: ${output?.error ?? "error"}]`)];
    return [
      note(
        `[Búsqueda web por voz "${output.query}"] ${output.answer}${formatSources(output.sources.map((s) => s.url))}`,
      ),
    ];
  }

  if (isNativeWebSearchPart(part)) {
    if (part.state !== "output-available") return [];
    const query = nativeWebSearchQuery(part.input, part.output);
    const sources = nativeWebSearchSources(part.output).map((s) => s.url);
    return [
      note(
        `[Búsqueda web${query ? ` "${query}"` : ""} realizada en un turno anterior.${formatSources(sources)}]`,
      ),
    ];
  }

  if (part.type === "dynamic-tool") return []; // herramientas internas del proveedor (p. ej. code_execution)

  if (part.type.startsWith("tool-") && !TERMINAL_STATES.has(part.state ?? "")) return [];

  return [raw];
}

export function prepareHistoryForModel(messages: RegionUIMessage[]): RegionUIMessage[] {
  const result: RegionUIMessage[] = [];
  for (const message of messages) {
    const parts = message.parts.flatMap(convertPart);
    const meaningful = parts.some((p) => p.type !== "step-start" && !(p.type === "text" && !p.text.trim()));
    if (meaningful) result.push({ ...message, parts });
  }
  return result;
}
