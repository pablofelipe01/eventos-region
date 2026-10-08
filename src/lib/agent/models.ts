import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { CHAT_MODELS, FALLBACK_PROVIDER, isProviderId, PROVIDERS, type ProviderId } from "./config";

/** Proveedor por defecto según `DEFAULT_PROVIDER` (anthropic | openai). */
export function getDefaultProvider(): ProviderId {
  const value = process.env.DEFAULT_PROVIDER?.trim().toLowerCase();
  return isProviderId(value) ? value : FALLBACK_PROVIDER;
}

export function hasProviderKey(provider: ProviderId): boolean {
  return Boolean(process.env[CHAT_MODELS[provider].envKey]?.trim());
}

/** Estado público (sin secretos) para la UI. */
export function getPublicAgentConfig() {
  return {
    defaultProvider: getDefaultProvider(),
    providers: PROVIDERS.map((id) => ({
      id,
      label: CHAT_MODELS[id].label,
      modelId: CHAT_MODELS[id].id,
      configured: hasProviderKey(id),
    })),
    features: {
      voice: hasProviderKey("openai"),
      images: hasProviderKey("openai"),
      // La búsqueda web del chat es nativa de cada proveedor (disponible si su
      // clave está configurada); la de la voz usa OpenAI.
      voiceWebSearch: hasProviderKey("openai"),
    },
  };
}
export type PublicAgentConfig = ReturnType<typeof getPublicAgentConfig>;

export class MissingApiKeyError extends Error {
  readonly code = "missing_api_key";
  constructor(
    readonly provider: ProviderId,
    readonly envKey: string,
  ) {
    super(
      `Falta la variable de entorno ${envKey} para usar ${CHAT_MODELS[provider].label}. Añádela en .env.local (local) o en Vercel → Project Settings → Environment Variables.`,
    );
  }
}

/** Devuelve el modelo de lenguaje del proveedor o lanza `MissingApiKeyError`. */
export function getLanguageModel(provider: ProviderId): LanguageModel {
  const { id, envKey } = CHAT_MODELS[provider];
  const apiKey = process.env[envKey]?.trim();
  if (!apiKey) throw new MissingApiKeyError(provider, envKey);

  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(id);
    case "openai":
      return createOpenAI({ apiKey })(id);
  }
}
