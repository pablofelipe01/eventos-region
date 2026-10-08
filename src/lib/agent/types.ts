import type { UIDataTypes, UIMessage } from "ai";
import type { ProviderId } from "./config";
import type {
  ArtifactToolOutput,
  CopyToClipboardInput,
  CreateArtifactInput,
  DeviceActionOutput,
  DeviceInfoOutput,
  GenerateImageInput,
  GenerateImageOutput,
  GetDeviceInfoInput,
  GetLocationInput,
  LocationOutput,
  OpenOnDeviceInput,
  ShareContentInput,
  TakePhotoInput,
  TakePhotoOutput,
  UpdateArtifactInput,
  WebSearchInput,
  WebSearchOutput,
} from "./tool-schemas";

/** Metadatos por mensaje (de dónde vino: texto o voz). */
export type RegionMessageMetadata = {
  source?: "text" | "voice";
  provider?: ProviderId;
  /** Respuesta de voz cortada porque el usuario habló encima (barge-in). */
  interrupted?: boolean;
};

/**
 * Salida de la búsqueda web nativa (`web_search`) tal como llega a la UI.
 * - Anthropic: lista de `{ type: "web_search_result", url, title, pageAge, encryptedContent }`.
 * - OpenAI: `{ action?: { query?, queries? }, sources?: [{ type: "url", url }] }`.
 */
export type NativeWebSearchOutput =
  | Array<{ type?: string; url?: string; title?: string | null }>
  | {
      action?: { type?: string; query?: string; queries?: string[]; url?: string | null };
      sources?: Array<{ type: string; url?: string; name?: string }>;
    };

/** Tipos de las herramientas tal como las ve la UI (`tool-<nombre>` parts). */
export type RegionUITools = {
  createArtifact: { input: CreateArtifactInput; output: ArtifactToolOutput };
  updateArtifact: { input: UpdateArtifactInput; output: ArtifactToolOutput };
  generateImage: { input: GenerateImageInput; output: GenerateImageOutput };
  /** Búsqueda web de la VOZ (función ejecutada en /api/web-search). */
  webSearch: { input: WebSearchInput; output: WebSearchOutput };
  /** Búsqueda web NATIVA del proveedor en el chat de texto (la ejecuta Anthropic/OpenAI). */
  web_search: { input: { query?: string } | Record<string, never>; output: NativeWebSearchOutput };
  /* Dispositivo (las ejecuta el navegador). */
  getLocation: { input: GetLocationInput; output: LocationOutput };
  getDeviceInfo: { input: GetDeviceInfoInput; output: DeviceInfoOutput };
  copyToClipboard: { input: CopyToClipboardInput; output: DeviceActionOutput };
  openOnDevice: { input: OpenOnDeviceInput; output: DeviceActionOutput };
  shareContent: { input: ShareContentInput; output: DeviceActionOutput };
  takePhoto: { input: TakePhotoInput; output: TakePhotoOutput };
};

export type RegionUIMessage = UIMessage<RegionMessageMetadata, UIDataTypes, RegionUITools>;
export type RegionUIPart = RegionUIMessage["parts"][number];
