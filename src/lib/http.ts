import "server-only";

/** Respuesta JSON de error uniforme: `{ error: { code, message, ...extra } }`. */
export function jsonError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return Response.json(
    { error: { code, message, ...extra } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Protección básica contra uso cruzado desde otros sitios: si el navegador
 * envía `Origin`, debe coincidir con el host de esta app. (No sustituye a la
 * autenticación: ver README → "Seguridad".)
 */
export function rejectCrossOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return null;
  } catch {
    // Origin malformado: rechazar.
  }
  return jsonError(403, "forbidden_origin", "Origen no permitido.");
}

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: jsonError(400, "invalid_json", "El cuerpo de la petición debe ser JSON válido."),
    };
  }
}
