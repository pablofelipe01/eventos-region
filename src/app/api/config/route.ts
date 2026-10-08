import { connection } from "next/server";
import { getPublicAgentConfig } from "@/lib/agent/models";

/**
 * Configuración pública (sin secretos) para la UI: proveedor por defecto,
 * modelos y qué funciones tienen clave configurada.
 * `connection()` fuerza la evaluación en cada petición (Cache Components),
 * así los cambios de variables de entorno se reflejan sin recompilar.
 */
export async function GET() {
  await connection();
  return Response.json(getPublicAgentConfig(), { headers: { "Cache-Control": "no-store" } });
}
