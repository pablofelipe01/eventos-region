/**
 * Roadmap de herramientas — NO implementadas en v1 y NO registradas en el chat
 * ni en la voz. Están aquí para dejar claro el contrato previsto.
 *
 * Cuando se implementen: añadir el esquema en `tool-schemas.ts`, la
 * implementación en `tools.ts` (createChatTools) y, si aplica, en
 * SERVER_EXECUTED_TOOLS para la voz.
 */

/**
 * TODO(runCode): ejecutar código (Python/Node) en un sandbox aislado.
 * Opciones: Vercel Sandbox (`@vercel/sandbox`, encaja con el despliegue en
 * Vercel) o E2B (`@e2b/code-interpreter`). Requisitos: tiempo máximo,
 * sin red por defecto, límites de CPU/memoria, devolver stdout/stderr y
 * archivos generados (p. ej. gráficos) como artefactos.
 * Entrada prevista: { language: "python" | "javascript", code: string }.
 */
export const RUN_CODE_TODO = "runCode: pendiente (Vercel Sandbox o E2B)";

/**
 * TODO(saveFile): guardar artefactos/imágenes en S3 y devolver una URL
 * firmada. Variables previstas: AWS_REGION, AWS_ACCESS_KEY_ID,
 * AWS_SECRET_ACCESS_KEY, S3_BUCKET. Usar `@aws-sdk/client-s3` +
 * `@aws-sdk/s3-request-presigner`. Esto también resolvería que las imágenes
 * en base64 inflen el historial del chat.
 * Entrada prevista: { filename: string, contentType: string, artifactId?: string }.
 */
export const SAVE_FILE_TODO = "saveFile: pendiente (S3)";

/**
 * TODO(remember): memoria persistente del usuario en Postgres (p. ej. Neon o
 * Supabase vía Vercel Marketplace, o RDS), con `pgvector` para búsqueda
 * semántica. Requiere autenticación para separar usuarios.
 * Entrada prevista: { fact: string, tags?: string[] } y una herramienta
 * complementaria `recall({ query })`.
 */
export const REMEMBER_TODO = "remember: pendiente (Postgres + pgvector)";
