/**
 * Acciones sobre el dispositivo del usuario. Solo navegador: usa las APIs web
 * (Geolocation, Clipboard, Web Share, cámara vía <input capture>, enlaces
 * universales y esquemas tel:/sms:/mailto:).
 *
 * Límite de la plataforma: una página web no puede manejar otras apps ni leer
 * lo que muestran. Por eso la ubicación se lee del GPS directamente (no
 * abriendo Google Maps) y "abrir una app" significa entregarle un enlace que
 * el sistema operativo resuelve (Maps, WhatsApp, Teléfono, Calendar…).
 *
 * Las herramientas interactivas (abrir, compartir, foto) se ejecutan dentro
 * del gesto del usuario (el toque en el botón de la tarjeta): sin ese gesto
 * los navegadores bloquean ventanas, el menú de compartir y la cámara.
 */
import {
  isInteractiveDeviceTool,
  TOOL_INPUT_SCHEMAS,
  type CopyToClipboardInput,
  type DeviceActionOutput,
  type DeviceInfoOutput,
  type DeviceToolName,
  type GetLocationInput,
  type LocationOutput,
  type OpenOnDeviceInput,
  type ShareContentInput,
  type TakePhotoOutput,
  type ToolFailure,
} from "@/lib/agent/tool-schemas";

export type DeviceToolOutput = LocationOutput | DeviceInfoOutput | DeviceActionOutput | TakePhotoOutput;

const fail = (error: string, code?: string): ToolFailure => ({ ok: false, error, ...(code ? { code } : {}) });

export const cancelledByUser = (): ToolFailure => fail("El usuario canceló la acción.", "cancelled_by_user");

export function googleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/* ------------------------------------------------------------------ */
/* Ubicación                                                           */
/* ------------------------------------------------------------------ */

const round = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals;
const finiteOrNull = (value: number | null | undefined, decimals: number) =>
  typeof value === "number" && Number.isFinite(value) ? round(value, decimals) : null;

export function getCurrentLocation(input: GetLocationInput): Promise<LocationOutput> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(fail("Este navegador no da acceso a la ubicación.", "unsupported"));
  }
  if (!window.isSecureContext) {
    return Promise.resolve(
      fail("La ubicación solo funciona en una página segura (HTTPS o localhost).", "insecure_context"),
    );
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        const latitude = round(coords.latitude, 6);
        const longitude = round(coords.longitude, 6);
        resolve({
          ok: true,
          latitude,
          longitude,
          accuracyMeters: Math.round(coords.accuracy),
          altitudeMeters: finiteOrNull(coords.altitude, 1),
          headingDegrees: finiteOrNull(coords.heading, 0),
          speedMetersPerSecond: finiteOrNull(coords.speed, 1),
          timestamp: new Date(timestamp).toISOString(),
          mapsUrl: googleMapsUrl(latitude, longitude),
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            resolve(
              fail(
                "El usuario no dio permiso de ubicación (o está bloqueado en el navegador o en el sistema). Puede activarlo en los ajustes del sitio.",
                "permission_denied",
              ),
            );
            break;
          case error.POSITION_UNAVAILABLE:
            resolve(
              fail(
                "No se pudo determinar la ubicación: el GPS no tiene señal o la ubicación está desactivada en el dispositivo.",
                "position_unavailable",
              ),
            );
            break;
          default:
            resolve(fail("La ubicación tardó demasiado en responder. Se puede intentar de nuevo.", "timeout"));
        }
      },
      { enableHighAccuracy: input.highAccuracy ?? true, timeout: 20_000, maximumAge: 30_000 },
    );
  });
}

/* ------------------------------------------------------------------ */
/* Información del dispositivo                                         */
/* ------------------------------------------------------------------ */

type NavigatorExtras = Navigator & {
  userAgentData?: { mobile?: boolean; platform?: string };
  connection?: { effectiveType?: string; type?: string };
  deviceMemory?: number;
  getBattery?: () => Promise<{ level: number; charging: boolean }>;
};

function detectOs(ua: string, nav: NavigatorExtras): string {
  const android = /Android\s([\d.]+)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  const ios = /(?:iPhone|iPad|iPod).*?OS (\d+(?:_\d+)*)/.exec(ua);
  if (ios) return `iOS ${ios[1].replaceAll("_", ".")}`;
  if (/Macintosh/.test(ua)) return nav.maxTouchPoints > 1 ? "iPadOS" : "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return nav.userAgentData?.platform || "desconocido";
}

function detectBrowser(ua: string): string {
  const rules: Array<[RegExp, string]> = [
    [/EdgA?\/([\d]+)/, "Edge"],
    [/SamsungBrowser\/([\d]+)/, "Samsung Internet"],
    [/OPR\/([\d]+)/, "Opera"],
    [/CriOS\/([\d]+)/, "Chrome (iOS)"],
    [/FxiOS\/([\d]+)/, "Firefox (iOS)"],
    [/Firefox\/([\d]+)/, "Firefox"],
    [/Chrome\/([\d]+)/, "Chrome"],
    [/Version\/([\d]+).*Safari/, "Safari"],
  ];
  for (const [pattern, name] of rules) {
    const match = pattern.exec(ua);
    if (match) return `${name} ${match[1]}`;
  }
  return "desconocido";
}

function detectDeviceType(ua: string, nav: NavigatorExtras): "mobile" | "tablet" | "desktop" {
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return "tablet";
  if (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) return "tablet";
  if (nav.userAgentData?.mobile || /Mobi|iPhone|iPod|Android/.test(ua)) return "mobile";
  return "desktop";
}

export async function getDeviceInfo(): Promise<DeviceInfoOutput> {
  const nav = navigator as NavigatorExtras;
  const ua = nav.userAgent;

  let battery: { levelPercent: number; charging: boolean } | null = null;
  try {
    const status = await nav.getBattery?.();
    if (status) battery = { levelPercent: Math.round(status.level * 100), charging: status.charging };
  } catch {
    // no disponible en este navegador
  }

  return {
    ok: true,
    deviceType: detectDeviceType(ua, nav),
    os: detectOs(ua, nav),
    browser: detectBrowser(ua),
    language: nav.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    localTime: new Date().toLocaleString(nav.language || "es", { dateStyle: "full", timeStyle: "short" }),
    online: nav.onLine,
    connection: nav.connection?.effectiveType ?? nav.connection?.type ?? null,
    battery,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      pixelRatio: window.devicePixelRatio,
      orientation: window.screen.orientation?.type ?? null,
    },
    colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    touch: nav.maxTouchPoints > 0,
    cpuCores: nav.hardwareConcurrency || null,
    memoryGb: nav.deviceMemory ?? null,
    capabilities: {
      location: "geolocation" in nav && window.isSecureContext,
      camera: Boolean(nav.mediaDevices) || /Mobi|Android|iPhone|iPad/.test(ua),
      share: typeof nav.share === "function",
      clipboard: Boolean(nav.clipboard?.writeText),
      openApps: true,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Portapapeles                                                        */
/* ------------------------------------------------------------------ */

export async function copyToClipboard({ text }: CopyToClipboardInput): Promise<DeviceActionOutput> {
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true, summary: `Copiado al portapapeles (${text.length} caracteres).` };
  } catch {
    // Respaldo para navegadores sin Clipboard API o sin foco/gesto.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      if (copied) return { ok: true, summary: `Copiado al portapapeles (${text.length} caracteres).` };
    } catch {
      // sigue al error
    }
    return fail("El navegador no permitió copiar al portapapeles en este momento.", "clipboard_blocked");
  }
}

/* ------------------------------------------------------------------ */
/* Abrir apps y páginas                                                */
/* ------------------------------------------------------------------ */

export type OpenTarget = {
  ok: true;
  href: string;
  /** Descripción legible (se muestra en el botón y se devuelve al modelo). */
  summary: string;
  /** Los enlaces http(s) se abren en una pestaña nueva; tel:/sms:/mailto: en la misma. */
  newTab: boolean;
  note?: string;
};

const enc = encodeURIComponent;

function cleanPhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.trim().replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return cleaned.replace(/\D/g, "").length >= 3 ? cleaned : null;
}

/** wa.me exige el número internacional sin "+". Un celular colombiano de 10 dígitos recibe el 57. */
function whatsappNumber(phone: string): { digits: string; assumedColombia: boolean } {
  const digits = phone.replace(/\D/g, "");
  if (!phone.startsWith("+") && digits.length === 10 && digits.startsWith("3")) {
    return { digits: `57${digits}`, assumedColombia: true };
  }
  return { digits, assumedColombia: false };
}

function safeWebUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function place(input: OpenOnDeviceInput): string | null {
  if (typeof input.latitude === "number" && typeof input.longitude === "number") {
    return `${input.latitude},${input.longitude}`;
  }
  return input.query?.trim() || null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const calendarStamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Fechas en el formato de Google Calendar (`dates=inicio/fin`). */
function calendarDates(start: string, end: string | undefined): string | null {
  if (DATE_ONLY.test(start)) {
    const last = end && DATE_ONLY.test(end) && end > start ? end : start;
    return `${start.replaceAll("-", "")}/${nextDay(last).replaceAll("-", "")}`;
  }
  // Sin zona horaria, JavaScript interpreta la hora local del dispositivo.
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return null;
  let to = end ? new Date(end) : new Date(from.getTime() + 60 * 60 * 1000);
  if (Number.isNaN(to.getTime()) || to <= from) to = new Date(from.getTime() + 60 * 60 * 1000);
  return `${calendarStamp(from)}/${calendarStamp(to)}`;
}

export function buildOpenTarget(input: OpenOnDeviceInput): OpenTarget | ToolFailure {
  switch (input.action) {
    case "maps": {
      const where = place(input);
      if (!where) return fail('Para "maps" falta query o latitude/longitude.', "invalid_arguments");
      return {
        ok: true,
        href: `https://www.google.com/maps/search/?api=1&query=${enc(where)}`,
        summary: `Abrir Google Maps: ${where}`,
        newTab: true,
      };
    }
    case "directions": {
      const destination = input.destination?.trim();
      if (!destination) return fail('Para "directions" falta destination.', "invalid_arguments");
      const params = new URLSearchParams({ api: "1", destination });
      if (input.origin?.trim()) params.set("origin", input.origin.trim());
      if (input.travelMode) params.set("travelmode", input.travelMode);
      return {
        ok: true,
        href: `https://www.google.com/maps/dir/?${params}`,
        summary: `Ruta en Google Maps hacia ${destination}`,
        newTab: true,
      };
    }
    case "earth": {
      const hasCoords = typeof input.latitude === "number" && typeof input.longitude === "number";
      const where = place(input);
      if (!where) return fail('Para "earth" falta query o latitude/longitude.', "invalid_arguments");
      return {
        ok: true,
        href: hasCoords
          ? `https://earth.google.com/web/@${input.latitude},${input.longitude},500a,1500d,35y,0h,45t,0r`
          : `https://earth.google.com/web/search/${enc(where)}`,
        summary: `Abrir Google Earth: ${where}`,
        newTab: true,
      };
    }
    case "call": {
      const phone = cleanPhone(input.phone);
      if (!phone) return fail('Para "call" falta un número de teléfono válido.', "invalid_arguments");
      return { ok: true, href: `tel:${phone}`, summary: `Llamar a ${phone}`, newTab: false };
    }
    case "sms": {
      const phone = cleanPhone(input.phone);
      if (!phone) return fail('Para "sms" falta un número de teléfono válido.', "invalid_arguments");
      const body = input.text?.trim() ? `?body=${enc(input.text.trim())}` : "";
      return { ok: true, href: `sms:${phone}${body}`, summary: `Escribir SMS a ${phone}`, newTab: false };
    }
    case "whatsapp": {
      const phone = cleanPhone(input.phone);
      const text = input.text?.trim();
      if (!phone && !text) return fail('Para "whatsapp" hace falta phone o text.', "invalid_arguments");
      const number = phone ? whatsappNumber(phone) : null;
      const query = text ? `?text=${enc(text)}` : "";
      return {
        ok: true,
        href: `https://wa.me/${number?.digits ?? ""}${query}`,
        summary: number ? `WhatsApp a +${number.digits}` : "Compartir por WhatsApp",
        newTab: true,
        ...(number?.assumedColombia ? { note: "Se asumió el indicativo de Colombia (+57)." } : {}),
      };
    }
    case "email": {
      const to = (input.to ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(enc)
        .join(",");
      const params = [
        input.subject?.trim() ? `subject=${enc(input.subject.trim())}` : "",
        input.text?.trim() ? `body=${enc(input.text.trim())}` : "",
      ].filter(Boolean);
      if (!to && params.length === 0) return fail('Para "email" hace falta to, subject o text.', "invalid_arguments");
      return {
        ok: true,
        href: `mailto:${to}${params.length ? `?${params.join("&")}` : ""}`,
        summary: to ? `Escribir correo a ${decodeURIComponent(to)}` : "Escribir correo",
        newTab: false,
      };
    }
    case "calendar": {
      const title = input.title?.trim();
      if (!title || !input.start) return fail('Para "calendar" faltan title y start.', "invalid_arguments");
      const dates = calendarDates(input.start.trim(), input.end?.trim());
      if (!dates) return fail(`Fecha de inicio inválida: "${input.start}". Usa ISO 8601.`, "invalid_arguments");
      const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates });
      if (input.text?.trim()) params.set("details", input.text.trim());
      if (input.location?.trim()) params.set("location", input.location.trim());
      return {
        ok: true,
        href: `https://calendar.google.com/calendar/render?${params}`,
        summary: `Crear evento en Google Calendar: ${title}`,
        newTab: true,
      };
    }
    case "url": {
      const url = safeWebUrl(input.url);
      if (!url) return fail('Para "url" hace falta una dirección http(s) válida.', "invalid_arguments");
      return { ok: true, href: url.toString(), summary: `Abrir ${url.hostname}`, newTab: true };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Compartir                                                           */
/* ------------------------------------------------------------------ */

function shareData(input: ShareContentInput): ShareData | ToolFailure {
  const data: ShareData = {};
  if (input.title?.trim()) data.title = input.title.trim();
  if (input.text?.trim()) data.text = input.text.trim();
  if (input.url) {
    const url = safeWebUrl(input.url);
    if (!url) return fail("El enlace a compartir debe ser http(s).", "invalid_arguments");
    data.url = url.toString();
  }
  if (!data.text && !data.url && !data.title) return fail("No hay nada que compartir.", "invalid_arguments");
  return data;
}

/** Debe llamarse dentro del gesto del usuario (clic/toque). */
export async function shareOnDevice(input: ShareContentInput): Promise<DeviceActionOutput> {
  const data = shareData(input);
  if ("ok" in data) return data;
  if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return { ok: true, summary: "El usuario compartió el contenido desde el menú del dispositivo." };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return fail("El usuario cerró el menú de compartir sin compartir.", "cancelled_by_user");
      }
      // Otros errores: se intenta copiar como respaldo.
    }
  }
  const copied = await copyToClipboard({ text: [data.title, data.text, data.url].filter(Boolean).join("\n") });
  return copied.ok
    ? {
        ok: true,
        summary: "Este navegador no tiene menú de compartir: el contenido se copió al portapapeles.",
        note: "Dile al usuario que lo pegue donde quiera compartirlo.",
      }
    : copied;
}

/* ------------------------------------------------------------------ */
/* Foto                                                                */
/* ------------------------------------------------------------------ */

const PHOTO_MAX_SIDE = 1280;
const PHOTO_QUALITY = 0.82;

/** Carga una imagen y la re-codifica como JPEG con el lado mayor ≤ `maxSide`. */
async function toJpeg(src: string, maxSide: number, quality: number) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.drawImage(image, 0, 0, width, height);
  return { width, height, dataUrl: canvas.toDataURL("image/jpeg", quality) };
}

/** Reduce la foto (cámara o galería) a JPEG ≤1280 px para enviarla al modelo. */
export async function photoFromFile(file: File): Promise<TakePhotoOutput> {
  if (!file.type.startsWith("image/") && file.type !== "") {
    return fail("El archivo elegido no es una imagen.", "invalid_file");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const { width, height, dataUrl } = await toJpeg(objectUrl, PHOTO_MAX_SIDE, PHOTO_QUALITY);
    return { ok: true, mediaType: "image/jpeg", width, height, dataUrl };
  } catch {
    return fail("No se pudo leer la imagen (formato no compatible).", "invalid_file");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Versión más pequeña de una imagen ya procesada (p. ej. para la voz). Si falla, devuelve la original. */
export async function downscaleDataUrl(dataUrl: string, maxSide: number, quality: number): Promise<string> {
  try {
    return (await toJpeg(dataUrl, maxSide, quality)).dataUrl;
  } catch {
    return dataUrl;
  }
}

/* ------------------------------------------------------------------ */
/* Punto de entrada común (chat y voz)                                 */
/* ------------------------------------------------------------------ */

/**
 * Valida los argumentos y ejecuta una herramienta del dispositivo.
 * - Automáticas (ubicación, info, portapapeles): devuelve su resultado.
 * - Interactivas (abrir, compartir, foto): devuelve `null` si hay que esperar
 *   al toque del usuario en la tarjeta, o un error si los argumentos no sirven.
 */
export async function startDeviceTool(name: DeviceToolName, rawInput: unknown): Promise<DeviceToolOutput | null> {
  const parsed = TOOL_INPUT_SCHEMAS[name].safeParse(rawInput ?? {});
  if (!parsed.success) {
    return fail(
      `Argumentos inválidos para ${name}: ${parsed.error.issues
        .map((i) => `${i.path.map(String).join(".") || "(raíz)"}: ${i.message}`)
        .join("; ")}`,
      "invalid_arguments",
    );
  }

  if (isInteractiveDeviceTool(name)) {
    if (name === "openOnDevice") {
      const target = buildOpenTarget(parsed.data as OpenOnDeviceInput);
      return target.ok ? null : target;
    }
    if (name === "shareContent") {
      const data = shareData(parsed.data as ShareContentInput);
      return "ok" in data ? data : null;
    }
    return null;
  }

  try {
    switch (name) {
      case "getLocation":
        return await getCurrentLocation(parsed.data as GetLocationInput);
      case "getDeviceInfo":
        return await getDeviceInfo();
      case "copyToClipboard":
        return await copyToClipboard(parsed.data as CopyToClipboardInput);
    }
  } catch (error) {
    return fail(`No se pudo ejecutar ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
