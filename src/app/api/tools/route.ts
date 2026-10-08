import { runServerTool } from "@/lib/agent/tools";
import { jsonError, readJson, rejectCrossOrigin } from "@/lib/http";

// Generar una imagen puede tardar bastante; con Fluid Compute el máximo es 300 s.
export const maxDuration = 300;

/**
 * Ejecuta herramientas de servidor pedidas por la sesión de voz
 * (`generateImage`) reutilizando la misma implementación que el chat de texto.
 * Solo admite las herramientas cuyo endpoint es esta ruta en
 * SERVER_TOOL_ENDPOINTS; los argumentos se validan con zod.
 * `webSearch` tiene su propia ruta (/api/web-search) y las herramientas de
 * artefactos se ejecutan en el navegador.
 */
export async function POST(request: Request) {
  const forbidden = rejectCrossOrigin(request);
  if (forbidden) return forbidden;

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const { name, args } = (parsed.body ?? {}) as { name?: unknown; args?: unknown };

  if (name !== "generateImage") {
    return jsonError(400, "unknown_tool", `Herramienta no permitida: ${String(name)}`);
  }

  const result = await runServerTool(name, args, request.signal);
  return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
}
