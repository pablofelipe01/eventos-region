"use client";

/**
 * Render de las herramientas del dispositivo en el hilo (chat y voz).
 *
 * Las interactivas (abrir, compartir, foto) muestran una tarjeta con botón:
 * el toque del usuario es la confirmación y, a la vez, el gesto que exigen los
 * navegadores para abrir otra app, el menú de compartir o la cámara. Al
 * terminar se llama a `onResult`, que entrega la salida al chat
 * (`addToolOutput`) o a la sesión de voz.
 */
import { useState } from "react";
import {
  buildOpenTarget,
  cancelledByUser,
  photoFromFile,
  shareOnDevice,
  type DeviceToolOutput,
} from "@/lib/device/device-actions";
import {
  isInteractiveDeviceTool,
  TOOL_LABELS,
  type DeviceActionOutput,
  type DeviceInfoOutput,
  type DeviceToolName,
  type LocationOutput,
  type OpenOnDeviceInput,
  type ShareContentInput,
  type TakePhotoInput,
  type TakePhotoOutput,
} from "@/lib/agent/tool-schemas";

export type DeviceResultHandler = (toolName: DeviceToolName, toolCallId: string, output: DeviceToolOutput) => void;

export type DeviceToolPart = {
  type: `tool-${DeviceToolName}`;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const card =
  "flex w-full max-w-sm flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-sky-600 px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

function StatusChip({ tone, children }: { tone: "running" | "done" | "error" | "muted"; children: React.ReactNode }) {
  const tones = {
    running: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
    done: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200",
    muted: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
  };
  const icon =
    tone === "running" ? <span className="size-2 animate-pulse rounded-full bg-current" /> : tone === "done" ? "✓" : tone === "error" ? "!" : "–";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function failureChip(output: { error: string; code?: string }) {
  return <StatusChip tone={output.code === "cancelled_by_user" ? "muted" : "error"}>{output.error}</StatusChip>;
}

/* ------------------------------------------------------------------ */
/* Resultados                                                          */
/* ------------------------------------------------------------------ */

function LocationResult({ output }: { output: Extract<LocationOutput, { ok: true }> }) {
  const [copied, setCopied] = useState(false);
  const coords = `${output.latitude}, ${output.longitude}`;
  return (
    <div className={card}>
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg leading-none">📍</span>
        <div className="min-w-0">
          <p className="font-medium">Tu ubicación</p>
          <p className="font-mono text-[13px] text-zinc-700 dark:text-zinc-300">{coords}</p>
          <p className="text-xs text-zinc-500">
            Precisión ±{output.accuracyMeters} m
            {output.altitudeMeters !== null ? ` · altitud ${output.altitudeMeters} m` : ""} ·{" "}
            {new Date(output.timestamp).toLocaleTimeString()}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={output.mapsUrl} target="_blank" rel="noopener noreferrer" className={primaryButton}>
          Abrir en Google Maps
        </a>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(coords)
              .then(() => setCopied(true))
              .catch(() => {});
          }}
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function DeviceInfoResult({ output }: { output: Extract<DeviceInfoOutput, { ok: true }> }) {
  const kind = { mobile: "Celular", tablet: "Tableta", desktop: "Computador" }[output.deviceType];
  const summary = [
    kind,
    output.os,
    output.browser,
    output.battery ? `${output.battery.levelPercent}%${output.battery.charging ? " (cargando)" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <details className="max-w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
      <summary className="cursor-pointer list-none text-xs font-medium text-zinc-600 dark:text-zinc-400">
        📱 {summary}
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        <dt>Hora local</dt>
        <dd>{output.localTime}</dd>
        <dt>Zona horaria</dt>
        <dd>{output.timeZone}</dd>
        <dt>Idioma</dt>
        <dd>{output.language}</dd>
        <dt>Conexión</dt>
        <dd>{output.online ? (output.connection ?? "en línea") : "sin conexión"}</dd>
        <dt>Pantalla</dt>
        <dd>
          {output.screen.width}×{output.screen.height} @{output.screen.pixelRatio}x
        </dd>
      </dl>
    </details>
  );
}

function PhotoResult({ output }: { output: Extract<TakePhotoOutput, { ok: true }> }) {
  if (!output.dataUrl) return <StatusChip tone="done">Foto enviada</StatusChip>;
  return (
    <figure className="my-1 max-w-[16rem] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL tomada en el dispositivo */}
      <img src={output.dataUrl} alt="Foto enviada a Región" className="block h-auto w-full" />
      <figcaption className="px-3 py-1.5 text-xs text-zinc-500">📷 Foto enviada a Región</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Tarjetas interactivas                                               */
/* ------------------------------------------------------------------ */

function OpenCard({ part, onResult }: { part: DeviceToolPart; onResult: DeviceResultHandler }) {
  const target = buildOpenTarget(part.input as OpenOnDeviceInput);
  if (!target.ok) return failureChip(target);
  const done = (output: DeviceActionOutput) => onResult("openOnDevice", part.toolCallId, output);
  return (
    <div className={card}>
      <p className="font-medium">↗ {target.summary}</p>
      {target.note && <p className="text-xs text-zinc-500">{target.note}</p>}
      <div className="flex flex-wrap gap-2">
        <a
          href={target.href}
          target={target.newTab ? "_blank" : undefined}
          rel="noopener noreferrer"
          className={primaryButton}
          onClick={() =>
            done({ ok: true, summary: `Se abrió en el dispositivo: ${target.summary}.`, href: target.href, note: target.note })
          }
        >
          Abrir
        </a>
        <button type="button" className={secondaryButton} onClick={() => done(cancelledByUser())}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ShareCard({ part, onResult }: { part: DeviceToolPart; onResult: DeviceResultHandler }) {
  const input = part.input as ShareContentInput;
  const [busy, setBusy] = useState(false);
  const preview = [input.title, input.text, input.url].filter(Boolean).join(" · ");
  return (
    <div className={card}>
      <p className="font-medium">⤴ Compartir</p>
      <p className="line-clamp-3 text-xs text-zinc-600 dark:text-zinc-400">{preview}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className={primaryButton}
          onClick={() => {
            setBusy(true);
            // navigator.share debe llamarse dentro de este mismo gesto.
            void shareOnDevice(input).then((output) => onResult("shareContent", part.toolCallId, output));
          }}
        >
          Compartir
        </button>
        <button
          type="button"
          disabled={busy}
          className={secondaryButton}
          onClick={() => onResult("shareContent", part.toolCallId, cancelledByUser())}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function PhotoCard({ part, onResult }: { part: DeviceToolPart; onResult: DeviceResultHandler }) {
  const input = (part.input ?? {}) as TakePhotoInput;
  const [busy, setBusy] = useState(false);

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    void photoFromFile(file).then((output) => {
      setBusy(false);
      onResult("takePhoto", part.toolCallId, output);
    });
  };

  return (
    <div className={card}>
      <p className="font-medium">📷 Región necesita una foto</p>
      {input.reason && <p className="text-xs text-zinc-600 dark:text-zinc-400">{input.reason}</p>}
      <div className="flex flex-wrap gap-2">
        <label className={`${primaryButton} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "Procesando…" : "Tomar foto"}
          <input
            type="file"
            accept="image/*"
            capture={input.camera === "front" ? "user" : "environment"}
            className="sr-only"
            onChange={onFile}
            disabled={busy}
          />
        </label>
        <label className={`${secondaryButton} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          Galería
          <input type="file" accept="image/*" className="sr-only" onChange={onFile} disabled={busy} />
        </label>
        <button
          type="button"
          disabled={busy}
          className={secondaryButton}
          onClick={() => onResult("takePhoto", part.toolCallId, cancelledByUser())}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function DeviceToolView({
  part,
  actionable,
  onResult,
}: {
  part: DeviceToolPart;
  /** La llamada sigue viva (último mensaje del chat o sesión de voz activa). */
  actionable: boolean;
  onResult: DeviceResultHandler;
}) {
  const name = part.type.slice("tool-".length) as DeviceToolName;
  const labels = TOOL_LABELS[name];

  if (part.state === "output-error") return <StatusChip tone="error">{`${labels.done}: ${part.errorText ?? "error"}`}</StatusChip>;

  if (part.state === "input-available" && isInteractiveDeviceTool(name)) {
    if (!actionable) return <StatusChip tone="muted">Acción sin completar</StatusChip>;
    if (name === "openOnDevice") return <OpenCard part={part} onResult={onResult} />;
    if (name === "shareContent") return <ShareCard part={part} onResult={onResult} />;
    return <PhotoCard part={part} onResult={onResult} />;
  }

  if (part.state !== "output-available") return <StatusChip tone="running">{labels.running}</StatusChip>;

  const output = part.output as DeviceToolOutput | undefined;
  if (!output) return null;
  if (!output.ok) return failureChip(output);

  switch (name) {
    case "getLocation":
      return <LocationResult output={output as Extract<LocationOutput, { ok: true }>} />;
    case "getDeviceInfo":
      return <DeviceInfoResult output={output as Extract<DeviceInfoOutput, { ok: true }>} />;
    case "takePhoto":
      return <PhotoResult output={output as Extract<TakePhotoOutput, { ok: true }>} />;
    default: {
      const action = output as Extract<DeviceActionOutput, { ok: true }>;
      return (
        <StatusChip tone="done">
          {name === "openOnDevice" && action.href ? (
            <a href={action.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {`${labels.done} — abrir de nuevo`}
            </a>
          ) : (
            labels.done
          )}
        </StatusChip>
      );
    }
  }
}
