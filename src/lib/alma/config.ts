/**
 * Configuración de la experiencia "Alma" (Las Moras): estaciones, preguntas y
 * objetos. Sin secretos: se importa desde cliente y servidor.
 */

export const STATIONS = ["Misión 1", "Mesa de las herramientas"] as const;
export type Station = (typeof STATIONS)[number];

export const MISSION_QUESTIONS = [
  { id: "expectativa", title: "¿Qué crees que va a pasar hoy aquí?", hint: null },
  {
    id: "quien-eres",
    title: "Cuéntanos de ti",
    hint: "¿Quién eres, dónde vives, qué haces y qué te gusta de tu vida?",
  },
] as const;

export const OBJECTS = ["Machete", "Sombrero", "Botas", "Frutos"] as const;
export type AlmaObject = (typeof OBJECTS)[number];

export const TABLE_QUESTION =
  "Elige un objeto con el que te conectes y cuéntanos una historia de tu vida relacionada con ese objeto o que te recuerde ese objeto.";

export const RECORDING = {
  /** Segundos máximos por respuesta (Airtable admite adjuntos de hasta 5 MB por subida). */
  maxSeconds: 180,
  /** Bytes máximos aceptados por el servidor. */
  maxBytes: 5 * 1024 * 1024,
} as const;

export const AIRTABLE = {
  table: "Respuestas",
  fields: {
    participant: "Participante",
    station: "Estación",
    question: "Pregunta",
    object: "Objeto",
    audio: "Audio",
    transcript: "Transcripción",
    duration: "Duración (s)",
  },
} as const;
