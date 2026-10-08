"use client";

import { isToolUIPart } from "ai";
import { TOOL_LABELS, isRegionToolName } from "@/lib/agent/tool-schemas";
import type { RegionUIMessage, RegionUIPart } from "@/lib/agent/types";
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

function ToolPartView({ part, onOpenArtifact }: { part: ToolPart; onOpenArtifact: (id: string) => void }) {
  const name = part.type.slice("tool-".length);
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
      const output = part.output;
      if (!output.ok) return <Chip tone="error">{output.error}</Chip>;
      return (
        <details className="group max-w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
          <summary className="cursor-pointer list-none text-xs font-medium text-zinc-600 dark:text-zinc-400">
            🔎 {`${labels.done}: "${output.query}" · ${output.results.length} resultados`}
          </summary>
          <ul className="mt-2 space-y-2">
            {output.results.map((r) => (
              <li key={r.url}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {r.title}
                </a>
                <p className="line-clamp-2 text-xs text-zinc-500">{r.snippet}</p>
              </li>
            ))}
          </ul>
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
}: {
  message: RegionUIMessage;
  isStreaming: boolean;
  onOpenArtifact: (id: string) => void;
}) {
  const isUser = message.role === "user";
  const fromVoice = message.metadata?.source === "voice";

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
          if (part.type === "source-url") {
            return (
              <a
                key={key}
                href={part.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-700 hover:underline dark:text-emerald-400"
              >
                {part.title ?? part.url}
              </a>
            );
          }
          if (isToolUIPart(part)) {
            return <ToolPartView key={key} part={part as ToolPart} onOpenArtifact={onOpenArtifact} />;
          }
          return null;
        })}
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
