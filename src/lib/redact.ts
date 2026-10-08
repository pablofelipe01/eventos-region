/** Elimina posibles claves de API de un texto antes de mostrarlo o registrarlo. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_\-*]{6,}/g, "sk-***")
    .replace(/\bsk-ant-[A-Za-z0-9_\-*]{6,}/g, "sk-ant-***")
    .replace(/\btvly-[A-Za-z0-9_\-*]{6,}/g, "tvly-***")
    .replace(/\bek_[A-Za-z0-9_\-*]{6,}/g, "ek_***")
    .replace(/(Bearer\s+)[A-Za-z0-9._\-*]{8,}/gi, "$1***");
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return redactSecrets(error.message);
  if (typeof error === "string") return redactSecrets(error);
  return "Error desconocido";
}
