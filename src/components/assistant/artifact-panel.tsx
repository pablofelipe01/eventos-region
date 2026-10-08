"use client";

import { useState } from "react";
import type { Artifact } from "@/lib/agent/artifacts";
import { Markdown } from "./markdown";

const EXTENSIONS: Record<string, string> = {
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  jsx: "jsx",
  python: "py",
  py: "py",
  sql: "sql",
  bash: "sh",
  shell: "sh",
  sh: "sh",
  json: "json",
  css: "css",
  html: "html",
  java: "java",
  go: "go",
  rust: "rs",
  ruby: "rb",
  php: "php",
  csharp: "cs",
  "c#": "cs",
  kotlin: "kt",
  swift: "swift",
  yaml: "yml",
};

function fileInfo(artifact: Artifact): { filename: string; mime: string } {
  const base =
    artifact.title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "artefacto";
  switch (artifact.kind) {
    case "html":
      return { filename: `${base}.html`, mime: "text/html" };
    case "document":
      return { filename: `${base}.md`, mime: "text/markdown" };
    case "code": {
      const ext = EXTENSIONS[(artifact.language ?? "").toLowerCase()] ?? "txt";
      return { filename: `${base}.${ext}`, mime: "text/plain" };
    }
  }
}

const KIND_LABEL: Record<Artifact["kind"], string> = {
  document: "Documento",
  code: "Código",
  html: "HTML",
};

function CodeView({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <pre className="min-h-full overflow-auto bg-zinc-950 py-3 font-mono text-[13px] leading-relaxed text-zinc-100">
      <code className="grid grid-cols-[auto_1fr]">
        {lines.map((line, i) => (
          <span key={i} className="contents">
            <span className="select-none pr-4 pl-3 text-right text-zinc-600">{i + 1}</span>
            <span className="pr-4 whitespace-pre">{line || " "}</span>
          </span>
        ))}
      </code>
    </pre>
  );
}

export function ArtifactPanel({
  artifacts,
  selectedId,
  onSelect,
  onClose,
}: {
  artifacts: Artifact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const artifact = artifacts.find((a) => a.id === selectedId) ?? artifacts.at(-1);
  // Vista por artefacto: "preview" o "source" (solo aplica a HTML y documentos).
  const [viewById, setViewById] = useState<Record<string, "preview" | "source">>({});
  // Versión elegida por artefacto (por defecto, la última).
  const [versionById, setVersionById] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);

  if (!artifact) return null;

  const view = viewById[artifact.id] ?? "preview";
  const selectedVersion = versionById[artifact.id];
  const versionEntry =
    artifact.versions.find((v) => v.version === selectedVersion) ?? artifact.versions.at(-1)!;
  const content = versionEntry.content;
  const isLatest = versionEntry.version === artifact.version;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // portapapeles no disponible
    }
  };

  const download = () => {
    const { filename, mime } = fileInfo(artifact);
    const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const buttonClass =
    "rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800";

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        {artifacts.length > 1 ? (
          <select
            aria-label="Elegir artefacto"
            className="min-w-0 flex-1 truncate rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-sm font-semibold dark:border-zinc-700"
            value={artifact.id}
            onChange={(e) => onSelect(e.target.value)}
          >
            {artifacts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        ) : (
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{artifact.title}</h2>
        )}
        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {KIND_LABEL[artifact.kind]}
          {artifact.language ? ` · ${artifact.language}` : ""}
        </span>
        <button type="button" onClick={onClose} className={buttonClass} aria-label="Cerrar panel">
          ✕
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
        {artifact.kind !== "code" && (
          <div className="mr-2 flex rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-800">
            {(["preview", "source"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewById((s) => ({ ...s, [artifact.id]: v }))}
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  view === v
                    ? "bg-white shadow-sm dark:bg-zinc-950"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {v === "preview" ? "Vista previa" : "Código fuente"}
              </button>
            ))}
          </div>
        )}
        {artifact.versions.length > 1 && (
          <select
            aria-label="Versión"
            className="rounded-md border border-zinc-200 bg-transparent px-1.5 py-0.5 text-xs dark:border-zinc-700"
            value={versionEntry.version}
            onChange={(e) => setVersionById((s) => ({ ...s, [artifact.id]: Number(e.target.value) }))}
          >
            {artifact.versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
                {v.version === artifact.version ? " (actual)" : ""}
              </option>
            ))}
          </select>
        )}
        {!isLatest && <span className="text-[11px] text-amber-600">Versión anterior</span>}
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={copy} className={buttonClass}>
            {copied ? "¡Copiado!" : "Copiar"}
          </button>
          <button type="button" onClick={download} className={buttonClass}>
            Descargar
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {artifact.kind === "html" && view === "preview" ? (
          <iframe
            key={`${artifact.id}-${versionEntry.version}`}
            title={artifact.title}
            sandbox="allow-scripts"
            srcDoc={content}
            className="h-full w-full bg-white"
          />
        ) : artifact.kind === "document" && view === "preview" ? (
          <div className="px-5 py-4 text-[15px] text-zinc-800 dark:text-zinc-200">
            <Markdown>{content}</Markdown>
          </div>
        ) : (
          <CodeView content={content} />
        )}
      </div>
    </div>
  );
}
