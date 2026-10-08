"use client";

/**
 * Conversación por voz full-duplex con la OpenAI Realtime API (WebRTC).
 *
 * Conexión (https://platform.openai.com/docs/guides/realtime-webrtc):
 *  1. Micrófono (getUserMedia) → pista de audio en un RTCPeerConnection.
 *  2. Canal de datos "oai-events" para los eventos JSON.
 *  3. POST /api/realtime/session → client secret efímero (ek_...).
 *  4. Oferta SDP → POST https://api.openai.com/v1/realtime/calls con el ek_ → respuesta SDP.
 *
 * Full-duplex e interrupciones (barge-in): el micrófono nunca se cierra
 * mientras el asistente habla. Con `server_vad` + `interrupt_response`, el
 * servidor cancela la respuesta y vacía su búfer de audio cuando el usuario
 * habla encima; aquí además silenciamos la reproducción local en cuanto llega
 * `input_audio_buffer.speech_started` y la reactivamos con el siguiente
 * `output_audio_buffer.started`.
 *
 * Herramientas (https://platform.openai.com/docs/guides/realtime-conversations#function-calling):
 *  - Se empiezan a ejecutar en cuanto llega `response.function_call_arguments.done`
 *    (el asistente puede seguir hablando mientras tanto).
 *  - Artefactos: en el navegador, contra la MISMA lista de mensajes de `useChat`
 *    que usa el chat de texto (el panel derecho se actualiza al instante).
 *  - generateImage → /api/tools; webSearch → /api/web-search.
 *  - Dispositivo (ubicación, abrir apps, compartir, foto): en el navegador. Las
 *    interactivas esperan el toque del usuario en su tarjeta del hilo
 *    (`resolveDeviceCall`); la foto se envía después como `input_image`.
 *  - Al terminar la respuesta (`response.done`) se envía un
 *    `conversation.item.create` (function_call_output) por llamada y luego un
 *    único `response.create`, salvo que el usuario esté hablando (su turno
 *    generará la respuesta) o ya haya una respuesta activa (se encola).
 *
 * Hilo único: transcripciones, herramientas, artefactos e imágenes de la voz
 * se insertan como mensajes normales de `useChat`; cuando el usuario vuelve a
 * escribir, el modelo de texto recibe esos turnos como historial.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArtifactRegistry } from "@/lib/agent/artifacts";
import { buildVoiceContext, readableError, voiceMessages } from "@/lib/agent/message-utils";
import {
  isDeviceToolName,
  isRegionToolName,
  SERVER_TOOL_ENDPOINTS,
  TOOL_INPUT_SCHEMAS,
  TOOL_LABELS,
  type ArtifactToolOutput,
  type CreateArtifactInput,
  type DeviceToolName,
  type GenerateImageOutput,
  type RegionToolName,
  type TakePhotoOutput,
  type UpdateArtifactInput,
  type WebSearchOutput,
} from "@/lib/agent/tool-schemas";
import type { RegionUIMessage, RegionUIPart } from "@/lib/agent/types";
import { downscaleDataUrl, startDeviceTool, type DeviceToolOutput } from "@/lib/device/device-actions";

export type VoiceStatus = "idle" | "connecting" | "listening" | "user-speaking" | "thinking" | "speaking";

export type VoiceToolActivity = { callId: string; name: RegionToolName; label: string };

export type VoiceCaption = { role: "user" | "assistant"; text: string; final: boolean };

type SetMessages = (updater: (messages: RegionUIMessage[]) => RegionUIMessage[]) => void;

type FunctionCallItem = {
  type: "function_call";
  name: string;
  call_id: string;
  arguments?: string;
  status?: "completed" | "incomplete" | "in_progress";
};

/* eslint-disable @typescript-eslint/no-explicit-any -- eventos JSON del servidor sin tipar */
type ServerEvent = { type: string; [key: string]: any };

/** Resultado de una llamada: texto para `function_call_output` y, si hay, una foto para el modelo. */
type CallResult = { output: string; image?: string };

/** Llamada del dispositivo que espera el toque del usuario en su tarjeta. */
type PendingDeviceCall = {
  responseId: string;
  name: DeviceToolName;
  input: unknown;
  resolve: (output: DeviceToolOutput) => void;
};

/** La foto viaja por el canal de datos WebRTC: se reduce para no superar su tamaño máximo de mensaje. */
const VOICE_PHOTO = { maxSide: 768, quality: 0.7 };

/** Errores del servidor que forman parte del flujo normal (no se muestran). */
const BENIGN_ERROR_CODES = new Set([
  "response_cancel_not_active",
  "conversation_already_has_active_response",
]);

function toolPart(
  name: RegionToolName,
  toolCallId: string,
  state: "input-streaming" | "input-available" | "output-available" | "output-error",
  input: unknown,
  outputOrError?: unknown,
): RegionUIPart {
  const base = { type: `tool-${name}`, toolCallId, state, input } as Record<string, unknown>;
  if (state === "output-available") base.output = outputOrError;
  if (state === "output-error") base.errorText = String(outputOrError);
  return base as unknown as RegionUIPart;
}

/** Resultado que se devuelve al modelo de voz (sin base64, breve). */
function outputForModel(name: RegionToolName, output: unknown): string {
  if (name === "generateImage") {
    const image = output as GenerateImageOutput;
    if (image?.ok) {
      return JSON.stringify({ ok: true, note: "La imagen ya se muestra al usuario en pantalla.", prompt: image.prompt });
    }
  }
  if (name === "webSearch") {
    const search = output as WebSearchOutput;
    if (search?.ok) {
      return JSON.stringify({
        ok: true,
        answer: search.answer,
        sources: search.sources.map((s) => s.title ?? s.url),
        note: "Las fuentes (con enlace) ya se muestran en pantalla; menciónalas por su nombre, sin leer URLs.",
      });
    }
  }
  if (name === "createArtifact" || name === "updateArtifact") {
    const artifact = output as ArtifactToolOutput;
    if (artifact?.ok) {
      return JSON.stringify({ ...artifact, note: "El artefacto ya se muestra en el panel derecho." });
    }
  }
  if (name === "takePhoto") {
    const photo = output as TakePhotoOutput;
    if (photo?.ok) {
      return JSON.stringify({ ok: true, note: "La foto del usuario se adjunta a continuación como imagen." });
    }
  }
  return JSON.stringify(output ?? { ok: false, error: "Sin resultado." });
}

export function useRealtimeVoice({
  getMessages,
  setMessages,
}: {
  /** Lista de mensajes actual (síncrona, sin esperar a un render). */
  getMessages: () => RegionUIMessage[];
  /** Actualización síncrona de la lista de mensajes de useChat. */
  setMessages: SetMessages;
}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  /** El navegador bloqueó la reproducción (autoplay): hace falta un toque para oír a Región. */
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [tools, setTools] = useState<VoiceToolActivity[]>([]);
  const [caption, setCaption] = useState<VoiceCaption | null>(null);
  const [streams, setStreams] = useState<{ mic: MediaStream | null; remote: MediaStream | null }>({
    mic: null,
    remote: null,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(0);

  // Estado de la conversación (refs: se leen dentro de callbacks de eventos).
  const connectedRef = useRef(false);
  const userSpeakingRef = useRef(false);
  const audioPlayingRef = useRef(false);
  const activeResponseRef = useRef<string | null>(null);
  const pendingCreateRef = useRef(false);
  const awaitingRef = useRef(false);
  const followUpRef = useRef(false);
  const callsRef = useRef(new Map<string, Promise<CallResult>>());
  const responseCallsRef = useRef(new Map<string, Set<string>>());
  const pendingDeviceRef = useRef(new Map<string, PendingDeviceCall>());

  // Callbacks siempre actualizados sin reconectar la sesión.
  const bridgeRef = useRef({ getMessages, setMessages });
  useEffect(() => {
    bridgeRef.current = { getMessages, setMessages };
  }, [getMessages, setMessages]);

  const refreshStatus = useCallback(() => {
    if (!connectedRef.current) return;
    if (userSpeakingRef.current) setStatus("user-speaking");
    else if (audioPlayingRef.current) setStatus("speaking");
    else if (activeResponseRef.current || pendingCreateRef.current || awaitingRef.current) setStatus("thinking");
    else setStatus("listening");
  }, []);

  const resetConversationState = () => {
    connectedRef.current = false;
    userSpeakingRef.current = false;
    audioPlayingRef.current = false;
    activeResponseRef.current = null;
    pendingCreateRef.current = false;
    awaitingRef.current = false;
    followUpRef.current = false;
    callsRef.current.clear();
    responseCallsRef.current.clear();
  };

  const cleanup = useCallback(() => {
    sessionRef.current += 1;
    // Tarjetas del dispositivo sin tocar: se cierran como canceladas.
    for (const [callId, pending] of pendingDeviceRef.current) {
      const cancelled = { ok: false as const, error: "Cancelado: terminó la conversación de voz.", code: "cancelled_by_user" };
      bridgeRef.current.setMessages((m) =>
        voiceMessages.upsertToolPart(
          m,
          pending.responseId,
          toolPart(pending.name, callId, "output-available", pending.input, cancelled),
        ),
      );
      pending.resolve(cancelled);
    }
    pendingDeviceRef.current.clear();
    dcRef.current?.close();
    pcRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
    }
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
    audioRef.current = null;
    resetConversationState();
    setTools([]);
    setCaption(null);
    setMuted(false);
    setAudioBlocked(false);
    setStreams({ mic: null, remote: null });
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

  /** Pide una respuesta al modelo, respetando el turno del usuario y la respuesta activa. */
  const requestResponse = useCallback(() => {
    if (userSpeakingRef.current) return; // su turno (VAD) creará la respuesta e incluirá los resultados
    if (activeResponseRef.current || pendingCreateRef.current) {
      followUpRef.current = true;
      return;
    }
    followUpRef.current = false;
    pendingCreateRef.current = true;
    send({ type: "response.create" });
    refreshStatus();
  }, [refreshStatus, send]);

  /** Ejecuta una llamada a función y devuelve el texto para `function_call_output` (y la foto, si hay). */
  const executeCall = useCallback(
    async (responseId: string, name: string, callId: string, rawArguments: string | undefined): Promise<CallResult> => {
      const session = sessionRef.current;
      const { setMessages: update, getMessages: current } = bridgeRef.current;

      if (!isRegionToolName(name)) {
        return { output: JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` }) };
      }

      let args: unknown;
      try {
        args = rawArguments ? JSON.parse(rawArguments) : {};
      } catch {
        args = undefined;
      }
      const parsed = TOOL_INPUT_SCHEMAS[name].safeParse(args);
      if (!parsed.success) {
        const message = `Argumentos inválidos: ${parsed.error.issues.map((i) => i.message).join("; ")}`;
        update((m) => voiceMessages.upsertToolPart(m, responseId, toolPart(name, callId, "output-error", args, message)));
        return { output: JSON.stringify({ ok: false, error: message }) };
      }
      const input = parsed.data;

      setTools((list) => [...list, { callId, name, label: TOOL_LABELS[name].running }]);
      update((m) => voiceMessages.upsertToolPart(m, responseId, toolPart(name, callId, "input-available", input)));

      let output: unknown;
      try {
        if (isDeviceToolName(name)) {
          // En el navegador. Las interactivas esperan el toque en su tarjeta (resolveDeviceCall).
          const immediate = await startDeviceTool(name, input);
          output =
            immediate ??
            (await new Promise<DeviceToolOutput>((resolve) => {
              pendingDeviceRef.current.set(callId, { responseId, name, input, resolve });
            }));
          if (session !== sessionRef.current) return { output: "" };
          update((m) =>
            voiceMessages.upsertToolPart(m, responseId, toolPart(name, callId, "output-available", input, output)),
          );
        } else if (name === "createArtifact" || name === "updateArtifact") {
          // Mismo estado que el chat de texto: el registro se deriva de la lista
          // de mensajes actual dentro de la actualización (síncrona en useChat).
          const run = (messages: RegionUIMessage[]) => {
            const registry = ArtifactRegistry.fromMessages(messages);
            return name === "createArtifact"
              ? registry.create(input as CreateArtifactInput)
              : registry.update(input as UpdateArtifactInput);
          };
          update((m) => {
            output = run(m);
            return voiceMessages.upsertToolPart(m, responseId, toolPart(name, callId, "output-available", input, output));
          });
          if (output === undefined) {
            // Respaldo por si setMessages dejara de ser síncrono.
            output = run(current());
            update((m) =>
              voiceMessages.upsertToolPart(m, responseId, toolPart(name, callId, "output-available", input, output)),
            );
          }
        } else {
          const endpoint = SERVER_TOOL_ENDPOINTS[name as keyof typeof SERVER_TOOL_ENDPOINTS];
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(name === "webSearch" ? input : { name, args: input }),
            });
            output = response.ok
              ? ((await response.json()) as { result: unknown }).result
              : { ok: false, error: readableError(await response.text()) };
          } catch (err) {
            output = { ok: false, error: `No se pudo ejecutar ${name}: ${readableError(err)}` };
          }
          if (session !== sessionRef.current) return { output: "" };
          update((m) =>
            voiceMessages.upsertToolPart(m, responseId, toolPart(name, callId, "output-available", input, output)),
          );
        }
      } finally {
        if (session === sessionRef.current) setTools((list) => list.filter((t) => t.callId !== callId));
      }
      const photo = name === "takePhoto" ? (output as TakePhotoOutput) : null;
      const image =
        photo?.ok && photo.dataUrl
          ? await downscaleDataUrl(photo.dataUrl, VOICE_PHOTO.maxSide, VOICE_PHOTO.quality)
          : undefined;
      return { output: outputForModel(name, output), image };
    },
    [],
  );

  /** Entrega el resultado de una tarjeta del dispositivo (toque del usuario) a la llamada de voz en espera. */
  const resolveDeviceCall = useCallback((callId: string, output: DeviceToolOutput): boolean => {
    const pending = pendingDeviceRef.current.get(callId);
    if (!pending) return false;
    pendingDeviceRef.current.delete(callId);
    pending.resolve(output);
    return true;
  }, []);

  /** Empieza a ejecutar una llamada (idempotente por call_id). */
  const startCall = useCallback(
    (responseId: string, item: { name: string; call_id: string; arguments?: string }) => {
      if (!item.call_id || callsRef.current.has(item.call_id)) return;
      callsRef.current.set(item.call_id, executeCall(responseId, item.name, item.call_id, item.arguments));
      const set = responseCallsRef.current.get(responseId) ?? new Set<string>();
      set.add(item.call_id);
      responseCallsRef.current.set(responseId, set);
    },
    [executeCall],
  );

  /** Al terminar una respuesta: devuelve los resultados de sus herramientas y continúa. */
  const finishResponse = useCallback(
    async (response: { id: string; status?: string; output?: Array<{ type: string }> }) => {
      const session = sessionRef.current;
      if (activeResponseRef.current === response.id) activeResponseRef.current = null;

      for (const item of response.output ?? []) {
        if (item.type !== "function_call") continue;
        const call = item as FunctionCallItem;
        // Una llamada cortada por una interrupción no tiene argumentos completos.
        if (call.status && call.status !== "completed") continue;
        startCall(response.id, call);
      }

      const callIds = [...(responseCallsRef.current.get(response.id) ?? [])];
      responseCallsRef.current.delete(response.id);

      if (callIds.length === 0) {
        if (followUpRef.current) requestResponse();
        refreshStatus();
        return;
      }

      awaitingRef.current = true;
      refreshStatus();
      const outputs = await Promise.all(
        callIds.map(async (callId) => ({ callId, result: await callsRef.current.get(callId)! })),
      );
      if (session !== sessionRef.current) return;
      for (const { callId, result } of outputs) {
        send({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: callId, output: result.output },
        });
      }
      // Las fotos del usuario (takePhoto) entran como imagen en un mensaje aparte.
      const maxMessageSize = pcRef.current?.sctp?.maxMessageSize ?? 256 * 1024;
      for (const { result } of outputs) {
        if (!result.image) continue;
        const fits = result.image.length < maxMessageSize - 4096;
        send({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: fits
              ? [
                  { type: "input_text", text: "Esta es la foto que tomé con takePhoto:" },
                  { type: "input_image", image_url: result.image },
                ]
              : [{ type: "input_text", text: "(La foto era demasiado grande para enviarla por voz; pídeme que la envíe por el chat de texto.)" }],
          },
        });
      }
      awaitingRef.current = false;
      requestResponse();
      refreshStatus();
    },
    [refreshStatus, requestResponse, send, startCall],
  );

  const handleEvent = useCallback(
    (event: ServerEvent) => {
      const update = bridgeRef.current.setMessages;
      switch (event.type) {
        case "session.created":
          connectedRef.current = true;
          refreshStatus();
          break;

        /* ---------- Turno del usuario ---------- */
        case "input_audio_buffer.speech_started":
          userSpeakingRef.current = true;
          // Barge-in: corta ya la reproducción local (el servidor cancela la respuesta y vacía su búfer).
          if (audioRef.current && audioPlayingRef.current) audioRef.current.muted = true;
          setCaption({ role: "user", text: "", final: false });
          refreshStatus();
          break;
        case "input_audio_buffer.speech_stopped":
          userSpeakingRef.current = false;
          awaitingRef.current = true;
          refreshStatus();
          break;
        case "input_audio_buffer.committed":
          // Reserva el lugar del mensaje del usuario para mantener el orden del hilo.
          if (event.item_id) update((m) => voiceMessages.setUserText(m, event.item_id, "", "placeholder"));
          break;
        case "conversation.item.input_audio_transcription.delta":
          if (event.item_id && event.delta) {
            update((m) => voiceMessages.setUserText(m, event.item_id, event.delta, "delta"));
            setCaption((c) => ({
              role: "user",
              text: (c?.role === "user" && !c.final ? c.text : "") + event.delta,
              final: false,
            }));
          }
          break;
        case "conversation.item.input_audio_transcription.completed": {
          const transcript = String(event.transcript ?? "").trim() || "(audio)";
          if (event.item_id) update((m) => voiceMessages.setUserText(m, event.item_id, transcript, "final"));
          setCaption({ role: "user", text: transcript, final: true });
          break;
        }
        case "conversation.item.input_audio_transcription.failed":
          if (event.item_id)
            update((m) => voiceMessages.setUserText(m, event.item_id, "(no se pudo transcribir el audio)", "final"));
          break;

        /* ---------- Respuesta del asistente ---------- */
        case "response.created":
          // Respaldo: una respuesta nueva nunca debe quedar silenciada por un barge-in anterior.
          if (audioRef.current) audioRef.current.muted = false;
          activeResponseRef.current = event.response?.id ?? null;
          pendingCreateRef.current = false;
          awaitingRef.current = false;
          refreshStatus();
          break;
        case "response.output_audio_transcript.delta":
        case "response.output_text.delta":
          if (event.response_id && event.delta) {
            update((m) => voiceMessages.setAssistantText(m, event.response_id, event.delta, "delta"));
            setCaption((c) => ({
              role: "assistant",
              text: (c?.role === "assistant" && !c.final ? c.text : "") + event.delta,
              final: false,
            }));
          }
          break;
        case "response.output_audio_transcript.done":
        case "response.output_text.done": {
          const text = typeof event.transcript === "string" ? event.transcript : event.text;
          if (event.response_id && typeof text === "string") {
            update((m) => voiceMessages.setAssistantText(m, event.response_id, text, "final"));
            setCaption({ role: "assistant", text, final: true });
          }
          break;
        }
        case "response.output_item.added":
          // Muestra el chip de la herramienta en cuanto el modelo decide usarla.
          if (event.item?.type === "function_call" && isRegionToolName(event.item.name) && event.response_id) {
            update((m) =>
              voiceMessages.upsertToolPart(
                m,
                event.response_id,
                toolPart(event.item.name, event.item.call_id, "input-streaming", undefined),
              ),
            );
          }
          break;
        case "response.function_call_arguments.done":
          // Ejecuta ya (en paralelo a la voz); el resultado se envía en response.done.
          if (event.response_id && event.call_id && event.name) {
            startCall(event.response_id, { name: event.name, call_id: event.call_id, arguments: event.arguments });
          }
          break;
        case "response.done": {
          const response = event.response as { id: string; status?: string; output?: Array<{ type: string }> };
          if (!response?.id) break;
          update((m) => voiceMessages.finishAssistant(m, response.id, response.status === "cancelled"));
          void finishResponse(response);
          break;
        }

        /* ---------- Audio de salida (WebRTC) ---------- */
        case "output_audio_buffer.started":
          audioPlayingRef.current = true;
          if (audioRef.current) audioRef.current.muted = false;
          refreshStatus();
          break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          audioPlayingRef.current = false;
          refreshStatus();
          break;

        case "error": {
          const code = event.error?.code as string | undefined;
          if (code === "conversation_already_has_active_response") {
            pendingCreateRef.current = false;
            followUpRef.current = true;
          }
          if (code && BENIGN_ERROR_CODES.has(code)) break;
          console.warn("[voz] error del servidor", event.error);
          setError(event.error?.message ?? "Error en la sesión de voz.");
          break;
        }
        default:
          break;
      }
    },
    [finishResponse, refreshStatus, startCall],
  );

  /** Reproduce la voz de Región; si el navegador lo bloquea, lo indica en vez de quedar mudo. */
  const playAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio?.srcObject) return;
    audio
      .play()
      .then(() => setAudioBlocked(false))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "NotAllowedError") setAudioBlocked(true);
        else if (!(err instanceof DOMException && err.name === "AbortError")) console.warn("[voz] no se pudo reproducir", err);
      });
  }, []);

  const start = useCallback(async () => {
    if (pcRef.current || micRef.current) return;
    setError(null);
    setStatus("connecting");
    const session = ++sessionRef.current;

    // El reproductor se crea aquí, aún dentro del clic del usuario (antes de cualquier await),
    // y se inserta en la página: así el navegador lo asocia al gesto y no bloquea el audio.
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");
    audio.hidden = true;
    document.body.appendChild(audio);
    audioRef.current = audio;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Este navegador no permite usar el micrófono aquí (se necesita HTTPS o localhost).");
      }
      // Cancelación de eco: imprescindible para hablar y escuchar a la vez sin auriculares.
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (session !== sessionRef.current) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      micRef.current = mic;

      const tokenResponse = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: buildVoiceContext(bridgeRef.current.getMessages()) }),
      });
      if (!tokenResponse.ok) throw new Error(await tokenResponse.text());
      const { clientSecret, callsUrl } = (await tokenResponse.json()) as { clientSecret: string; callsUrl: string };
      if (session !== sessionRef.current) return;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (e) => {
        const remote = e.streams[0] ?? new MediaStream([e.track]);
        audio.srcObject = remote;
        playAudio();
        setStreams((s) => ({ ...s, remote }));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" && session === sessionRef.current) {
          setError("Se perdió la conexión de voz.");
          cleanup();
          setStatus("idle");
        }
      };

      for (const track of mic.getAudioTracks()) pc.addTrack(track, mic);
      setStreams({ mic, remote: null });

      // El canal de eventos se crea antes de la oferta SDP.
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.addEventListener("message", (e) => {
        if (session !== sessionRef.current) return;
        try {
          handleEvent(JSON.parse(e.data) as ServerEvent);
        } catch (err) {
          console.warn("[voz] evento no válido", err);
        }
      });
      dc.addEventListener("open", () => {
        connectedRef.current = true;
        refreshStatus();
      });
      dc.addEventListener("close", () => {
        if (session === sessionRef.current && connectedRef.current) {
          cleanup();
          setStatus("idle");
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(callsUrl, {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!sdpResponse.ok) throw new Error(`OpenAI rechazó la conexión WebRTC (${sdpResponse.status}).`);
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
  }, [cleanup, handleEvent, playAudio, refreshStatus]);

  /** Silencia / reactiva el micrófono sin cortar la llamada. */
  const toggleMute = useCallback(() => {
    const mic = micRef.current;
    if (!mic) return;
    const next = !mic.getAudioTracks().every((t) => !t.enabled);
    mic.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, []);

  /** Corta al asistente manualmente (equivale a hablarle encima). */
  const interrupt = useCallback(() => {
    if (activeResponseRef.current) send({ type: "response.cancel" });
    if (audioPlayingRef.current) {
      if (audioRef.current) audioRef.current.muted = true;
      send({ type: "output_audio_buffer.clear" });
    }
  }, [send]);

  /** Mientras la voz está activa, el texto escrito también va a la sesión de voz. */
  const sendText = useCallback(
    (text: string) => {
      const id = `voice_user_text_${Date.now().toString(36)}`;
      bridgeRef.current.setMessages((m) => [
        ...m,
        { id, role: "user", parts: [{ type: "text", text, state: "done" }], metadata: { source: "voice" } },
      ]);
      if (activeResponseRef.current) interrupt();
      send({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
      });
      requestResponse();
    },
    [interrupt, requestResponse, send],
  );

  return {
    status,
    error,
    isActive: status !== "idle",
    muted,
    audioBlocked,
    /** Reintenta la reproducción dentro de un toque del usuario. */
    resumeAudio: playAudio,
    tools,
    caption,
    streams,
    start,
    stop,
    toggleMute,
    interrupt,
    sendText,
    resolveDeviceCall,
    clearError: useCallback(() => setError(null), []),
  };
}

export type RealtimeVoice = ReturnType<typeof useRealtimeVoice>;
