/**
 * Utilidades de mensajes para el cliente (sin secretos, sin dependencias de servidor).
 */
import { collectArtifacts } from "./artifacts";
import type { RegionUIMessage, RegionUIPart } from "./types";

/**
 * Prepara el historial antes de enviarlo a /api/chat:
 * - quita el base64 de las imágenes generadas (el modelo no lo necesita y
 *   evita superar el límite de 4,5 MB por petición de Vercel) y de las fotos
 *   del usuario de turnos anteriores,
 * - elimina partes de texto vacías (p. ej. transcripciones de voz pendientes),
 *   que algunos proveedores rechazan,
 * - elimina herramientas sin terminar (stream detenido o herramienta de voz en
 *   curso) y el contenido cifrado de las búsquedas nativas (el servidor las
 *   resume como nota; no hace falta reenviarlo).
 */
const TERMINAL_TOOL_STATES = new Set(["output-available", "output-error", "output-denied"]);

export function sanitizeMessagesForRequest(messages: RegionUIMessage[]): RegionUIMessage[] {
  const result: RegionUIMessage[] = [];
  const lastId = messages.at(-1)?.id;
  for (const message of messages) {
    const parts = message.parts
      .filter((part) => !(part.type === "text" && part.text.trim() === ""))
      .filter((part) => {
        const isTool = part.type.startsWith("tool-") || part.type === "dynamic-tool";
        return !isTool || TERMINAL_TOOL_STATES.has((part as { state?: string }).state ?? "");
      })
      .map((part): RegionUIPart => {
        if (part.type === "tool-web_search" && part.state === "output-available" && Array.isArray(part.output)) {
          return {
            ...part,
            output: part.output.map((r) => ({ type: r.type, url: r.url, title: r.title })),
          };
        }
        if (
          part.type === "tool-generateImage" &&
          part.state === "output-available" &&
          part.output.ok &&
          part.output.dataUrl
        ) {
          return { ...part, output: { ...part.output, dataUrl: undefined, omitted: true } };
        }
        // La foto del usuario solo viaja en el turno en que se tomó (el modelo ya la vio).
        if (
          part.type === "tool-takePhoto" &&
          part.state === "output-available" &&
          part.output.ok &&
          part.output.dataUrl &&
          message.id !== lastId
        ) {
          return { ...part, output: { ...part.output, dataUrl: undefined, omitted: true } };
        }
        return part;
      });
    if (parts.length > 0) result.push({ ...message, parts });
  }
  return result;
}

/** Texto plano de un mensaje (solo partes de texto). */
export function messageText(message: RegionUIMessage): string {
  return message.parts
    .filter((p): p is Extract<RegionUIPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

/**
 * Resumen corto de la conversación reciente para iniciar la sesión de voz:
 * últimos mensajes de texto + artefactos existentes (con id, para que la voz
 * pueda actualizarlos).
 */
export function buildVoiceContext(messages: RegionUIMessage[], maxChars = 4000): string {
  const lines: string[] = [];
  for (const message of messages.slice(-12)) {
    const text = messageText(message);
    if (!text) continue;
    const who = message.role === "user" ? "Usuario" : "Región";
    lines.push(`${who}: ${text.length > 600 ? `${text.slice(0, 600)}…` : text}`);
  }

  const artifacts = collectArtifacts(messages);
  if (artifacts.length) {
    lines.push(
      "",
      "Artefactos existentes (usa su id con updateArtifact):",
      ...artifacts.map((a) => `- ${a.id}: "${a.title}" (${a.kind}, v${a.version})`),
    );
  }

  const text = lines.join("\n");
  return text.length > maxChars ? text.slice(-maxChars) : text;
}

/** Extrae un mensaje legible de los errores de useChat / fetch. */
export function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // no es JSON
  }
  return raw || "Ocurrió un error inesperado.";
}

/* ------------------------------------------------------------------ */
/* Actualizaciones inmutables de mensajes para la voz                  */
/* ------------------------------------------------------------------ */

function updateMessage(
  messages: RegionUIMessage[],
  id: string,
  create: () => RegionUIMessage,
  update: (message: RegionUIMessage) => RegionUIMessage,
): RegionUIMessage[] {
  const index = messages.findIndex((m) => m.id === id);
  if (index === -1) return [...messages, update(create())];
  const next = messages.slice();
  next[index] = update(messages[index]);
  return next;
}

function setText(message: RegionUIMessage, text: string, append: boolean): RegionUIMessage {
  const parts = message.parts.slice();
  const textIndex = parts.findIndex((p) => p.type === "text");
  if (textIndex === -1) {
    parts.push({ type: "text", text, state: append ? "streaming" : "done" });
  } else {
    const current = parts[textIndex] as Extract<RegionUIPart, { type: "text" }>;
    parts[textIndex] = {
      ...current,
      text: append ? current.text + text : text,
      state: append ? "streaming" : "done",
    };
  }
  return { ...message, parts };
}

export const voiceMessages = {
  userId: (itemId: string) => `voice_user_${itemId}`,
  assistantId: (responseId: string) => `voice_assistant_${responseId}`,

  /** Inserta (o actualiza) el mensaje del usuario transcrito. */
  setUserText(
    messages: RegionUIMessage[],
    itemId: string,
    text: string,
    mode: "placeholder" | "delta" | "final",
  ): RegionUIMessage[] {
    return updateMessage(
      messages,
      voiceMessages.userId(itemId),
      () => ({ id: voiceMessages.userId(itemId), role: "user", parts: [], metadata: { source: "voice" } }),
      (message) => {
        if (mode === "placeholder") return message.parts.length ? message : setText(message, "", true);
        return setText(message, text, mode === "delta");
      },
    );
  },

  /** Añade texto (transcripción del audio del asistente) a la respuesta. */
  setAssistantText(
    messages: RegionUIMessage[],
    responseId: string,
    text: string,
    mode: "delta" | "final",
  ): RegionUIMessage[] {
    return updateMessage(
      messages,
      voiceMessages.assistantId(responseId),
      () => ({
        id: voiceMessages.assistantId(responseId),
        role: "assistant",
        parts: [],
        metadata: { source: "voice" },
      }),
      (message) => setText(message, text, mode === "delta"),
    );
  },

  /**
   * Cierra la respuesta de voz: marca el texto como terminado y, si el usuario
   * la interrumpió (barge-in), lo indica en los metadatos.
   */
  finishAssistant(messages: RegionUIMessage[], responseId: string, interrupted: boolean): RegionUIMessage[] {
    const id = voiceMessages.assistantId(responseId);
    const index = messages.findIndex((m) => m.id === id);
    if (index === -1) return messages;
    const message = messages[index];
    const next = messages.slice();
    next[index] = {
      ...message,
      parts: message.parts.map((p) => (p.type === "text" ? { ...p, state: "done" as const } : p)),
      metadata: { ...message.metadata, source: "voice", ...(interrupted ? { interrupted: true } : {}) },
    };
    return next;
  },

  /** Inserta o reemplaza una parte de herramienta (por toolCallId). */
  upsertToolPart(messages: RegionUIMessage[], responseId: string, part: RegionUIPart): RegionUIMessage[] {
    if (!("toolCallId" in part)) return messages;
    return updateMessage(
      messages,
      voiceMessages.assistantId(responseId),
      () => ({
        id: voiceMessages.assistantId(responseId),
        role: "assistant",
        parts: [],
        metadata: { source: "voice" },
      }),
      (message) => {
        const parts = message.parts.slice();
        const index = parts.findIndex((p) => "toolCallId" in p && p.toolCallId === part.toolCallId);
        if (index === -1) parts.push(part);
        else parts[index] = part;
        return { ...message, parts };
      },
    );
  },
};
