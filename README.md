# Región — asistente de IA · Alma — Las Moras

Este proyecto tiene dos aplicaciones independientes:

- **Alma** (ruta raíz `/`): experiencia de voz para el evento de Las Moras. Las personas escanean un QR, responden preguntas hablando y sus respuestas se transcriben y se guardan en Airtable.
- **Región** (ruta `/agente`): asistente de IA conversacional, por texto y por voz, que ayuda a crear documentos, código, páginas web, imágenes e investigaciones con búsqueda web, y puede usar el dispositivo (ubicación, mapas, cámara…).

## Alma — Las Moras

Flujo (`src/components/alma/`): bienvenida (`/`) → Misión 1 (`/alma/mision`: dos preguntas grabadas por voz y pantalla de gracias) → Mesa de las herramientas (`/alma/mesa`: elegir un objeto y contar una historia).

- Cada respuesta se graba en el navegador (`MediaRecorder`), se envía a `POST /api/alma/respuesta`, se transcribe con OpenAI (`gpt-4o-mini-transcribe`) y se guarda en Airtable con el audio adjunto.
- Cada celular genera un código anónimo (`P-XXXX`, en `localStorage`) que se repite en todas sus respuestas, para agruparlas por persona.
- Tabla `Respuestas` en Airtable: `Participante`, `Estación` (Misión 1 · Mesa de las herramientas), `Pregunta`, `Objeto` (Machete · Sombrero · Botas · Rastrillo), `Audio` (adjunto), `Transcripción`, `Duración (s)`, `Fecha`.
- Variables: `AIRTABLE_TOKEN` (con `data.records:write` y acceso a la base) y `AIRTABLE_BASE_ID`. Si faltan, el endpoint responde `missing_airtable_config`.
- La grabación requiere HTTPS (o `localhost`): en producción funciona directamente; en local, desde el celular, hace falta un túnel HTTPS.

## Región — asistente de IA

## Qué hace

- **Chat de texto en streaming** con selector de modelo (Claude u OpenAI). El proveedor por defecto se define con `DEFAULT_PROVIDER`. Los IDs de modelo están en un solo archivo: `src/lib/agent/config.ts`.
- **Agente con herramientas** (hasta 10 pasos por turno):
  - `createArtifact` / `updateArtifact`: crea y edita artefactos (documento/markdown, código, HTML) que aparecen en el panel derecho, con versiones, vista previa / código fuente, copiar y descargar. El HTML se muestra en un `iframe` con `sandbox="allow-scripts"` (sin acceso al origen de la app).
  - `generateImage`: genera imágenes con OpenAI y las muestra en el chat (data URL). Sin `OPENAI_API_KEY` falla de forma controlada.
  - **Búsqueda web nativa del proveedor** (sin APIs ni claves extra): con Claude, la herramienta `web_search` de Anthropic (`anthropic.tools.webSearch_20260318`, hasta 5 búsquedas por turno); con OpenAI, la herramienta `web_search` de la Responses API (`openai.tools.webSearch`). Las citas se muestran como enlaces en "Fuentes" al pie de cada respuesta.
- **Voz en tiempo real full-duplex** (OpenAI Realtime por WebRTC, `gpt-realtime-2.1`): hablas y escuchas a la vez y puedes **interrumpir** a Región cuando quieras. Orbe con el estado en vivo (escuchando / hablas tú / habla Región / pensando / usando una herramienta), subtítulos parciales, silenciar micrófono, interrumpir y colgar.
  - **Crea mientras hablan:** por voz funcionan `createArtifact`, `updateArtifact`, `generateImage` y `webSearch`; el panel derecho se actualiza al momento.
  - **Un solo hilo:** transcripciones, artefactos e imágenes de la voz quedan en la misma conversación, y si vuelves a escribir, el modelo de texto recibe esos turnos como historial.
- **Control del dispositivo** (celular o computador, en chat y en voz). El agente encadena estas herramientas por su cuenta; las ejecuta el navegador (`src/lib/device/device-actions.ts`), no el servidor:
  - Automáticas: `getLocation` (GPS: latitud, longitud, precisión, altitud), `getDeviceInfo` (tipo de dispositivo, sistema, hora local, batería, conexión) y `copyToClipboard`.
  - Con un toque del usuario (tarjeta con botón en el hilo): `openOnDevice` (Google Maps, rutas, Google Earth, llamada, SMS, WhatsApp con mensaje, correo, evento de Google Calendar, web), `shareContent` (menú nativo de compartir) y `takePhoto` (cámara o galería; el modelo ve la foto). El toque es la confirmación y además el gesto que exigen los navegadores para abrir apps, compartir o usar la cámara.
  - Límite de la plataforma: una web puede **abrir** otras apps, pero no ver ni manejar lo que pasa dentro de ellas. La ubicación se lee del GPS directamente, sin abrir Maps.
  - Requiere **HTTPS** (o `localhost`). Para probar en el celular usa el despliegue de Vercel o un túnel HTTPS; con `http://IP-local:3000` el navegador bloquea la ubicación y el micrófono.
- **Historial en el navegador** (`useChat`): no hay base de datos en v1; al recargar la página se pierde la conversación.

## Puesta en marcha

Requisitos: **Node.js 22 o superior** (el AI SDK v7 lo exige) y npm.

```bash
npm install
cp .env.example .env.local   # y rellena las claves
npm run dev                  # http://localhost:3000
```

Variables de entorno (ver `.env.example`):

| Variable | Para qué | ¿Obligatoria? |
| --- | --- | --- |
| `OPENAI_API_KEY` | Chat con OpenAI, imágenes, voz y búsqueda web por voz | Para esas funciones |
| `ANTHROPIC_API_KEY` | Chat con Claude | Para Claude |
| `DEFAULT_PROVIDER` | `anthropic` u `openai` | No (por defecto `anthropic`) |

La búsqueda web del chat no necesita claves adicionales: la ejecuta el propio proveedor (Anthropic u OpenAI) con su herramienta nativa. En Anthropic, la búsqueda web debe estar habilitada en la [configuración de la organización](https://console.anthropic.com/settings/privacy). La búsqueda es de pago por uso en ambos proveedores.

Si falta la clave del proveedor elegido, `/api/chat` responde un error JSON claro (`missing_api_key`) que la interfaz muestra al usuario. Las claves **solo** se leen en el servidor; nunca llegan al navegador.

Otros comandos: `npm run build`, `npm run start`, `npm run lint`.

## Cómo funciona la voz

1. Al pulsar el micrófono, el navegador pide permiso para usar el micrófono.
2. El navegador llama a `POST /api/realtime/session`. El servidor, con `OPENAI_API_KEY`, crea un **client secret efímero** (`POST https://api.openai.com/v1/realtime/client_secrets`, caduca en 10 minutos) con el modelo, la voz, las instrucciones en español, la detección de turnos del servidor (server VAD con `interrupt_response`), la transcripción de entrada y las herramientas. También se envía un resumen de la conversación de texto reciente como contexto.
3. El navegador abre una conexión WebRTC (`RTCPeerConnection`) directamente con OpenAI (`POST https://api.openai.com/v1/realtime/calls` con el secreto efímero): envía el audio del micrófono (con cancelación de eco), reproduce el audio remoto y usa el canal de datos `oai-events` para los eventos.
4. **Interrupciones:** el micrófono sigue abierto mientras Región habla. Si hablas encima, el servidor cancela la respuesta y vacía su búfer de audio, y la app silencia al instante la reproducción local (`input_audio_buffer.speech_started`). También puedes pulsar "Interrumpir" (`response.cancel` + `output_audio_buffer.clear`).
5. **Herramientas:** en cuanto llegan los argumentos (`response.function_call_arguments.done`) la app ejecuta la herramienta —los artefactos en el navegador, sobre el mismo estado que el chat de texto; las imágenes en `POST /api/tools`; la búsqueda en `POST /api/web-search`— mientras Región sigue hablando. Al terminar la respuesta (`response.done`) envía cada resultado con `conversation.item.create` (`function_call_output`) y luego un `response.create` (salvo que estés hablando: tu turno ya generará la respuesta).
6. **Búsqueda web por voz:** la Realtime API no tiene búsqueda integrada, así que la función `webSearch` llama a `/api/web-search`, que hace un `generateText` corto con `gpt-6-luna` + la herramienta nativa `web_search` de OpenAI y devuelve una respuesta breve y las URLs de las fuentes.

Requisitos del navegador:

- El micrófono solo funciona en un **contexto seguro**: `https://` o `http://localhost`. Si abres la app por IP de red local (`http://192.168…`) el navegador bloqueará el micrófono.
- Concede el permiso de micrófono cuando el navegador lo pida. Si lo denegaste, vuelve a activarlo desde el icono del candado de la barra de direcciones.
- Mientras la voz está activa, lo que escribas también se envía a la conversación de voz.
- Para hablar sin auriculares, la app pide cancelación de eco al navegador; con altavoces muy altos el asistente puede "oírse" e interrumpirse. Si pasa, usa auriculares o baja el volumen.

## Despliegue en Vercel

1. Importa el repositorio en Vercel (framework: Next.js).
2. En **Project Settings → Environment Variables** añade `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` y `DEFAULT_PROVIDER` (para Production y Preview). No hace falta ninguna clave de búsqueda.
3. Despliega. Las rutas `/api/chat` y `/api/tools` declaran `maxDuration = 300` s (el máximo por defecto con Fluid Compute en todos los planes); `/api/web-search` usa 60 s y `/api/realtime/session` 30 s.

> **Seguridad:** v1 no tiene autenticación ni límite de uso. Las rutas `/api/*` solo rechazan peticiones de otro origen, así que cualquiera con la URL puede consumir tus claves. Activa **Vercel Deployment Protection** (o añade autenticación) antes de compartir la URL.

## Estructura

- `src/app/api/chat/route.ts` — chat en streaming (`streamText` + herramientas).
- `src/app/api/realtime/session/route.ts` — crea el secreto efímero para la voz.
- `src/app/api/tools/route.ts` — genera imágenes para la voz (`generateImage`).
- `src/app/api/web-search/route.ts` — búsqueda web para la voz (OpenAI + `web_search`).
- `src/app/api/config/route.ts` — configuración pública (proveedor por defecto, claves disponibles sin revelarlas).
- `src/lib/agent/` — configuración de modelos, prompts, esquemas de herramientas compartidos (texto y voz), artefactos, búsqueda web e imágenes.
- `src/components/assistant/` — interfaz: chat, panel de artefactos, modo voz (orbe y controles) y hook de voz WebRTC.

## Hoja de ruta

- `runCode`: ejecutar código en un sandbox (Vercel Sandbox o E2B).
- `saveFile`: guardar artefactos e imágenes en S3 (AWS).
- `remember`: memoria a largo plazo e historial en Postgres (p. ej. con pgvector).
- Autenticación y límites de uso por usuario.
- Persistencia de conversaciones y artefactos.
- Resaltado de sintaxis completo y ediciones parciales (diff) de artefactos.

Los stubs están documentados en `src/lib/agent/roadmap.ts` (no están registrados como herramientas).

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
