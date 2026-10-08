"use client";

/**
 * Conversación por voz en tiempo real con la OpenAI Realtime API (WebRTC).
 *
 * Flujo (https://platform.openai.com/docs/guides/realtime-webrtc):
 *  1. Micrófono (getUserMedia) → pista de audio en un RTCPeerConnection.
 *  2. Canal de datos "oai-events" para eventos JSON.
 *  3. POST /api/realtime/session → client secret efímero (ek_...).
 *  4. Oferta SDP → POST https://api.openai.com/v1/realtime/calls con el ek_ → respuesta SDP.
 *  5. Audio del modelo por la pista remota; transcripciones y llamadas a
 *     herramientas por el canal de datos.
 *
 * Las transcripciones (usuario y asistente) y las herramientas se insertan en
 * la misma lista de mensajes de `useChat`, así texto y voz comparten un hilo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArtifactRegistry } from "@/lib/agent/artifacts";
import { buildVoiceContext, readableError, voiceMessages } from "@/lib/agent/message-utils";
import {
  isRegionToolName,
  isServerExecutedTool,
  TOOL_INPUT_SCHEMAS,
  type GenerateImageOutput,
  type RegionToolName,
} from "@/lib/agent/tool-schemas";
import type { RegionUIMessage, RegionUIPart } from "@/lib/agent/types";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "user-speaking"
  | "thinking"
  | "speaking"
  | "tool";

type SetMessages = (updater: (messages: RegionUIMessage[]) => RegionUIMessage[]) => void;

type FunctionCallItem = { type: "function_call"; name: string; call_id: string; arguments: string };

/* eslint-disable @typescript-eslint/no-explicit-any -- eventos JSON del servidor sin tipar */
type ServerEvent = { type: string; [key: string]: any };

function toolPart(
  name: RegionToolName,
  toolCallId: string,
  state: "input-available" | "output-available" | "output-error",
  input: unknown,
  outputOrError?: unknown,
): RegionUIPart {
  const base = { type: `tool-${name}`, toolCallId, state, input } as Record<string, unknown>;
  if (state === "output-available") base.output = outputOrError;
  if (state === "output-error") base.errorText = String(outputOrError);
  return base as unknown as RegionUIPart;
}

/** Versión del resultado que se devuelve al modelo de voz (sin base64). */
function outputForModel(name: string, output: unknown): string {
  if (name === "generateImage") {
    const image = output as GenerateImageOutput;
    if (image.ok) {
      return JSON.stringify({
        ok: true,
        note: "La imagen ya se muestra al usuario en pantalla.",
        prompt: image.prompt,
      });
    }
  }
  return JSON.stringify(output);
}

export function useRealtimeVoice({
  getMessages,
  setMessages,
}: {
  getMessages: () => RegionUIMessage[];
  setMessages: SetMessages;
}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handledCallsRef = useRef(new Set<string>());
  const sessionRef = useRef(0);

  // Callbacks siempre actualizados sin reconectar la sesión.
  const callbacksRef = useRef({ getMessages, setMessages });
  useEffect(() => {
    callbacksRef.current = { getMessages, setMessages };
  }, [getMessages, setMessages]);

  const cleanup = useCallback(() => {
    sessionRef.current += 1;
    dcRef.current?.close();
    pcRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.remove();
    }
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
    audioRef.current = null;
    handledCallsRef.current.clear();
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  const send = useCallback((event: Record<string, unknown>) => {
    const channel = dcRef.current;
    if (channel?.readyState === "open") channel.send(JSON.stringify(event));
  }, []);

  /** Ejecuta las llamadas a función de una respuesta y pide la continuación. */
  const runFunctionCalls = useCallback(
    async (responseId: string, calls: FunctionCallItem[]) => {
      const session = sessionRef.current;
      const { getMessages: currentMessages, setMessages: update } = callbacksRef.current;
      const registry = ArtifactRegistry.fromMessages(currentMessages());
      setStatus("tool");

      for (const call of calls) {
        let modelOutput: string;
        const name = call.name;

        let args: unknown;
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {};
        } catch {
          args = undefined;
        }

        if (!isRegionToolName(name)) {
          modelOutput = JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` });
        } else {
          const parsed = TOOL_INPUT_SCHEMAS[name].safeParse(args);
          if (!parsed.success) {
            const message = `Argumentos inválidos: ${parsed.error.issues.map((i) => i.message).join("; ")}`;
            update((m) =>
              voiceMessages.upsertToolPart(m, responseId, toolPart(name, call.call_id, "output-error", args, message)),
            );
            modelOutput = JSON.stringify({ ok: false, error: message });
          } else {
            const input = parsed.data;
            let output: unknown;
            if (name === "createArtifact") {
              output = registry.create(TOOL_INPUT_SCHEMAS.createArtifact.parse(input));
            } else if (name === "updateArtifact") {
              output = registry.update(TOOL_INPUT_SCHEMAS.updateArtifact.parse(input));
            } else if (isServerExecutedTool(name)) {
              try {
                const response = await fetch("/api/tools", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, args: input }),
                });
                if (!response.ok) throw new Error(await response.text());
                output = ((await response.json()) as { result: unknown }).result;
              } catch (err) {
                output = { ok: false, error: `No se pudo ejecutar ${name}: ${readableError(err)}` };
              }
            }
            if (session !== sessionRef.current) return; // la sesión se cerró mientras tanto
            update((m) =>
              voiceMessages.upsertToolPart(
                m,
                responseId,
                toolPart(name, call.call_id, "output-available", input, output),
              ),
            );
            modelOutput = outputForModel(name, output);
          }
        }

        send({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: call.call_id, output: modelOutput },
        });
      }

      if (session !== sessionRef.current) return;
      send({ type: "response.create" });
      setStatus("thinking");
    },
    [send],
  );

  const handleEvent = useCallback(
    (event: ServerEvent) => {
      const update = callbacksRef.current.setMessages;
      switch (event.type) {
        case "session.created":
          setStatus("listening");
          break;
        case "input_audio_buffer.speech_started":
          setStatus("user-speaking");
          break;
        case "input_audio_buffer.speech_stopped":
          setStatus("thinking");
          break;
        case "input_audio_buffer.committed":
          if (event.item_id) update((m) => voiceMessages.setUserText(m, event.item_id, "", "placeholder"));
          break;
        case "conversation.item.input_audio_transcription.delta":
          if (event.item_id && event.delta)
            update((m) => voiceMessages.setUserText(m, event.item_id, event.delta, "delta"));
          break;
        case "conversation.item.input_audio_transcription.completed":
          if (event.item_id)
            update((m) =>
              voiceMessages.setUserText(m, event.item_id, String(event.transcript ?? "").trim() || "(audio)", "final"),
            );
          break;
        case "conversation.item.input_audio_transcription.failed":
          if (event.item_id)
            update((m) => voiceMessages.setUserText(m, event.item_id, "(no se pudo transcribir el audio)", "final"));
          break;
        case "response.created":
          setStatus("thinking");
          break;
        case "response.output_audio_transcript.delta":
        case "response.output_text.delta":
          if (event.response_id && event.delta)
            update((m) => voiceMessages.setAssistantText(m, event.response_id, event.delta, "delta"));
          break;
        case "response.output_audio_transcript.done":
          if (event.response_id && typeof event.transcript === "string")
            update((m) => voiceMessages.setAssistantText(m, event.response_id, event.transcript, "final"));
          break;
        case "response.output_text.done":
          if (event.response_id && typeof event.text === "string")
            update((m) => voiceMessages.setAssistantText(m, event.response_id, event.text, "final"));
          break;
        case "output_audio_buffer.started":
          setStatus("speaking");
          break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          setStatus((s) => (s === "speaking" ? "listening" : s));
          break;
        case "response.function_call_arguments.done": {
          const name = event.name as string;
          if (event.response_id && event.call_id && isRegionToolName(name)) {
            let args: unknown;
            try {
              args = JSON.parse(event.arguments || "{}");
            } catch {
              args = undefined;
            }
            update((m) =>
              voiceMessages.upsertToolPart(m, event.response_id, toolPart(name, event.call_id, "input-available", args)),
            );
            setStatus("tool");
          }
          break;
        }
        case "response.done": {
          const response = event.response as { id: string; status?: string; output?: Array<{ type: string }> };
          const calls = (response?.output ?? []).filter(
            (item): item is FunctionCallItem =>
              item.type === "function_call" && !handledCallsRef.current.has((item as FunctionCallItem).call_id),
          );
          if (calls.length) {
            calls.forEach((c) => handledCallsRef.current.add(c.call_id));
            void runFunctionCalls(response.id, calls);
          } else {
            setStatus((s) => (s === "speaking" ? s : "listening"));
          }
          break;
        }
        case "error":
          console.warn("[voz] error del servidor", event.error);
          setError(event.error?.message ?? "Error en la sesión de voz.");
          break;
        default:
          break;
      }
    },
    [runFunctionCalls],
  );

  const start = useCallback(async () => {
    if (pcRef.current) return;
    setError(null);
    setStatus("connecting");
    const session = ++sessionRef.current;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Este navegador no permite usar el micrófono aquí (se necesita HTTPS o localhost).");
      }
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== sessionRef.current) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      micRef.current = mic;

      const tokenResponse = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: buildVoiceContext(callbacksRef.current.getMessages()) }),
      });
      if (!tokenResponse.ok) throw new Error(await tokenResponse.text());
      const { clientSecret, callsUrl } = (await tokenResponse.json()) as {
        clientSecret: string;
        callsUrl: string;
      };
      if (session !== sessionRef.current) return;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          setError("Se perdió la conexión de voz.");
          cleanup();
          setStatus("idle");
        }
      };

      for (const track of mic.getAudioTracks()) pc.addTrack(track, mic);

      // El canal de eventos se crea antes de la oferta SDP.
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.addEventListener("message", (e) => {
        try {
          handleEvent(JSON.parse(e.data) as ServerEvent);
        } catch (err) {
          console.warn("[voz] evento no válido", err);
        }
      });
      dc.addEventListener("open", () => setStatus("listening"));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(callsUrl, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        throw new Error(`OpenAI rechazó la conexión WebRTC (${sdpResponse.status}).`);
      }
      const answerSdp = await sdpResponse.text();
      if (session !== sessionRef.current) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      if (session !== sessionRef.current) return;
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permiso de micrófono denegado. Actívalo en el navegador para hablar con Región."
          : readableError(err);
      setError(message);
      cleanup();
      setStatus("idle");
    }
  }, [cleanup, handleEvent]);

  /** Mientras la voz está activa, el texto escrito también va a la sesión de voz. */
  const sendText = useCallback(
    (text: string) => {
      const id = `voice_user_text_${Date.now().toString(36)}`;
      callbacksRef.current.setMessages((m) => [
        ...m,
        { id, role: "user", parts: [{ type: "text", text }], metadata: { source: "voice" } },
      ]);
      send({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
      });
      send({ type: "response.create" });
      setStatus("thinking");
    },
    [send],
  );

  return {
    status,
    error,
    isActive: status !== "idle",
    start,
    stop,
    sendText,
    clearError: () => setError(null),
  };
}
