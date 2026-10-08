/**
 * Definición compartida de las herramientas de "Región".
 *
 * Un único lugar para nombres, descripciones, esquemas de entrada (zod) y
 * tipos de salida. Lo usan:
 *  - el chat de texto (`tools.ts` → `streamText`),
 *  - la sesión de voz (definiciones de function tools para la Realtime API),
 *  - el cliente (render de chips y del panel de artefactos),
 *  - `/api/tools` (validación de argumentos que llegan desde la voz).
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
  query: z.string().min(1).max(400).describe("Consulta de búsqueda, concreta y en el idioma más útil."),
  maxResults: z.number().int().min(1).max(8).optional().describe("Número de resultados (1-8, por defecto 5)."),
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

export type WebSearchResult = { title: string; url: string; snippet: string };

export type WebSearchOutput =
  | {
      ok: true;
      provider: string;
      query: string;
      answer?: string;
      results: WebSearchResult[];
    }
  | (ToolFailure & { configured?: boolean });

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
    "Busca en la web información actual o que no sepas con certeza. Devuelve títulos, URLs y fragmentos para citar las fuentes.",
} as const;

export type RegionToolName = keyof typeof TOOL_DESCRIPTIONS;

export const TOOL_INPUT_SCHEMAS = {
  createArtifact: createArtifactInputSchema,
  updateArtifact: updateArtifactInputSchema,
  generateImage: generateImageInputSchema,
  webSearch: webSearchInputSchema,
} as const;

/** Herramientas que la voz ejecuta en el servidor vía `/api/tools`. */
export const SERVER_EXECUTED_TOOLS = ["generateImage", "webSearch"] as const;
export type ServerExecutedToolName = (typeof SERVER_EXECUTED_TOOLS)[number];

export function isServerExecutedTool(name: string): name is ServerExecutedToolName {
  return (SERVER_EXECUTED_TOOLS as readonly string[]).includes(name);
}

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
