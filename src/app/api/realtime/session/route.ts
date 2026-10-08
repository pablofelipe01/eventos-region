import { LIMITS, REALTIME } from "@/lib/agent/config";
import { buildVoiceInstructions } from "@/lib/agent/system-prompt";
import { getRealtimeToolDefinitions } from "@/lib/agent/tool-schemas";
import { jsonError, readJson, rejectCrossOrigin } from "@/lib/http";
import { errorMessage } from "@/lib/redact";

export const maxDuration = 30;

/**
 * Crea un client secret efímero (ek_...) para la OpenAI Realtime API.
 * El navegador lo usa para abrir la conexión WebRTC directamente con OpenAI;
 * la clave real (OPENAI_API_KEY) nunca sale del servidor.
 *
 * Docs: https://platform.openai.com/docs/api-reference/realtime-sessions/create-realtime-client-secret
 *       https://platform.openai.com/docs/guides/realtime-webrtc
 */
export async function POST(request: Request) {
  const forbidden = rejectCrossOrigin(request);
  if (forbidden) return forbidden;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      500,
      "missing_api_key",
      "Falta la variable de entorno OPENAI_API_KEY: la conversación por voz usa la Realtime API de OpenAI. Añádela en .env.local o en Vercel → Project Settings → Environment Variables.",
      { envKey: "OPENAI_API_KEY" },
    );
  }

  // El cuerpo es opcional: { context?: string } con un resumen del chat de texto.
  let context: string | undefined;
  if (request.headers.get("content-length") !== "0") {
    const parsed = await readJson(request);
    if (parsed.ok) {
      const raw = (parsed.body as { context?: unknown } | null)?.context;
      if (typeof raw === "string") context = raw.slice(-LIMITS.voiceContextChars);
    }
  }

  const payload = {
    expires_after: { anchor: "created_at", seconds: REALTIME.clientSecretTtlSeconds },
    session: {
      type: "realtime",
      model: REALTIME.model,
      instructions: buildVoiceInstructions(context),
      output_modalities: ["audio"],
      audio: {
        input: {
          noise_reduction: { type: "near_field" },
          transcription: {
            model: REALTIME.transcriptionModel,
            language: REALTIME.transcriptionLanguage,
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { voice: REALTIME.voice },
      },
      tools: getRealtimeToolDefinitions(),
      tool_choice: "auto",
    },
  };

  try {
    const response = await fetch(REALTIME.clientSecretsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await response.json().catch(() => null)) as {
      value?: string;
      expires_at?: number;
      session?: { model?: string };
      error?: { message?: string };
    } | null;

    if (!response.ok || !data?.value) {
      console.error("[api/realtime/session] OpenAI error", response.status, data?.error);
      return jsonError(
        502,
        "realtime_session_failed",
        `OpenAI no pudo crear la sesión de voz (${response.status})${
          data?.error?.message ? `: ${errorMessage(data.error.message)}` : ""
        }`,
      );
    }

    return Response.json(
      {
        clientSecret: data.value,
        expiresAt: data.expires_at,
        model: data.session?.model ?? REALTIME.model,
        callsUrl: REALTIME.callsUrl,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/realtime/session] error", error);
    return jsonError(502, "realtime_session_failed", `No se pudo contactar a OpenAI: ${errorMessage(error)}`);
  }
}
