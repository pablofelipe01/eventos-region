"use client";

const KEY = "alma:participant";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin O/0, I/1

/** Código anónimo por celular (P-XXXX), igual en todas las respuestas de la misma persona. */
export function getParticipantId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && /^P-[A-Z0-9]{4,8}$/.test(existing)) return existing;
  } catch {
    // almacenamiento no disponible: se genera uno nuevo por sesión
  }
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const id = `P-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // ignorar
  }
  return id;
}
