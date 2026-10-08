"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collectArtifacts } from "@/lib/agent/artifacts";
import { CHAT_MODELS, FALLBACK_PROVIDER, PROVIDERS, type ProviderId } from "@/lib/agent/config";
import { readableError, sanitizeMessagesForRequest } from "@/lib/agent/message-utils";
import type { PublicAgentConfig } from "@/lib/agent/models";
import type { ArtifactToolOutput } from "@/lib/agent/tool-schemas";
import type { RegionUIMessage } from "@/lib/agent/types";
import { ArtifactPanel } from "./artifact-panel";
import { MessageView, TypingDots } from "./message-view";
import { useRealtimeVoice, type VoiceStatus } from "./use-realtime-voice";

const transport = new DefaultChatTransport<RegionUIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
    body: { ...body, id, messages: sanitizeMessagesForRequest(messages), trigger, messageId },
  }),
});

const SUGGESTIONS = [
  "Crea una landing page en HTML para un festival de música en Medellín",
  "Genera una imagen de un atardecer en el Eje Cafetero, estilo acuarela",
  "Busca las noticias más recientes sobre IA en Colombia y resúmelas",
  "Escríbeme un script en Python que lea un CSV y calcule promedios por columna",
];

const VOICE_LABELS: Record<VoiceStatus, string> = {
  idle: "",
  connecting: "Conectando voz…",
  listening: "Escuchando — habla cuando quieras",
  "user-speaking": "Te escucho…",
  thinking: "Pensando…",
  speaking: "Región está hablando",
  tool: "Usando una herramienta…",
};

/** Último artefacto creado/actualizado (para abrir el panel automáticamente). */
function lastArtifactActivity(messages: RegionUIMessage[]): { id: string; key: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i].parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (
        (part.type === "tool-createArtifact" || part.type === "tool-updateArtifact") &&
        part.state === "output-available"
      ) {
        const output = part.output as ArtifactToolOutput;
        if (output.ok) return { id: output.artifactId, key: `${output.artifactId}:${output.version}` };
      }
    }
  }
  return null;
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  );
}

export function Assistant() {
  const [config, setConfig] = useState<PublicAgentConfig | null>(null);
  const [providerChoice, setProviderChoice] = useState<ProviderId | null>(null);
  const provider = providerChoice ?? config?.defaultProvider ?? FALLBACK_PROVIDER;
  const [input, setInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? (r.json() as Promise<PublicAgentConfig>) : null))
      .then((data) => {
        if (!cancelled && data) setConfig(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const { messages, sendMessage, status, error, stop, setMessages, clearError, regenerate } =
    // id fijo: si no, useChat llama a generateId() (Math.random) durante el prerender,
    // algo que Cache Components no permite. Solo hay una conversación por pestaña.
    useChat<RegionUIMessage>({ id: "region", transport });

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const getMessages = useCallback(() => messagesRef.current, []);

  const voice = useRealtimeVoice({ getMessages, setMessages });

  /* ---------------- Artefactos ---------------- */
  const artifacts = useMemo(() => collectArtifacts(messages), [messages]);
  const activity = useMemo(() => lastArtifactActivity(messages), [messages]);
  const activityKey = activity?.key ?? null;
  const [manualSelection, setManualSelection] = useState<{ id: string; key: string | null } | null>(null);
  const [closedAtKey, setClosedAtKey] = useState<string | null>(null);
  const selectedId =
    manualSelection && manualSelection.key === activityKey ? manualSelection.id : (activity?.id ?? null);
  const panelOpen = artifacts.length > 0 && closedAtKey !== activityKey;

  const openArtifact = useCallback(
    (id: string) => {
      setManualSelection({ id, key: activityKey });
      setClosedAtKey(null);
    },
    [activityKey],
  );
  const closePanel = useCallback(() => setClosedAtKey(activityKey), [activityKey]);

  /* ---------------- Scroll ---------------- */
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  /* ---------------- Envío ---------------- */
  const busy = status === "submitted" || status === "streaming";

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (voice.isActive) {
      voice.sendText(trimmed);
    } else {
      if (busy) return;
      void sendMessage({ text: trimmed, metadata: { source: "text" } }, { body: { provider } });
    }
    setInput("");
  };

  const providerInfo = config?.providers.find((p) => p.id === provider);
  const missingKey = providerInfo && !providerInfo.configured ? CHAT_MODELS[provider].envKey : null;
  const lastMessage = messages.at(-1);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* ---------------- Chat ---------------- */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-sky-600 text-sm font-bold text-white">
              R
            </span>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold">Región</h1>
              <p className="hidden text-[11px] text-zinc-500 sm:block">Asistente de IA · texto y voz</p>
            </div>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <label className="sr-only" htmlFor="model-select">
              Modelo
            </label>
            <select
              id="model-select"
              value={provider}
              onChange={(e) => setProviderChoice(e.target.value as ProviderId)}
              className="min-w-0 max-w-[44vw] truncate rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm sm:max-w-none dark:border-zinc-700 dark:bg-zinc-900"
              title="Modelo para el chat de texto"
            >
              {PROVIDERS.map((id) => (
                <option key={id} value={id}>
                  {CHAT_MODELS[id].label}
                </option>
              ))}
            </select>
            {artifacts.length > 0 && (
              <button
                type="button"
                onClick={() => (panelOpen ? closePanel() : setClosedAtKey(null))}
                className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Artefactos <span className="text-zinc-500">({artifacts.length})</span>
              </button>
            )}
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
            {messages.length === 0 ? (
              <div className="mt-[12vh] flex flex-col items-center gap-6 text-center">
                <div>
                  <h2 className="text-2xl font-semibold">¿Qué creamos hoy?</h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    Escríbeme o pulsa el micrófono para hablar. Puedo crear documentos, código, páginas web,
                    imágenes y buscar en la web.
                  </p>
                </div>
                <div className="grid w-full gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageView
                  key={message.id}
                  message={message}
                  isStreaming={busy && message.id === lastMessage?.id}
                  onOpenArtifact={openArtifact}
                />
              ))
            )}
            {status === "submitted" && lastMessage?.role === "user" && <TypingDots />}
          </div>
        </div>

        <footer className="border-t border-zinc-200 bg-white/70 px-4 pt-2 pb-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {missingKey && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                Falta <code className="font-mono">{missingKey}</code> en el servidor: el chat con este modelo no
                funcionará hasta configurarla.
              </p>
            )}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
                <p className="flex-1">{readableError(error)}</p>
                <button
                  type="button"
                  className="shrink-0 font-medium hover:underline"
                  onClick={() => {
                    clearError();
                    void regenerate({ body: { provider } });
                  }}
                >
                  Reintentar
                </button>
                <button type="button" className="shrink-0 hover:underline" onClick={clearError}>
                  Cerrar
                </button>
              </div>
            )}
            {voice.error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
                <p className="flex-1">Voz: {readableError(voice.error)}</p>
                <button type="button" className="shrink-0 hover:underline" onClick={voice.clearError}>
                  Cerrar
                </button>
              </div>
            )}
            {voice.isActive && (
              <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400" aria-live="polite">
                <span
                  className={`size-2 rounded-full ${
                    voice.status === "speaking"
                      ? "animate-pulse bg-sky-500"
                      : voice.status === "user-speaking"
                        ? "animate-pulse bg-emerald-500"
                        : voice.status === "connecting"
                          ? "animate-pulse bg-zinc-400"
                          : "bg-emerald-500"
                  }`}
                />
                {VOICE_LABELS[voice.status]}
                <span className="text-zinc-400">· lo que escribas también va a la conversación de voz</span>
              </div>
            )}

            <form
              className="flex items-end gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm focus-within:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
            >
              <button
                type="button"
                onClick={() => (voice.isActive ? voice.stop() : void voice.start())}
                disabled={!voice.isActive && busy}
                aria-pressed={voice.isActive}
                aria-label={voice.isActive ? "Terminar conversación de voz" : "Hablar con Región"}
                title={voice.isActive ? "Terminar voz" : "Hablar (voz en tiempo real)"}
                className={`relative grid size-10 shrink-0 place-items-center rounded-xl transition disabled:opacity-40 ${
                  voice.isActive
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {voice.isActive && voice.status !== "connecting" && (
                  <span className="absolute inset-0 animate-ping rounded-xl bg-red-400 opacity-30" />
                )}
                <MicIcon className="relative size-5" />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
                rows={1}
                placeholder={voice.isActive ? "Habla o escribe…" : "Escribe un mensaje…"}
                className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none field-sizing-content placeholder:text-zinc-400"
              />
              {busy && !voice.isActive ? (
                <button
                  type="button"
                  onClick={() => void stop()}
                  className="h-10 shrink-0 rounded-xl bg-zinc-200 px-4 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  Detener
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="h-10 shrink-0 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  Enviar
                </button>
              )}
            </form>
            <p className="text-center text-[11px] text-zinc-400">
              Región puede equivocarse. Verifica la información importante.
            </p>
          </div>
        </footer>
      </section>

      {/* ---------------- Panel de artefactos ---------------- */}
      {panelOpen && (
        <aside className="fixed inset-0 z-30 flex animate-slide-in flex-col bg-white md:static md:z-auto md:w-[46%] md:max-w-[760px] md:border-l md:border-zinc-200 dark:bg-zinc-900 md:dark:border-zinc-800">
          <ArtifactPanel
            artifacts={artifacts}
            selectedId={selectedId}
            onSelect={openArtifact}
            onClose={closePanel}
          />
        </aside>
      )}
    </div>
  );
}
