import {
  APICallError,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
} from "ai";
import { z } from "zod";
import { ArtifactRegistry } from "@/lib/agent/artifacts";
import { CHAT_MODELS, isProviderId, MAX_AGENT_STEPS } from "@/lib/agent/config";
import { prepareHistoryForModel } from "@/lib/agent/history";
import { getDefaultProvider, getLanguageModel, MissingApiKeyError } from "@/lib/agent/models";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { TOOL_INPUT_SCHEMAS } from "@/lib/agent/tool-schemas";
import { createChatTools } from "@/lib/agent/tools";
import type { RegionUIMessage } from "@/lib/agent/types";
import { jsonError, readJson, rejectCrossOrigin } from "@/lib/http";
import { errorMessage, redactSecrets } from "@/lib/redact";

// Con Fluid Compute, Vercel permite hasta 300 s en todos los planes (Hobby incluido).
// Un turno con varias herramientas (p. ej. generar una imagen) puede superar 60 s.
export const maxDuration = 300;

const TOOLS_NOTE = `Notas sobre herramientas:
- La búsqueda web es la herramienta nativa web_search del proveedor: úsala para datos actuales y cita las fuentes con enlaces.
- Parte del historial puede venir de la conversación por voz (transcripciones de lo hablado y artefactos creados por voz): es el mismo hilo, continúalo con naturalidad.`;

function friendlyStreamError(error: unknown): string {
  console.error("[api/chat] stream error", error);
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ? ` (${error.statusCode})` : "";
    if (error.statusCode === 401 || error.statusCode === 403) {
      return `El proveedor rechazó la clave de API${status}. Revisa la variable de entorno.`;
    }
    if (error.statusCode === 429) {
      return `El proveedor está limitando las peticiones${status}. Intenta de nuevo en un momento.`;
    }
    return `Error del proveedor del modelo${status}: ${redactSecrets(error.message)}`;
  }
  return `Ocurrió un error al generar la respuesta: ${errorMessage(error)}`;
}

export async function POST(request: Request) {
  const forbidden = rejectCrossOrigin(request);
  if (forbidden) return forbidden;

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const body = (parsed.body ?? {}) as { messages?: unknown; provider?: unknown };

  const provider = isProviderId(body.provider) ? body.provider : getDefaultProvider();

  let model;
  try {
    model = getLanguageModel(provider);
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return jsonError(500, error.code, error.message, {
        provider,
        envKey: error.envKey,
      });
    }
    throw error;
  }

  const validation = await safeValidateUIMessages<RegionUIMessage>({
    messages: body.messages,
    tools: {
      createArtifact: { inputSchema: TOOL_INPUT_SCHEMAS.createArtifact },
      updateArtifact: { inputSchema: TOOL_INPUT_SCHEMAS.updateArtifact },
      generateImage: { inputSchema: TOOL_INPUT_SCHEMAS.generateImage },
      // Búsqueda de la voz (solo aparece en el historial).
      webSearch: { inputSchema: TOOL_INPUT_SCHEMAS.webSearch },
      // Búsqueda nativa del proveedor: su entrada la define Anthropic/OpenAI.
      web_search: { inputSchema: z.any() },
    },
  });
  if (!validation.success) {
    return jsonError(400, "invalid_messages", `Mensajes inválidos: ${validation.error.message}`);
  }
  const messages = validation.data;

  const registry = ArtifactRegistry.fromMessages(messages);
  const tools = createChatTools(registry, provider);

  const existingArtifacts = registry.list();
  const instructions = [
    SYSTEM_PROMPT,
    TOOLS_NOTE,
    existingArtifacts.length
      ? `Artefactos existentes en esta conversación (usa su id con updateArtifact):\n${existingArtifacts
          .map((a) => `- ${a.id}: "${a.title}" (${a.kind}${a.language ? `/${a.language}` : ""}, v${a.version})`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Voz y texto comparten hilo: los turnos de voz llegan como mensajes normales.
  const modelMessages = await convertToModelMessages(prepareHistoryForModel(messages), {
    tools,
    ignoreIncompleteToolCalls: true,
  });

  const result = streamText({
    model,
    instructions,
    messages: modelMessages,
    tools,
    stopWhen: isStepCount(MAX_AGENT_STEPS),
    abortSignal: request.signal,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<typeof tools, RegionUIMessage>({
      stream: result.stream,
      tools,
      originalMessages: messages,
      // Citas de la búsqueda nativa (Anthropic) y `url_citation` (OpenAI) → partes `source-url`.
      sendSources: true,
      messageMetadata: ({ part }) =>
        part.type === "start" ? { source: "text", provider } : undefined,
      onError: friendlyStreamError,
    }),
    headers: { "X-Region-Model": CHAT_MODELS[provider].id },
  });
}
