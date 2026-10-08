import "server-only";
/**
 * Implementación de servidor de las herramientas de "Región".
 * - `createChatTools`: ToolSet para `streamText` (chat de texto), con la
 *   búsqueda web nativa del proveedor elegido.
 * - `runServerTool`: ejecuta las herramientas de servidor pedidas por la voz
 *   (`/api/tools`, `/api/web-search`), con las mismas funciones que usa el chat.
 */
import { tool, type JSONValue, type Tool } from "ai";
import { ArtifactRegistry } from "./artifacts";
import type { ProviderId } from "./config";
import { runGenerateImage } from "./image";
import {
  TOOL_DESCRIPTIONS,
  TOOL_INPUT_SCHEMAS,
  type GenerateImageOutput,
  type ServerExecutedToolName,
  type TakePhotoOutput,
} from "./tool-schemas";
import { createNativeWebSearchTool, runVoiceWebSearch } from "./web-search";

type ToolResultOutput = Awaited<ReturnType<NonNullable<Tool["toModelOutput"]>>>;

function imageOutputForModel(output: GenerateImageOutput): JSONValue {
  if (!output.ok) return { ok: false, error: output.error, code: output.code ?? null };
  return {
    ok: true,
    note: "La imagen ya se muestra al usuario en el chat; no la describas en exceso.",
    prompt: output.prompt,
    model: output.model,
  };
}

/** La foto del usuario va al modelo como imagen (solo en el turno en que se tomó). */
function photoOutputForModel(output: TakePhotoOutput): ToolResultOutput {
  if (!output?.ok) return { type: "json", value: { ok: false, error: output?.error ?? "Sin foto.", code: output?.code ?? null } };
  const match = output.dataUrl ? /^data:([^;]+);base64,(.+)$/.exec(output.dataUrl) : null;
  if (!match) {
    return {
      type: "text",
      value: "El usuario tomó una foto en un turno anterior; ya no está disponible. Si la necesitas otra vez, pídela.",
    };
  }
  return {
    type: "content",
    value: [
      { type: "text", text: `Foto del usuario (${output.width}x${output.height}):` },
      { type: "file", mediaType: match[1], data: { type: "data", data: match[2] } },
    ],
  };
}

/**
 * Crea el set de herramientas para un turno de chat. `registry` contiene los
 * artefactos ya existentes en la conversación (derivados del historial), para
 * que `updateArtifact` pueda validar el id.
 */
export function createChatTools(registry: ArtifactRegistry, provider: ProviderId) {
  return {
    createArtifact: tool({
      description: TOOL_DESCRIPTIONS.createArtifact,
      inputSchema: TOOL_INPUT_SCHEMAS.createArtifact,
      execute: async (input) => registry.create(input),
    }),
    updateArtifact: tool({
      description: TOOL_DESCRIPTIONS.updateArtifact,
      inputSchema: TOOL_INPUT_SCHEMAS.updateArtifact,
      execute: async (input) => registry.update(input),
    }),
    generateImage: tool({
      description: TOOL_DESCRIPTIONS.generateImage,
      inputSchema: TOOL_INPUT_SCHEMAS.generateImage,
      execute: async (input, { abortSignal }) => runGenerateImage(input, abortSignal),
      // El modelo no necesita (ni debe recibir) el base64 de la imagen.
      toModelOutput: ({ output }) => ({ type: "json", value: imageOutputForModel(output) }),
    }),
    // Búsqueda web nativa del proveedor (la ejecuta Anthropic u OpenAI, no este servidor).
    web_search: createNativeWebSearchTool(provider),
    // Dispositivo del usuario: sin `execute`. El navegador las ejecuta
    // (`onToolCall` / tarjetas con botón) y reenvía el resultado.
    getLocation: tool({ description: TOOL_DESCRIPTIONS.getLocation, inputSchema: TOOL_INPUT_SCHEMAS.getLocation }),
    getDeviceInfo: tool({ description: TOOL_DESCRIPTIONS.getDeviceInfo, inputSchema: TOOL_INPUT_SCHEMAS.getDeviceInfo }),
    copyToClipboard: tool({
      description: TOOL_DESCRIPTIONS.copyToClipboard,
      inputSchema: TOOL_INPUT_SCHEMAS.copyToClipboard,
    }),
    openOnDevice: tool({ description: TOOL_DESCRIPTIONS.openOnDevice, inputSchema: TOOL_INPUT_SCHEMAS.openOnDevice }),
    shareContent: tool({ description: TOOL_DESCRIPTIONS.shareContent, inputSchema: TOOL_INPUT_SCHEMAS.shareContent }),
    takePhoto: tool({
      description: TOOL_DESCRIPTIONS.takePhoto,
      inputSchema: TOOL_INPUT_SCHEMAS.takePhoto,
      toModelOutput: ({ output }) => photoOutputForModel(output as TakePhotoOutput),
    }),
    // Roadmap (no implementadas en v1): ver ./roadmap.ts → runCode, saveFile, remember.
  };
}

export type ChatTools = ReturnType<typeof createChatTools>;

function invalidArguments(name: string, error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }) {
  return {
    ok: false as const,
    code: "invalid_arguments",
    error: `Argumentos inválidos para ${name}: ${error.issues
      .map((i) => `${i.path.map(String).join(".") || "(raíz)"}: ${i.message}`)
      .join("; ")}`,
  };
}

/** Ejecuta una herramienta de servidor validando sus argumentos con zod. */
export async function runServerTool(
  name: ServerExecutedToolName,
  rawArgs: unknown,
  signal?: AbortSignal,
) {
  switch (name) {
    case "generateImage": {
      const parsed = TOOL_INPUT_SCHEMAS.generateImage.safeParse(rawArgs);
      if (!parsed.success) return invalidArguments(name, parsed.error);
      return runGenerateImage(parsed.data, signal);
    }
    case "webSearch": {
      const parsed = TOOL_INPUT_SCHEMAS.webSearch.safeParse(rawArgs);
      if (!parsed.success) return invalidArguments(name, parsed.error);
      return runVoiceWebSearch(parsed.data, signal);
    }
  }
}
