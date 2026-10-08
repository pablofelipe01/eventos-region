/**
 * Definición compartida de las herramientas de "Región".
 *
 * Un único lugar para nombres, descripciones, esquemas de entrada (zod) y
 * tipos de salida. Lo usan:
 *  - el chat de texto (`tools.ts` → `streamText`): createArtifact, updateArtifact
 *    y generateImage. La búsqueda web del chat es la herramienta NATIVA del
 *    proveedor (`web_search`), definida en `web-search.ts`.
 *  - la sesión de voz (function tools de la Realtime API): las cuatro, incluida
 *    `webSearch`, que se ejecuta en `/api/web-search`.
 *  - el cliente (render de chips y del panel de artefactos),
 *  - `/api/tools` y `/api/web-search` (validación de argumentos de la voz).
 *
 * No contiene secretos ni lógica de servidor: es seguro importarlo en el cliente.
 */
import { z } from "zod";

export const ARTIFACT_KINDS = ["document", "code", "html"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;

export const createArtifactInputSchema = z.object({
  title: z.string().min(1).max(120).describe("Título corto y descriptivo del artefacto."),
  kind: z
    .enum(ARTIFACT_KINDS)
    .describe(
      'Tipo: "document" (texto en Markdown: documentos, tablas, planes), "code" (código fuente) o "html" (página HTML autocontenida con CSS/JS inline).',
    ),
  language: z
    .string()
    .max(40)
    .optional()
    .describe('Solo para kind="code": lenguaje, por ejemplo "python", "typescript", "sql".'),
  content: z.string().min(1).describe("Contenido completo del artefacto."),
});
export type CreateArtifactInput = z.infer<typeof createArtifactInputSchema>;

export const updateArtifactInputSchema = z.object({
  artifactId: z.string().min(1).describe("Id del artefacto a actualizar (lo devolvió createArtifact)."),
  content: z
    .string()
    .min(1)
    .describe("Nuevo contenido COMPLETO del artefacto (reemplaza el anterior)."),
  title: z.string().min(1).max(120).optional().describe("Nuevo título, solo si cambia."),
  changeSummary: z
    .string()
    .max(200)
    .optional()
    .describe("Resumen breve de qué cambió en esta versión."),
});
export type UpdateArtifactInput = z.infer<typeof updateArtifactInputSchema>;

export const generateImageInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(4000)
    .describe("Descripción detallada de la imagen (sujeto, estilo, composición, colores, texto si lo hay)."),
  size: z
    .enum(IMAGE_SIZES)
    .optional()
    .describe("Tamaño: cuadrado 1024x1024 (por defecto), horizontal 1536x1024 o vertical 1024x1536."),
});
export type GenerateImageInput = z.infer<typeof generateImageInputSchema>;

export const webSearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(400)
    .describe("Pregunta o consulta concreta, con el contexto necesario (lugar, fechas)."),
});
export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

/* ------------------------------------------------------------------ */
/* Salidas                                                             */
/* ------------------------------------------------------------------ */

export type ToolFailure = { ok: false; error: string; code?: string };

export type ArtifactToolOutput =
  | {
      ok: true;
      artifactId: string;
      title: string;
      kind: ArtifactKind;
      language?: string;
      version: number;
    }
  | ToolFailure;

export type GenerateImageOutput =
  | {
      ok: true;
      prompt: string;
      model: string;
      mediaType: string;
      /** data:URL de la imagen. Se omite al reenviar el historial al servidor. */
      dataUrl?: string;
      omitted?: boolean;
    }
  | ToolFailure;

export type WebSource = { url: string; title?: string };

/** Resultado de la búsqueda web de la voz (`/api/web-search`). */
export type WebSearchOutput =
  | {
      ok: true;
      query: string;
      /** Respuesta breve, pensada para leerse en voz alta. */
      answer: string;
      sources: WebSource[];
      model: string;
    }
  | ToolFailure;

/* ------------------------------------------------------------------ */
/* Metadatos de herramientas                                           */
/* ------------------------------------------------------------------ */

export const TOOL_DESCRIPTIONS = {
  createArtifact:
    "Crea un artefacto (documento Markdown, código o página HTML) que el usuario ve en el panel lateral. Úsalo para cualquier entregable de más de ~15 líneas. Devuelve el artifactId para futuras actualizaciones.",
  updateArtifact:
    "Actualiza un artefacto existente con su contenido completo nuevo. Úsalo cuando el usuario pida cambios a algo ya creado, en lugar de crear uno nuevo.",
  generateImage:
    "Genera una imagen a partir de una descripción de texto y la muestra al usuario en el chat.",
  webSearch:
    "Busca en la web información actual o que no sepas con certeza. Devuelve una respuesta breve y las fuentes (URLs) para citarlas.",
} as const;

export type RegionToolName = keyof typeof TOOL_DESCRIPTIONS;

export const TOOL_INPUT_SCHEMAS = {
  createArtifact: createArtifactInputSchema,
  updateArtifact: updateArtifactInputSchema,
  generateImage: generateImageInputSchema,
  webSearch: webSearchInputSchema,
} as const;

/** Herramientas de función del chat de texto (la búsqueda web es nativa del proveedor). */
export const TEXT_FUNCTION_TOOLS = ["createArtifact", "updateArtifact", "generateImage"] as const;

/**
 * Herramientas que la voz ejecuta en el servidor y su endpoint. Las de
 * artefactos se ejecutan en el navegador (mismo estado que el chat de texto).
 */
export const SERVER_TOOL_ENDPOINTS = {
  generateImage: "/api/tools",
  webSearch: "/api/web-search",
} as const;
export type ServerExecutedToolName = keyof typeof SERVER_TOOL_ENDPOINTS;
export const SERVER_EXECUTED_TOOLS = Object.keys(SERVER_TOOL_ENDPOINTS) as ServerExecutedToolName[];

export function isServerExecutedTool(name: string): name is ServerExecutedToolName {
  return Object.prototype.hasOwnProperty.call(SERVER_TOOL_ENDPOINTS, name);
}

/** Nombre de la herramienta nativa de búsqueda web en el chat de texto (ambos proveedores). */
export const NATIVE_WEB_SEARCH_TOOL = "web_search";

export function isRegionToolName(name: string): name is RegionToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_DESCRIPTIONS, name);
}

/** Etiquetas de UI (en español) para los chips de estado. */
export const TOOL_LABELS: Record<RegionToolName, { running: string; done: string }> = {
  createArtifact: { running: "Creando artefacto…", done: "Artefacto creado" },
  updateArtifact: { running: "Actualizando artefacto…", done: "Artefacto actualizado" },
  generateImage: { running: "Generando imagen…", done: "Imagen generada" },
  webSearch: { running: "Buscando en la web…", done: "Búsqueda web" },
};

/**
 * Definiciones de function tools para la OpenAI Realtime API
 * (`session.tools`), derivadas de los mismos esquemas zod que usa el chat.
 */
export function getRealtimeToolDefinitions() {
  return (Object.keys(TOOL_INPUT_SCHEMAS) as RegionToolName[]).map((name) => {
    const { $schema: _ignored, ...parameters } = z.toJSONSchema(TOOL_INPUT_SCHEMAS[name]) as Record<
      string,
      unknown
    >;
    void _ignored;
    return {
      type: "function" as const,
      name,
      description: TOOL_DESCRIPTIONS[name],
      parameters,
    };
  });
}
