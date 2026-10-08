"use client";

import { isToolUIPart } from "ai";
import {
  collectMessageSources,
  hostnameOf,
  isNativeWebSearchPart,
  nativeWebSearchQuery,
  nativeWebSearchSources,
} from "@/lib/agent/sources";
import { TOOL_LABELS, isDeviceToolName, isRegionToolName, type WebSource } from "@/lib/agent/tool-schemas";
import type { RegionUIMessage, RegionUIPart } from "@/lib/agent/types";
import { DeviceToolView, type DeviceResultHandler, type DeviceToolPart } from "./device-tool-view";
import { Markdown } from "./markdown";

type ToolPart = Extract<RegionUIPart, { toolCallId: string }>;

function Chip({
  tone,
  children,
  onClick,
}: {
  tone: "running" | "done" | "error";
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const tones = {
    running: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
    done: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200",
  };
  const className = `inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`;
  const icon = tone === "running" ? <span className="size-2 animate-pulse rounded-full bg-current" /> : tone === "done" ? "✓" : "!";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} hover:opacity-80`}>
      {icon}
      <span className="truncate">{children}</span>
    </button>
  ) : (
    <span className={className}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function SourceLinks({ sources, className = "" }: { sources: WebSource[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {sources.map((s, i) => (
        <li key={s.url} className="max-w-full">
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title={s.url}
            className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-emerald-400"
          >
            <span className="text-zinc-400">{i + 1}</span>
            <span className="truncate">{s.title?.trim() || hostnameOf(s.url)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Búsqueda web nativa del proveedor (chat de texto). */
function NativeWebSearchView({
  state,
  input,
  output,
  errorText,
}: {
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}) {
  if (state === "output-error") return <Chip tone="error">{`Búsqueda web: ${errorText ?? "error"}`}</Chip>;
  if (state !== "output-available") return <Chip tone="running">Buscando en la web…</Chip>;
  const query = nativeWebSearchQuery(input, output);
  const sources = nativeWebSearchSources(output);
  return (
    <details className="max-w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
      <summary className="cursor-pointer list-none text-xs font-medium text-zinc-600 dark:text-zinc-400">
        🔎 Búsqueda web{query ? `: "${query}"` : ""} · {sources.length} fuentes consultadas
      </summary>
      {sources.length > 0 && <SourceLinks sources={sources} className="mt-2" />}
    </details>
  );
}

type DeviceProps = {
  /** Las tarjetas del dispositivo de este mensaje aún pueden ejecutarse. */
  deviceActionable: boolean;
  onDeviceResult: DeviceResultHandler;
};

function ToolPartView({
  part,
  onOpenArtifact,
  deviceActionable,
  onDeviceResult,
}: { part: ToolPart; onOpenArtifact: (id: string) => void } & DeviceProps) {
  if (isNativeWebSearchPart(part)) {
    const loose = part as unknown as { state: string; input?: unknown; output?: unknown; errorText?: string };
    return <NativeWebSearchView {...loose} />;
  }
  if (part.type === "dynamic-tool") {
    // Herramientas internas del proveedor (p. ej. code_execution de Claude al filtrar resultados).
    return part.state === "output-available" || part.state === "output-error" ? null : (
      <Chip tone="running">Procesando resultados…</Chip>
    );
  }
  const name = part.type.slice("tool-".length);
  if (isDeviceToolName(name)) {
    return (
      <DeviceToolView
        part={part as unknown as DeviceToolPart}
        actionable={deviceActionable}
        onResult={onDeviceResult}
      />
    );
  }
  if (!isRegionToolName(name)) return null;
  const labels = TOOL_LABELS[name];

  if (part.state === "output-error") {
    return <Chip tone="error">{`${labels.done}: ${part.errorText}`}</Chip>;
  }
  if (part.state !== "output-available") {
    return <Chip tone="running">{labels.running}</Chip>;
  }

  switch (part.type) {
    case "tool-createArtifact":
    case "tool-updateArtifact": {
      const output = part.output;
      if (!output.ok) return <Chip tone="error">{output.error}</Chip>;
      return (
        <Chip tone="done" onClick={() => onOpenArtifact(output.artifactId)}>
          {`${labels.done}: ${output.title}${output.version > 1 ? ` (v${output.version})` : ""} — abrir`}
        </Chip>
      );
    }
    case "tool-generateImage": {
      const output = part.output;
      if (!output.ok) return <Chip tone="error">{output.error}</Chip>;
      if (!output.dataUrl) return <Chip tone="done">{labels.done}</Chip>;
      return (
        <figure className="my-1 max-w-sm overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL generada en tiempo real */}
          <img src={output.dataUrl} alt={output.prompt} className="block h-auto w-full" />
          <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-zinc-500">
            <span className="line-clamp-2">{output.prompt}</span>
            <a href={output.dataUrl} download="region-imagen" className="shrink-0 font-medium hover:underline">
              Descargar
            </a>
          </figcaption>
        </figure>
      );
    }
    case "tool-webSearch": {
      // Búsqueda de la voz: respuesta breve + fuentes (los enlaces van al pie del mensaje).
      const output = part.output;
      if (!output.ok) return <Chip tone="error">{`${labels.done}: ${output.error}`}</Chip>;
      return (
        <details className="max-w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
          <summary className="cursor-pointer list-none text-xs font-medium text-zinc-600 dark:text-zinc-400">
            🔎 {`${labels.done}: "${output.query}" · ${output.sources.length} fuentes`}
          </summary>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{output.answer}</p>
        </details>
      );
    }
    default:
      return null;
  }
}

export function MessageView({
  message,
  isStreaming,
  onOpenArtifact,
  deviceActionable,
  onDeviceResult,
}: {
  message: RegionUIMessage;
  isStreaming: boolean;
  onOpenArtifact: (id: string) => void;
} & DeviceProps) {
  const isUser = message.role === "user";
  const fromVoice = message.metadata?.source === "voice";
  const { cited } = isUser ? { cited: [] } : collectMessageSources(message.parts);

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[92%] flex-col gap-2 sm:max-w-[85%] ${isUser ? "items-end" : "items-start"}`}
      >
        {message.parts.map((part, index) => {
          const key = `${message.id}-${index}`;
          if (part.type === "text") {
            const pending = part.text.trim() === "";
            if (pending && !(fromVoice && part.state === "streaming")) return null;
            return isUser ? (
              <div
                key={key}
                className="rounded-2xl rounded-br-md bg-zinc-900 px-4 py-2.5 text-[15px] whitespace-pre-wrap text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                {fromVoice && <span className="mr-1.5 opacity-60" title="Por voz">🎙</span>}
                {pending ? <span className="opacity-60">…</span> : part.text}
              </div>
            ) : (
              <div key={key} className="text-[15px] text-zinc-800 dark:text-zinc-200">
                {fromVoice && (
                  <span className="mb-1 block text-[11px] font-medium text-zinc-400" title="Respuesta por voz">
                    🔊 voz
                  </span>
                )}
                <Markdown>{part.text}</Markdown>
              </div>
            );
          }
          if (part.type === "reasoning") {
            if (!part.text.trim()) return null;
            return (
              <details key={key} className="text-xs text-zinc-500">
                <summary className="cursor-pointer select-none">Razonamiento</summary>
                <p className="mt-1 whitespace-pre-wrap">{part.text}</p>
              </details>
            );
          }
          if (part.type === "source-url" || part.type === "source-document") {
            return null; // se agrupan en "Fuentes" al pie del mensaje
          }
          if (isToolUIPart(part)) {
            return (
              <ToolPartView
                key={key}
                part={part as ToolPart}
                onOpenArtifact={onOpenArtifact}
                deviceActionable={deviceActionable}
                onDeviceResult={onDeviceResult}
              />
            );
          }
          return null;
        })}
        {cited.length > 0 && (
          <div className="flex max-w-full flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-500">Fuentes</span>
            <SourceLinks sources={cited} />
          </div>
        )}
        {fromVoice && message.metadata?.interrupted && (
          <span className="text-[11px] text-zinc-400" title="El usuario habló encima de la respuesta">
            ⤷ interrumpido
          </span>
        )}
        {isStreaming && message.parts.length === 0 && <TypingDots />}
      </div>
    </div>
  );
}

export function TypingDots() {
  return (
    <div className="flex gap-1 py-2" aria-label="Región está escribiendo">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-2 animate-bounce rounded-full bg-zinc-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
