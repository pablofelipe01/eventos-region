/**
 * Configuración central del agente "Región".
 *
 * Cambia aquí los ids de modelo: es el único lugar donde están definidos.
 * Este módulo no contiene secretos y se puede importar desde cliente y servidor.
 */

export const PROVIDERS = ["anthropic", "openai"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

/** Modelos de texto (chat) por proveedor. */
export const CHAT_MODELS: Record<
  ProviderId,
  { id: string; label: string; envKey: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" }
> = {
  anthropic: {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    envKey: "ANTHROPIC_API_KEY",
  },
  openai: {
    id: "gpt-6.1-sol",
    label: "GPT-6.1 Sol",
    envKey: "OPENAI_API_KEY",
  },
};

/** Proveedor por defecto si `DEFAULT_PROVIDER` no está definido o es inválido. */
export const FALLBACK_PROVIDER: ProviderId = "anthropic";

/** Modelo de generación de imágenes (OpenAI). */
export const IMAGE_MODEL = {
  id: "gpt-image-2.5-flare",
  size: "1024x1024" as const,
  quality: "medium" as const,
  outputFormat: "webp" as const,
};

/** Configuración de voz en tiempo real (OpenAI Realtime API, WebRTC). */
export const REALTIME = {
  /** Modelo de voz. Alternativas: "gpt-realtime-2.1", "gpt-realtime-mini". */
  model: "gpt-realtime",
  /** Voces recomendadas por OpenAI: "marin" o "cedar". */
  voice: "marin",
  /** Transcripción de lo que dice el usuario (se muestra en el chat). */
  transcriptionModel: "gpt-4o-mini-transcribe",
  /** Idioma esperado (ISO-639-1). Mejora la precisión de la transcripción. */
  transcriptionLanguage: "es",
  /** Vida del client secret efímero (segundos, 10–7200). */
  clientSecretTtlSeconds: 600,
  /** Endpoints de OpenAI. */
  clientSecretsUrl: "https://api.openai.com/v1/realtime/client_secrets",
  callsUrl: "https://api.openai.com/v1/realtime/calls",
} as const;

/** Máximo de pasos (llamadas al modelo) por turno de chat con herramientas. */
export const MAX_AGENT_STEPS = 10;

/** Límites defensivos. */
export const LIMITS = {
  /** Caracteres máximos del contexto de texto que se pasa a la sesión de voz. */
  voiceContextChars: 4000,
  /** Resultados máximos de búsqueda web. */
  webSearchResults: 5,
} as const;
