/**
 * Definición compartida de las herramientas de "Región".
 *
 * Un único lugar para nombres, descripciones, esquemas de entrada (zod) y
 * tipos de salida. Lo usan:
 *  - el chat de texto (`tools.ts` → `streamText`): createArtifact, updateArtifact
 *    y generateImage. La búsqueda web del chat es la herramienta NATIVA del
 *    proveedor (`web_search`), definida en `web-search.ts`.
 *  - la sesión de voz (function tools de la Realtime API): todas, incluida
 *    `webSearch`, que se ejecuta en `/api/web-search`.
 *  - las herramientas del dispositivo (ubicación, abrir apps, cámara…): no
 *    tienen `execute` en el servidor; las ejecuta el navegador
 *    (`src/lib/device/device-actions.ts`) en el chat y en la voz.
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
/* Herramientas del dispositivo (se ejecutan en el navegador)          */
/* ------------------------------------------------------------------ */

export const getLocationInputSchema = z.object({
  highAccuracy: z
    .boolean()
    .optional()
    .describe("true (por defecto) usa el GPS para la máxima precisión; false es más rápido y gasta menos batería."),
});
export type GetLocationInput = z.infer<typeof getLocationInputSchema>;

export const getDeviceInfoInputSchema = z.object({});
export type GetDeviceInfoInput = z.infer<typeof getDeviceInfoInputSchema>;

export const copyToClipboardInputSchema = z.object({
  text: z.string().min(1).max(20_000).describe("Texto que se copia al portapapeles del dispositivo."),
});
export type CopyToClipboardInput = z.infer<typeof copyToClipboardInputSchema>;

export const OPEN_ACTIONS = [
  "maps",
  "directions",
  "earth",
  "call",
  "sms",
  "whatsapp",
  "email",
  "calendar",
  "url",
] as const;
export type OpenAction = (typeof OPEN_ACTIONS)[number];

export const TRAVEL_MODES = ["driving", "walking", "bicycling", "transit"] as const;

export const openOnDeviceInputSchema = z.object({
  action: z
    .enum(OPEN_ACTIONS)
    .describe(
      'Qué abrir: "maps" (Google Maps en un lugar o coordenada), "directions" (ruta en Google Maps), "earth" (Google Earth), "call" (llamada), "sms", "whatsapp", "email", "calendar" (crear evento en Google Calendar) o "url" (página web https).',
    ),
  query: z
    .string()
    .max(300)
    .optional()
    .describe('maps/earth: lugar o dirección a buscar (p. ej. "Parque Arví, Medellín"). Alternativa a latitude/longitude.'),
  latitude: z.number().min(-90).max(90).optional().describe("maps/earth: latitud en grados decimales."),
  longitude: z.number().min(-180).max(180).optional().describe("maps/earth: longitud en grados decimales."),
  origin: z
    .string()
    .max(300)
    .optional()
    .describe('directions: origen ("lat,lng" o dirección). Si se omite, Google Maps usa la ubicación actual.'),
  destination: z.string().max(300).optional().describe('directions: destino ("lat,lng" o dirección).'),
  travelMode: z.enum(TRAVEL_MODES).optional().describe("directions: medio de transporte (por defecto driving)."),
  phone: z
    .string()
    .max(30)
    .optional()
    .describe("call/sms/whatsapp: número con indicativo de país si se conoce (p. ej. +573001234567)."),
  text: z
    .string()
    .max(4000)
    .optional()
    .describe("sms/whatsapp: mensaje prellenado. email: cuerpo. calendar: descripción del evento."),
  to: z.string().max(300).optional().describe("email: destinatario(s), separados por comas."),
  subject: z.string().max(300).optional().describe("email: asunto."),
  title: z.string().max(200).optional().describe("calendar: título del evento."),
  start: z
    .string()
    .max(40)
    .optional()
    .describe('calendar: inicio en ISO 8601 con zona horaria ("2026-10-10T15:00:00-05:00") o solo fecha ("2026-10-10") para todo el día.'),
  end: z.string().max(40).optional().describe("calendar: fin en ISO 8601 (por defecto, una hora después del inicio)."),
  location: z.string().max(300).optional().describe("calendar: lugar del evento."),
  url: z.string().max(2000).optional().describe("url: dirección https completa."),
});
export type OpenOnDeviceInput = z.infer<typeof openOnDeviceInputSchema>;

export const shareContentInputSchema = z.object({
  title: z.string().max(200).optional().describe("Título de lo que se comparte."),
  text: z.string().max(4000).optional().describe("Texto a compartir."),
  url: z.string().max(2000).optional().describe("Enlace https a compartir."),
});
export type ShareContentInput = z.infer<typeof shareContentInputSchema>;

export const takePhotoInputSchema = z.object({
  camera: z
    .enum(["back", "front"])
    .optional()
    .describe('Cámara sugerida: "back" (trasera, por defecto) o "front" (frontal, selfie).'),
  reason: z
    .string()
    .max(200)
    .optional()
    .describe('Para qué necesitas la foto, en una frase corta que verá el usuario (p. ej. "para leer la etiqueta").'),
});
export type TakePhotoInput = z.infer<typeof takePhotoInputSchema>;

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

export type LocationOutput =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      /** Radio de incertidumbre (metros, 95 %). */
      accuracyMeters: number;
      altitudeMeters: number | null;
      headingDegrees: number | null;
      speedMetersPerSecond: number | null;
      /** Momento de la lectura (ISO 8601). */
      timestamp: string;
      mapsUrl: string;
    }
  | ToolFailure;

export type DeviceInfoOutput =
  | {
      ok: true;
      deviceType: "mobile" | "tablet" | "desktop";
      os: string;
      browser: string;
      language: string;
      timeZone: string;
      localTime: string;
      online: boolean;
      connection: string | null;
      battery: { levelPercent: number; charging: boolean } | null;
      screen: { width: number; height: number; pixelRatio: number; orientation: string | null };
      colorScheme: "dark" | "light";
      touch: boolean;
      cpuCores: number | null;
      memoryGb: number | null;
      /** Qué puede hacer Región en este navegador. */
      capabilities: Record<string, boolean>;
    }
  | ToolFailure;

/** Resultado de copiar, abrir o compartir algo en el dispositivo. */
export type DeviceActionOutput =
  | {
      ok: true;
      /** Descripción de lo que se hizo (p. ej. "Abrir Google Maps: Parque Arví"). */
      summary: string;
      href?: string;
      note?: string;
    }
  | ToolFailure;

export type TakePhotoOutput =
  | {
      ok: true;
      mediaType: string;
      width: number;
      height: number;
      /** data:URL de la foto. Se omite al reenviar turnos antiguos al servidor. */
      dataUrl?: string;
      omitted?: boolean;
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
  getLocation:
    "Obtiene la ubicación actual del dispositivo del usuario con su GPS (latitud, longitud, precisión en metros, altitud, rumbo y velocidad si están disponibles) y un enlace de Google Maps. Úsala cuando el usuario pregunte dónde está, pida sus coordenadas o algo cercano a él. El navegador puede pedirle permiso la primera vez.",
  getDeviceInfo:
    "Lee información del dispositivo del usuario: tipo (celular, tableta, computador), sistema operativo, navegador, idioma, zona horaria y hora local, conexión, batería, pantalla y qué capacidades están disponibles.",
  copyToClipboard: "Copia un texto al portapapeles del dispositivo del usuario.",
  openOnDevice:
    "Abre en el dispositivo del usuario otra app o página: Google Maps (lugar, coordenada o ruta), Google Earth, una llamada, un SMS o WhatsApp con el mensaje prellenado, un correo, un evento de Google Calendar o una página web. Se muestra un botón y se abre cuando el usuario lo toca (así lo exige el navegador): avísale que lo toque. No puede leer ni manejar lo que pasa dentro de la otra app.",
  shareContent:
    "Abre el menú nativo de compartir del dispositivo (WhatsApp, correo, redes, etc.) con un texto o enlace. Se ejecuta cuando el usuario toca el botón que aparece en pantalla.",
  takePhoto:
    "Le pide al usuario una foto con la cámara de su dispositivo (o una imagen de su galería) y te la entrega para que la veas y la analices. Aparece un botón y el usuario toma la foto; avísale qué necesitas ver.",
} as const;

export type RegionToolName = keyof typeof TOOL_DESCRIPTIONS;

export const TOOL_INPUT_SCHEMAS = {
  createArtifact: createArtifactInputSchema,
  updateArtifact: updateArtifactInputSchema,
  generateImage: generateImageInputSchema,
  webSearch: webSearchInputSchema,
  getLocation: getLocationInputSchema,
  getDeviceInfo: getDeviceInfoInputSchema,
  copyToClipboard: copyToClipboardInputSchema,
  openOnDevice: openOnDeviceInputSchema,
  shareContent: shareContentInputSchema,
  takePhoto: takePhotoInputSchema,
} as const;

/** Herramientas de función del chat de texto (la búsqueda web es nativa del proveedor). */
export const TEXT_FUNCTION_TOOLS = [
  "createArtifact",
  "updateArtifact",
  "generateImage",
  "getLocation",
  "getDeviceInfo",
  "copyToClipboard",
  "openOnDevice",
  "shareContent",
  "takePhoto",
] as const;

/**
 * Herramientas que se ejecutan en el navegador, sobre el dispositivo del
 * usuario (chat y voz). Las interactivas esperan a que el usuario toque un
 * botón: es su confirmación y, además, los navegadores solo permiten abrir
 * otras apps, compartir o usar la cámara a partir de un gesto del usuario.
 */
export const DEVICE_TOOLS = [
  "getLocation",
  "getDeviceInfo",
  "copyToClipboard",
  "openOnDevice",
  "shareContent",
  "takePhoto",
] as const;
export type DeviceToolName = (typeof DEVICE_TOOLS)[number];

export const INTERACTIVE_DEVICE_TOOLS = ["openOnDevice", "shareContent", "takePhoto"] as const;
export type InteractiveDeviceToolName = (typeof INTERACTIVE_DEVICE_TOOLS)[number];

export function isDeviceToolName(name: string): name is DeviceToolName {
  return (DEVICE_TOOLS as readonly string[]).includes(name);
}

export function isInteractiveDeviceTool(name: string): name is InteractiveDeviceToolName {
  return (INTERACTIVE_DEVICE_TOOLS as readonly string[]).includes(name);
}

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
  getLocation: { running: "Obteniendo tu ubicación…", done: "Ubicación" },
  getDeviceInfo: { running: "Leyendo el dispositivo…", done: "Información del dispositivo" },
  copyToClipboard: { running: "Copiando…", done: "Copiado al portapapeles" },
  openOnDevice: { running: "Esperando tu toque para abrir…", done: "Abierto en el dispositivo" },
  shareContent: { running: "Esperando tu toque para compartir…", done: "Compartido" },
  takePhoto: { running: "Esperando la foto…", done: "Foto" },
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
