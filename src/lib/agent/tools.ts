import "server-only";
/**
 * Implementación de servidor de las herramientas de "Región".
 * - `createChatTools`: ToolSet para `streamText` (chat de texto).
 * - `runServerTool`: ejecuta las herramientas de servidor pedidas por la voz
 *   (`/api/tools`), con las mismas funciones que usa el chat.
 */
import { tool, type JSONValue } from "ai";
import { ArtifactRegistry } from "./artifacts";
import { runGenerateImage } from "./image";
import {
  TOOL_DESCRIPTIONS,
  TOOL_INPUT_SCHEMAS,
  type GenerateImageOutput,
  type ServerExecutedToolName,
} from "./tool-schemas";
import { runWebSearch } from "./web-search";

function imageOutputForModel(output: GenerateImageOutput): JSONValue {
  if (!output.ok) return { ok: false, error: output.error, code: output.code ?? null };
  return {
    ok: true,
    note: "La imagen ya se muestra al usuario en el chat; no la describas en exceso.",
    prompt: output.prompt,
    model: output.model,
  };
}

/**
 * Crea el set de herramientas para un turno de chat. `registry` contiene los
 * artefactos ya existentes en la conversación (derivados del historial), para
 * que `updateArtifact` pueda validar el id.
 */
export function createChatTools(registry: ArtifactRegistry) {
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
    webSearch: tool({
      description: TOOL_DESCRIPTIONS.webSearch,
      inputSchema: TOOL_INPUT_SCHEMAS.webSearch,
      execute: async (input, { abortSignal }) => runWebSearch(input, abortSignal),
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
      return runWebSearch(parsed.data, signal);
    }
  }
}
