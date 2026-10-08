"use client";

/**
 * Modo voz: orbe con el estado en vivo (escuchando / hablas tú / habla Región /
 * pensando / usando una herramienta), subtítulos parciales y controles
 * (silenciar micrófono, interrumpir, colgar).
 */     
import { useEffect, useRef } from "react";
import type { RealtimeVoice } from "./use-realtime-voice";

export type VoiceDisplayState = "connecting" | "listening" | "user" | "thinking" | "tool" | "assistant" | "muted";

export function voiceDisplayState(voice: Pick<RealtimeVoice, "status" | "tools" | "muted">): VoiceDisplayState {
  if (voice.status === "connecting") return "connecting";
  if (voice.status === "speaking") return "assistant";
  if (voice.status === "user-speaking") return "user";
  if (voice.tools.length > 0) return "tool";
  if (voice.status === "thinking") return "thinking";
  return voice.muted ? "muted" : "listening";
}

const ORB_STYLES: Record<VoiceDisplayState, { orb: string; ring: string }> = {
  connecting: { orb: "from-zinc-300 to-zinc-500 dark:from-zinc-600 dark:to-zinc-800", ring: "border-zinc-300 animate-pulse" },
  listening: { orb: "from-emerald-300 to-teal-600", ring: "border-emerald-300/70 animate-pulse" },
  muted: { orb: "from-zinc-300 to-zinc-500 dark:from-zinc-600 dark:to-zinc-800", ring: "border-zinc-300" },
  user: { orb: "from-emerald-400 to-emerald-700", ring: "border-emerald-400" },
  thinking: { orb: "from-amber-300 to-orange-500", ring: "border-amber-300 border-dashed animate-spin" },
  tool: { orb: "from-violet-400 to-fuchsia-600", ring: "border-violet-400 border-dashed animate-spin" },
  assistant: { orb: "from-sky-400 to-indigo-600", ring: "border-sky-400" },
};

/** Escribe el nivel de audio (0–1) de un stream en una variable CSS, sin re-renders. */
function useAudioLevel(stream: MediaStream | null, target: React.RefObject<HTMLElement | null>, cssVar: string) {
  useEffect(() => {
    const element = target.current;
    if (!stream || !element || typeof AudioContext === "undefined" || stream.getAudioTracks().length === 0) return;
    let frame = 0;
    const context = new AudioContext();
    void context.resume().catch(() => {});
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let smoothed = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      smoothed = smoothed * 0.7 + Math.min(1, rms * 4) * 0.3;
      element.style.setProperty(cssVar, smoothed.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close().catch(() => {});
      element.style.setProperty(cssVar, "0");
    };
  }, [stream, target, cssVar]);
}

const LABELS: Record<VoiceDisplayState, string> = {
  connecting: "Conectando…",
  listening: "Te escucho — habla cuando quieras",
  muted: "Micrófono silenciado",
  user: "Escuchándote…",
  thinking: "Pensando…",
  tool: "Usando una herramienta…",
  assistant: "Región está hablando · puedes interrumpirla",
};

export function VoicePanel({ voice, compact = false }: { voice: RealtimeVoice; compact?: boolean }) {
  const state = voiceDisplayState(voice);
  const orbRef = useRef<HTMLDivElement>(null);
  // La versión compacta (sobre el panel de artefactos en móvil) no mide niveles de audio.
  useAudioLevel(compact || voice.muted ? null : voice.streams.mic, orbRef, "--mic-level");
  useAudioLevel(compact ? null : voice.streams.remote, orbRef, "--out-level");

  const style = ORB_STYLES[state];
  const label = state === "tool" ? voice.tools.map((t) => t.label).join(" · ") : LABELS[state];
  const canInterrupt = state === "assistant" || state === "thinking";

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white/95 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/95 ${
        compact ? "p-2 shadow-lg" : "p-3"
      }`}
      data-testid={compact ? "voice-panel-compact" : "voice-panel"}
      data-voice-state={state}
    >
      <div
        ref={orbRef}
        className={`relative grid shrink-0 place-items-center ${compact ? "size-9" : "size-14"}`}
        style={{ ["--mic-level" as string]: 0, ["--out-level" as string]: 0 }}
        aria-hidden
      >
        <span className={`absolute inset-0 rounded-full border-2 ${style.ring}`} />
        <span
          className={`${compact ? "size-6" : "size-10"} rounded-full bg-gradient-to-br shadow-inner transition-transform duration-75 ${style.orb}`}
          style={{
            transform:
              state === "assistant"
                ? "scale(calc(1 + var(--out-level) * 0.35))"
                : state === "user" || state === "listening"
                  ? "scale(calc(1 + var(--mic-level) * 0.35))"
                  : undefined,
          }}
        />
      </div>

      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="truncate text-sm font-medium" data-testid="voice-label">
          {label}
        </p>
        {compact ? null : voice.caption?.text ? (
          <p className="line-clamp-2 text-xs text-zinc-500" data-testid="voice-caption">
            <span className="font-medium">{voice.caption.role === "user" ? "Tú: " : "Región: "}</span>
            {voice.caption.text}
          </p>
        ) : (
          <p className="text-xs text-zinc-400">Habla y escucha a la vez; lo que escribas también entra en la llamada.</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {voice.audioBlocked && (
          <button
            type="button"
            onClick={voice.resumeAudio}
            className="animate-pulse rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            title="El navegador bloqueó el sonido; toca para escuchar a Región"
          >
            🔊 Activar sonido
          </button>
        )}
        {canInterrupt && !compact && (
          <button
            type="button"
            onClick={voice.interrupt}
            className="hidden rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-100 sm:block dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Interrumpir
          </button>
        )}
        <button
          type="button"
          onClick={voice.toggleMute}
          disabled={state === "connecting"}
          aria-pressed={voice.muted}
          aria-label={voice.muted ? "Activar micrófono" : "Silenciar micrófono"}
          title={voice.muted ? "Activar micrófono" : "Silenciar micrófono"}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${
            voice.muted
              ? "bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-100"
              : "border border-zinc-200 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
        >
          {voice.muted ? "Activar mic" : "Silenciar"}
        </button>
        <button
          type="button"
          onClick={voice.stop}
          aria-label="Terminar conversación de voz"
          className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-600"
        >
          Colgar
        </button>
      </div>
    </div>
  );
}
