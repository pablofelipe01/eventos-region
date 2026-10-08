import { createOpenAI } from "@ai-sdk/openai";
import { transcribe } from "ai";
import { AirtableConfigError, saveResponse } from "@/lib/alma/airtable";
import { OBJECTS, RECORDING, STATIONS, type AlmaObject, type Station } from "@/lib/alma/config";
import { jsonError, rejectCrossOrigin } from "@/lib/http";
import { errorMessage } from "@/lib/redact";

// Transcribir y subir a Airtable puede tardar más de 10 s con audios largos.
export const maxDuration = 120;

const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Recibe una respuesta grabada (multipart/form-data):
 *   audio (Blob), participant, station, question, object?, duration
 * La transcribe con OpenAI y la guarda en Airtable.
 */
export async function POST(request: Request) {
  const forbidden = rejectCrossOrigin(request);
  if (forbidden) return forbidden;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "invalid_form", "Se esperaba multipart/form-data.");
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return jsonError(400, "missing_audio", "No llegó ningún audio.");
  }
  if (audio.size > RECORDING.maxBytes) {
    return jsonError(413, "audio_too_large", "El audio supera los 5 MB permitidos.");
  }

  const participant = field(form, "participant");
  const station = field(form, "station") as Station;
  const question = field(form, "question");
  const object = field(form, "object") as AlmaObject | "";
  const duration = Number(field(form, "duration")) || 0;

  if (!/^P-[A-Z0-9]{4,8}$/.test(participant)) {
    return jsonError(400, "invalid_participant", "Código de participante inválido.");
  }
  if (!STATIONS.includes(station)) return jsonError(400, "invalid_station", "Estación desconocida.");
  if (!question || question.length > 300) return jsonError(400, "invalid_question", "Pregunta inválida.");
  if (object && !OBJECTS.includes(object)) return jsonError(400, "invalid_object", "Objeto desconocido.");

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(500, "missing_api_key", "Falta OPENAI_API_KEY para transcribir el audio.", {
      envKey: "OPENAI_API_KEY",
    });
  }

  const mediaType = (audio.type || "audio/webm").split(";")[0];
  const bytes = new Uint8Array(await audio.arrayBuffer());

  // 1. Transcripción (si falla, la respuesta se guarda igual con el audio).
  let transcript = "";
  try {
    const result = await transcribe({
      model: createOpenAI({ apiKey }).transcription(TRANSCRIPTION_MODEL),
      audio: bytes,
      providerOptions: { openai: { language: "es" } },
      abortSignal: request.signal,
    });
    transcript = result.text.trim();
  } catch (error) {
    console.error("[api/alma/respuesta] transcripción falló", error);
    transcript = "(no se pudo transcribir el audio)";
  }

  // 2. Airtable.
  try {
    const { recordId } = await saveResponse(
      {
        participant,
        station,
        question,
        object: object || undefined,
        transcript,
        durationSeconds: duration,
        audio: {
          bytes,
          mediaType,
          filename: `${participant}-${Date.now()}.${EXTENSIONS[mediaType] ?? "webm"}`,
        },
      },
      request.signal,
    );
    return Response.json({ ok: true, recordId, transcript }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AirtableConfigError) return jsonError(500, error.code, error.message);
    console.error("[api/alma/respuesta] Airtable falló", error);
    return jsonError(502, "airtable_failed", `No se pudo guardar la respuesta: ${errorMessage(error)}`);
  }
}
