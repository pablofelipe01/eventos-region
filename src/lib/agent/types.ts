import type { UIDataTypes, UIMessage } from "ai";
import type { ProviderId } from "./config";
import type {
  ArtifactToolOutput,
  CreateArtifactInput,
  GenerateImageInput,
  GenerateImageOutput,
  UpdateArtifactInput,
  WebSearchInput,
  WebSearchOutput,
} from "./tool-schemas";

/** Metadatos por mensaje (de dónde vino: texto o voz). */
export type RegionMessageMetadata = {
  source?: "text" | "voice";
  provider?: ProviderId;
};

/** Tipos de las herramientas tal como las ve la UI (`tool-<nombre>` parts). */
export type RegionUITools = {
  createArtifact: { input: CreateArtifactInput; output: ArtifactToolOutput };
  updateArtifact: { input: UpdateArtifactInput; output: ArtifactToolOutput };
  generateImage: { input: GenerateImageInput; output: GenerateImageOutput };
  webSearch: { input: WebSearchInput; output: WebSearchOutput };
};

export type RegionUIMessage = UIMessage<RegionMessageMetadata, UIDataTypes, RegionUITools>;
export type RegionUIPart = RegionUIMessage["parts"][number];
