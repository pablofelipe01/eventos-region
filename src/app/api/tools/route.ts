import { isServerExecutedTool } from "@/lib/agent/tool-schemas";
import { runServerTool } from "@/lib/agent/tools";
import { jsonError, readJson, rejectCrossOrigin } from "@/lib/http";

// Generar una imagen puede tardar bastante; con Fluid Compute el máximo es 300 s.
export const maxDuration = 300;

/**
 * Ejecuta herramientas de servidor pedidas por la sesión de voz
 * (`generateImage`, `webSearch`) reutilizando la misma implementación que el
 * chat de texto. Solo admite las herramientas de la lista blanca
 * SERVER_EXECUTED_TOOLS; los argumentos se validan con zod.
 * Las herramientas de artefactos se ejecutan en el cliente.
 */
export async function POST(request: Request) {
  const forbidden = rejectCrossOrigin(request);
  if (forbidden) return forbidden;

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const { name, args } = (parsed.body ?? {}) as { name?: unknown; args?: unknown };

  if (typeof name !== "string" || !isServerExecutedTool(name)) {
    return jsonError(400, "unknown_tool", `Herramienta no permitida: ${String(name)}`);
  }

  const result = await runServerTool(name, args, request.signal);
  return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
}
