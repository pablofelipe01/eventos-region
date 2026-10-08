import "server-only";
/**
 * Guardado de respuestas en Airtable (base "Alma — Las Moras", tabla Respuestas).
 *
 * 1. Crea el registro con los campos de texto.
 * 2. Sube el audio con la API de contenido de Airtable
 *    (POST content.airtable.com/v0/{base}/{record}/{campo}/uploadAttachment,
 *    base64, máximo 5 MB), que lo adjunta al registro.
 */
import { AIRTABLE, type AlmaObject, type Station } from "./config";

const API = "https://api.airtable.com/v0";
const CONTENT_API = "https://content.airtable.com/v0";

export class AirtableConfigError extends Error {
  readonly code = "missing_airtable_config";
}

function credentials() {
  const token = process.env.AIRTABLE_TOKEN?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) {
    throw new AirtableConfigError(
      "Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID. Añádelas en .env.local o en Vercel → Environment Variables.",
    );
  }
  return { token, baseId };
}

async function airtableError(response: Response, action: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { error?: { type?: string; message?: string } } | null;
  const detail = body?.error?.message ?? body?.error?.type ?? "";
  return new Error(`Airtable no pudo ${action} (${response.status})${detail ? `: ${detail}` : ""}`);
}

export type NewResponse = {
  participant: string;
  station: Station;
  question: string;
  object?: AlmaObject;
  transcript: string;
  durationSeconds: number;
  audio: { bytes: Uint8Array; mediaType: string; filename: string };
};

/** Crea el registro y adjunta el audio. Devuelve el id del registro. */
export async function saveResponse(input: NewResponse, signal?: AbortSignal): Promise<{ recordId: string }> {
  const { token, baseId } = credentials();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const f = AIRTABLE.fields;

  const fields: Record<string, unknown> = {
    [f.participant]: input.participant,
    [f.station]: input.station,
    [f.question]: input.question,
    [f.transcript]: input.transcript,
    [f.duration]: Math.round(input.durationSeconds),
  };
  if (input.object) fields[f.object] = input.object;

  const created = await fetch(`${API}/${baseId}/${encodeURIComponent(AIRTABLE.table)}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ fields, typecast: true }),
    signal,
  });
  if (!created.ok) throw await airtableError(created, "guardar la respuesta");
  const { id: recordId } = (await created.json()) as { id: string };

  const upload = await fetch(
    `${CONTENT_API}/${baseId}/${recordId}/${encodeURIComponent(f.audio)}/uploadAttachment`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        contentType: input.audio.mediaType,
        filename: input.audio.filename,
        file: Buffer.from(input.audio.bytes).toString("base64"),
      }),
      signal,
    },
  );
  if (!upload.ok) {
    // El registro (con transcripción) ya existe: se informa pero no se pierde la respuesta.
    const error = await airtableError(upload, "adjuntar el audio");
    console.error("[alma/airtable]", error.message, { recordId });
  }

  return { recordId };
}
