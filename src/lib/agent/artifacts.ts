/**
 * Lógica compartida (cliente y servidor) de artefactos.
 *
 * No hay base de datos en v1: el estado de los artefactos se deriva del
 * historial de mensajes (las partes `tool-createArtifact` / `tool-updateArtifact`
 * con salida disponible). Así el chat de texto y la voz comparten un único
 * origen de verdad: la lista de mensajes de `useChat`.
 */
import type {
  ArtifactKind,
  ArtifactToolOutput,
  CreateArtifactInput,
  UpdateArtifactInput,
} from "./tool-schemas";

export type ArtifactVersion = {
  version: number;
  content: string;
  changeSummary?: string;
};

export type Artifact = {
  id: string;
  title: string;
  kind: ArtifactKind;
  language?: string;
  content: string;
  version: number;
  versions: ArtifactVersion[];
};

/** Resumen mínimo para validar actualizaciones en el servidor. */
export type ArtifactRef = Pick<Artifact, "id" | "title" | "kind" | "language" | "version">;

export function newArtifactId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `art_${random}`;
}

type LooseToolPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
};

type LooseMessage = { parts: ReadonlyArray<{ type: string }> };

/**
 * Recorre los mensajes en orden y reconstruye los artefactos con todas sus
 * versiones. Devuelve la lista en orden de creación.
 */
export function collectArtifacts(messages: ReadonlyArray<LooseMessage>): Artifact[] {
  const byId = new Map<string, Artifact>();

  for (const message of messages) {
    for (const rawPart of message.parts) {
      const part = rawPart as LooseToolPart;
      if (part.state !== "output-available") continue;
      const output = part.output as ArtifactToolOutput | undefined;
      if (!output || output.ok !== true) continue;

      if (part.type === "tool-createArtifact") {
        const input = part.input as CreateArtifactInput;
        byId.set(output.artifactId, {
          id: output.artifactId,
          title: output.title,
          kind: output.kind,
          language: output.language,
          content: input.content,
          version: 1,
          versions: [{ version: 1, content: input.content }],
        });
      } else if (part.type === "tool-updateArtifact") {
        const input = part.input as UpdateArtifactInput;
        const existing = byId.get(output.artifactId);
        if (!existing) continue;
        existing.title = output.title;
        existing.content = input.content;
        existing.version = output.version;
        existing.versions.push({
          version: output.version,
          content: input.content,
          changeSummary: input.changeSummary,
        });
      }
    }
  }

  return [...byId.values()];
}

/** Registro mutable de artefactos conocidos (para validar `updateArtifact`). */
export class ArtifactRegistry {
  private readonly refs = new Map<string, ArtifactRef>();

  constructor(initial: ReadonlyArray<ArtifactRef> = []) {
    for (const ref of initial) this.refs.set(ref.id, { ...ref });
  }

  static fromMessages(messages: ReadonlyArray<LooseMessage>): ArtifactRegistry {
    return new ArtifactRegistry(
      collectArtifacts(messages).map(({ id, title, kind, language, version }) => ({
        id,
        title,
        kind,
        language,
        version,
      })),
    );
  }

  list(): ArtifactRef[] {
    return [...this.refs.values()];
  }

  create(input: CreateArtifactInput): ArtifactToolOutput {
    const id = newArtifactId();
    const language = input.kind === "code" ? input.language : undefined;
    this.refs.set(id, { id, title: input.title, kind: input.kind, language, version: 1 });
    return { ok: true, artifactId: id, title: input.title, kind: input.kind, language, version: 1 };
  }

  update(input: UpdateArtifactInput): ArtifactToolOutput {
    const ref = this.refs.get(input.artifactId);
    if (!ref) {
      const known = this.list()
        .map((a) => `${a.id} ("${a.title}")`)
        .join(", ");
      return {
        ok: false,
        code: "artifact_not_found",
        error: known
          ? `No existe un artefacto con id ${input.artifactId}. Artefactos disponibles: ${known}.`
          : `No existe un artefacto con id ${input.artifactId} y todavía no se ha creado ninguno. Usa createArtifact.`,
      };
    }
    ref.version += 1;
    if (input.title) ref.title = input.title;
    return {
      ok: true,
      artifactId: ref.id,
      title: ref.title,
      kind: ref.kind,
      language: ref.language,
      version: ref.version,
    };
  }
}
