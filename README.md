# Región — asistente de IA (v1)

**Región** es un asistente de IA conversacional, por texto y por voz, que ayuda a crear lo que necesites: documentos, código, pequeñas páginas web, imágenes e investigaciones con búsqueda web.

## Qué hace

- **Chat de texto en streaming** con selector de modelo (Claude u OpenAI). El proveedor por defecto se define con `DEFAULT_PROVIDER`. Los IDs de modelo están en un solo archivo: `src/lib/agent/config.ts`.
- **Agente con herramientas** (hasta 10 pasos por turno):
  - `createArtifact` / `updateArtifact`: crea y edita artefactos (documento/markdown, código, HTML) que aparecen en el panel derecho, con versiones, vista previa / código fuente, copiar y descargar. El HTML se muestra en un `iframe` con `sandbox="allow-scripts"` (sin acceso al origen de la app).
  - `generateImage`: genera imágenes con OpenAI y las muestra en el chat (data URL). Sin `OPENAI_API_KEY` falla de forma controlada.
  - `webSearch`: búsqueda web con Tavily si existe `TAVILY_API_KEY`; si no, devuelve un resultado claro de "no configurada". El proveedor se puede cambiar (interfaz `WebSearchProvider`).
- **Voz en tiempo real** (OpenAI Realtime por WebRTC): botón de micrófono, estado en vivo (conectando / escuchando / pensando / hablando), transcripciones del usuario y del asistente dentro de la misma conversación, y las **mismas herramientas** que el chat de texto.
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
| `OPENAI_API_KEY` | Chat con OpenAI, imágenes y voz | Para esas funciones |
| `ANTHROPIC_API_KEY` | Chat con Claude | Para Claude |
| `DEFAULT_PROVIDER` | `anthropic` u `openai` | No (por defecto `anthropic`) |
| `TAVILY_API_KEY` | Búsqueda web | No |

Si falta la clave del proveedor elegido, `/api/chat` responde un error JSON claro (`missing_api_key`) que la interfaz muestra al usuario. Las claves **solo** se leen en el servidor; nunca llegan al navegador.

Otros comandos: `npm run build`, `npm run start`, `npm run lint`.

## Cómo funciona la voz

1. Al pulsar el micrófono, el navegador pide permiso para usar el micrófono.
2. El navegador llama a `POST /api/realtime/session`. El servidor, con `OPENAI_API_KEY`, crea un **client secret efímero** (`POST https://api.openai.com/v1/realtime/client_secrets`, caduca en 10 minutos) con el modelo, la voz, las instrucciones en español, la detección de turnos del servidor (server VAD), la transcripción de entrada y las herramientas. También se envía un resumen de la conversación de texto reciente como contexto.
3. El navegador abre una conexión WebRTC (`RTCPeerConnection`) directamente con OpenAI (`POST https://api.openai.com/v1/realtime/calls` con el secreto efímero): envía el audio del micrófono, reproduce el audio remoto y usa el canal de datos `oai-events` para los eventos.
4. Cuando el modelo llama a una herramienta, la app la ejecuta (los artefactos en el navegador; imágenes y búsqueda en `POST /api/tools`) y devuelve el resultado con `conversation.item.create` (`function_call_output`) seguido de `response.create`.

Requisitos del navegador:

- El micrófono solo funciona en un **contexto seguro**: `https://` o `http://localhost`. Si abres la app por IP de red local (`http://192.168…`) el navegador bloqueará el micrófono.
- Concede el permiso de micrófono cuando el navegador lo pida. Si lo denegaste, vuelve a activarlo desde el icono del candado de la barra de direcciones.
- Mientras la voz está activa, lo que escribas también se envía a la conversación de voz.

## Despliegue en Vercel

1. Importa el repositorio en Vercel (framework: Next.js).
2. En **Project Settings → Environment Variables** añade `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEFAULT_PROVIDER` y, opcionalmente, `TAVILY_API_KEY` (para Production y Preview).
3. Despliega. Las rutas `/api/chat` y `/api/tools` declaran `maxDuration = 300` s (el máximo por defecto con Fluid Compute en todos los planes); `/api/realtime/session` usa 30 s.

> **Seguridad:** v1 no tiene autenticación ni límite de uso. Las rutas `/api/*` solo rechazan peticiones de otro origen, así que cualquiera con la URL puede consumir tus claves. Activa **Vercel Deployment Protection** (o añade autenticación) antes de compartir la URL.

## Estructura

- `src/app/api/chat/route.ts` — chat en streaming (`streamText` + herramientas).
- `src/app/api/realtime/session/route.ts` — crea el secreto efímero para la voz.
- `src/app/api/tools/route.ts` — ejecuta herramientas de servidor para la voz.
- `src/app/api/config/route.ts` — configuración pública (proveedor por defecto, claves disponibles sin revelarlas).
- `src/lib/agent/` — configuración de modelos, prompts, esquemas de herramientas compartidos (texto y voz), artefactos, búsqueda web e imágenes.
- `src/components/assistant/` — interfaz: chat, panel de artefactos y hook de voz WebRTC.

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
