"use client";

/**
 * Grabador de una respuesta de voz, con los estados del diseño:
 *   idle → recording → processing → done (o error).
 * Graba con MediaRecorder, envía el audio a /api/alma/respuesta y avisa con
 * `onDone` cuando la respuesta quedó guardada.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RECORDING, type AlmaObject, type Station } from "@/lib/alma/config";
import { ArrowRightIcon } from "./icons";
import { getParticipantId } from "./participant";
import { primaryButton } from "./shell";

type Phase = "idle" | "recording" | "processing" | "done" | "error";

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" strokeLinecap="round" />
    </svg>
  );
}

/** Barras de onda a los lados del botón rojo (animadas con CSS). */
function Waveform({ side }: { side: "left" | "right" }) {
  const heights = [6, 14, 10, 22, 16, 28, 12, 20, 8, 16, 10, 6];
  const bars = side === "left" ? heights : [...heights].reverse();
  return (
    <div className={`flex min-w-0 items-center gap-[3px] overflow-hidden ${side === "left" ? "justify-end" : "justify-start"}`} aria-hidden>
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-[#e5484d]"
          style={{ height: h, animation: `alma-bar 900ms ease-in-out ${i * 70}ms infinite alternate` }}
        />
      ))}
    </div>
  );
}

function ProcessingIcon() {
  return (
    <div className="grid size-16 place-items-center rounded-full bg-[#dfe9d2]">
      <div className="flex items-center gap-[3px]" aria-hidden>
        {[6, 12, 20, 14, 24, 10, 16, 6].map((h, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-[#1f4d36]"
            style={{ height: h, animation: `alma-bar 800ms ease-in-out ${i * 90}ms infinite alternate` }}
          />
        ))}
      </div>
    </div>
  );
}

const format = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) =>
      MediaRecorder.isTypeSupported(t),
    ) ?? ""
  );
}

export function Recorder({
  station,
  question,
  object,
  trigger,
  onStart,
  onDone,
}: {
  station: Station;
  question: string;
  object?: AlmaObject;
  /**
   * En vez del botón redondo de micrófono, el estado inicial es un botón de
   * acción (p. ej. "¡Vamos!") que empieza a grabar al tocarlo.
   */
  trigger?: { label: string; disabled?: boolean };
  /** Se llama cuando empieza la grabación. */
  onStart?: () => void;
  /** Se llama cuando la respuesta quedó guardada (tras mostrar "¡Listo!"). */
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(
    () => () => {
      stopTimer();
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const upload = useCallback(
    async (blob: Blob, duration: number) => {
      setPhase("processing");
      const form = new FormData();
      form.set("audio", blob, "respuesta");
      form.set("participant", getParticipantId());
      form.set("station", station);
      form.set("question", question);
      if (object) form.set("object", object);
      form.set("duration", String(duration));
      try {
        const response = await fetch("/api/alma/respuesta", { method: "POST", body: form });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? `Error ${response.status}`);
        }
        setPhase("done");
        setTimeout(onDone, 1400);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar tu respuesta.");
        setPhase("error");
      }
    },
    [object, onDone, question, station],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    stopTimer();
    recorder.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Este navegador no permite grabar audio aquí (se necesita HTTPS).");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = Math.round((Date.now() - startedAtRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (blob.size === 0) {
          setError("No se grabó nada. Intenta de nuevo.");
          setPhase("error");
          return;
        }
        void upload(blob, duration);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setSeconds(0);
      recorder.start(1000);
      setPhase("recording");
      onStart?.();
      timerRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= RECORDING.maxSeconds) stop();
      }, 250);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Necesitamos permiso para usar el micrófono. Actívalo y vuelve a intentar."
          : err instanceof Error
            ? err.message
            : "No se pudo iniciar la grabación.",
      );
      setPhase("error");
    }
  }, [onStart, stop, upload]);

  if (phase === "processing" || phase === "done") {
    return (
      <div className="flex flex-col items-center gap-5" aria-live="polite">
        {phase === "done" ? (
          <div className="grid size-16 place-items-center rounded-full bg-[#dfe9d2] text-[#1f4d36]">
            <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <ProcessingIcon />
        )}
        <h2 className="text-3xl font-extrabold">¡Listo!</h2>
        <p className="whitespace-pre-line text-[#2f4a3c]">
          {phase === "done" ? "Tu respuesta quedó guardada." : "Estamos procesando\ntu respuesta…"}
        </p>
      </div>
    );
  }

  if (phase === "recording") {
    return (
      <div className="flex w-full flex-col items-center gap-6">
        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <Waveform side="left" />
          <button
            type="button"
            onClick={stop}
            aria-label="Detener grabación"
            className="relative grid size-24 place-items-center rounded-full bg-[#e5484d] text-white shadow-lg shadow-[#e5484d]/30 active:scale-95"
          >
            <span className="absolute -inset-5 -z-10 rounded-full bg-[#e5484d]/15" />
            <span className="absolute -inset-10 -z-20 rounded-full bg-[#e5484d]/8" />
            <span className="size-7 rounded-md bg-white" />
          </button>
          <Waveform side="right" />
        </div>
        <p className="text-2xl font-bold tabular-nums" aria-live="off">
          {format(seconds)}
        </p>
        <p className="text-sm text-[#5b6f63]">Presiona para detener</p>
      </div>
    );
  }

  const errorBox = phase === "error" && error && (
    <p role="alert" className="max-w-xs rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </p>
  );

  if (trigger) {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <button type="button" onClick={start} disabled={trigger.disabled} className={primaryButton}>
          {trigger.label}
          <ArrowRightIcon className="size-5" />
        </button>
        {errorBox}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <button
        type="button"
        onClick={start}
        aria-label="Grabar respuesta"
        className="relative grid size-24 place-items-center rounded-full bg-[#1f4d36] text-white shadow-lg shadow-[#1f4d36]/30 active:scale-95"
      >
        <span className="absolute -inset-5 -z-10 rounded-full bg-[#1f4d36]/10" />
        <MicIcon className="size-10" />
      </button>
      <p className="text-sm leading-snug text-[#5b6f63]">
        Presiona para grabar
        <br />
        tu respuesta
      </p>
      {errorBox}
    </div>
  );
}
