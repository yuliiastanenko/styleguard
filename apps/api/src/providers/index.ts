import { MODELS, type ModelId } from "./models.js";
import { createFalProvider } from "./fal.js";
import { createOpenAIProvider } from "./openai.js";
import { createCloudflareProvider } from "./cloudflare.js";
import type { ImageProvider, ModelConfig } from "./types.js";
import { env } from "../env.js";

const cache = new Map<ModelId, ImageProvider>();

function build(id: ModelId, cfg: ModelConfig): ImageProvider {
  switch (cfg.provider) {
    case "fal":
      return createFalProvider(id, cfg);
    case "openai":
      return createOpenAIProvider(id, cfg);
    case "cloudflare":
      return createCloudflareProvider(id, cfg);
  }
}

export function getImageProvider(id: ModelId): ImageProvider {
  let provider = cache.get(id);
  if (!provider) {
    provider = build(id, MODELS[id]);
    cache.set(id, provider);
  }
  return provider;
}

// a model shows up only when its provider has a key configured
export function isModelAvailable(id: ModelId): boolean {
  switch (MODELS[id].provider) {
    case "cloudflare":
      return Boolean(env.CF_AI_TOKEN);
    case "fal":
      return Boolean(env.FAL_KEY);
    case "openai":
      return Boolean(env.OPENAI_API_KEY);
  }
}

export function isModelId(value: string): value is ModelId {
  return value in MODELS;
}

export { MODELS, MODEL_IDS, DEFAULT_MODEL, type ModelId } from "./models.js";
export type { ImageProvider, GenerateResult, GenerateOpts } from "./types.js";
