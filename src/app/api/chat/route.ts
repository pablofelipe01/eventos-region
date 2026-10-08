import {
  APICallError,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
} from "ai";
import { ArtifactRegistry } from "@/lib/agent/artifacts";
import { CHAT_MODELS, isProviderId, MAX_AGENT_STEPS } from "@/lib/agent/config";
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
      webSearch: { inputSchema: TOOL_INPUT_SCHEMAS.webSearch },
    },
  });
  if (!validation.success) {
    return jsonError(400, "invalid_messages", `Mensajes inválidos: ${validation.error.message}`);
  }
  const messages = validation.data;

  const registry = ArtifactRegistry.fromMessages(messages);
  const tools = createChatTools(registry);

  const existingArtifacts = registry.list();
  const instructions = existingArtifacts.length
    ? `${SYSTEM_PROMPT}\n\nArtefactos existentes en esta conversación (usa su id con updateArtifact):\n${existingArtifacts
        .map((a) => `- ${a.id}: "${a.title}" (${a.kind}${a.language ? `/${a.language}` : ""}, v${a.version})`)
        .join("\n")}`
    : SYSTEM_PROMPT;

  const result = streamText({
    model,
    instructions,
    messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(MAX_AGENT_STEPS),
    abortSignal: request.signal,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<typeof tools, RegionUIMessage>({
      stream: result.stream,
      tools,
      originalMessages: messages,
      messageMetadata: ({ part }) =>
        part.type === "start" ? { source: "text", provider } : undefined,
      onError: friendlyStreamError,
    }),
    headers: { "X-Region-Model": CHAT_MODELS[provider].id },
  });
}
