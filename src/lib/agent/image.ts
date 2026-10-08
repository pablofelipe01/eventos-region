import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { generateImage } from "ai";
import { IMAGE_MODEL } from "./config";
import type { GenerateImageInput, GenerateImageOutput } from "./tool-schemas";
import { errorMessage } from "../redact";

/** Genera una imagen con OpenAI y la devuelve como data URL. Nunca lanza. */
export async function runGenerateImage(
  input: GenerateImageInput,
  signal?: AbortSignal,
): Promise<GenerateImageOutput> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      code: "missing_api_key",
      error:
        "No se puede generar la imagen: falta OPENAI_API_KEY en el servidor. Explica al usuario que la generación de imágenes no está configurada.",
    };
  }

  try {
    const openai = createOpenAI({ apiKey });
    const { image } = await generateImage({
      model: openai.image(IMAGE_MODEL.id),
      prompt: input.prompt,
      size: input.size ?? IMAGE_MODEL.size,
      providerOptions: {
        openai: { quality: IMAGE_MODEL.quality, outputFormat: IMAGE_MODEL.outputFormat },
      },
      abortSignal: signal,
      maxRetries: 1,
    });

    const mediaType = image.mediaType || `image/${IMAGE_MODEL.outputFormat}`;
    return {
      ok: true,
      prompt: input.prompt,
      model: IMAGE_MODEL.id,
      mediaType,
      dataUrl: `data:${mediaType};base64,${image.base64}`,
    };
  } catch (error) {
    console.error("[generateImage] error", error);
    return {
      ok: false,
      code: "image_generation_failed",
      error: `No se pudo generar la imagen: ${errorMessage(error)}`,
    };
  }
}

/** Versión compacta del resultado para el modelo (sin el base64). */
export function summarizeImageOutput(output: GenerateImageOutput) {
  if (!output.ok) return output;
  return {
    ok: true,
    note: "La imagen ya se muestra al usuario en el chat.",
    prompt: output.prompt,
    model: output.model,
  };
}
