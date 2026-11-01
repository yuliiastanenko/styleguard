import type { ModelConfig } from "./types.js";

// list prices, checked nov 2026. cloudflare models fit in the free daily allocation
export const MODELS = {
  "cf-flux-schnell": { provider: "cloudflare", endpoint: "@cf/black-forest-labs/flux-1-schnell", label: "FLUX.1 schnell (Cloudflare)", input: "json", steps: 4, pricing: { perTile: 0.0000528, perStep: 0.0001056, tileSize: 512 } },
  "cf-flux2-klein": { provider: "cloudflare", endpoint: "@cf/black-forest-labs/flux-2-klein-4b", label: "FLUX.2 klein 4B (Cloudflare)", input: "multipart", sizable: true, seedable: true, pricing: { perTile: 0.000346, perStep: 0, tileSize: 512 } },
  "flux-schnell": { provider: "fal", endpoint: "fal-ai/flux/schnell", label: "FLUX schnell (fal)", pricing: { perMegapixel: 0.003 }, params: { num_inference_steps: 4 } },
  "flux-dev": { provider: "fal", endpoint: "fal-ai/flux/dev", label: "FLUX dev (fal)", pricing: { perMegapixel: 0.025 }, params: { num_inference_steps: 28 } },
  "gpt-image-2": { provider: "openai", endpoint: "gpt-image-2", label: "GPT Image 2 (low)", pricing: { perImage: 0.006 }, params: { quality: "low" } },
  "gpt-image-1-mini": { provider: "openai", endpoint: "gpt-image-1-mini", label: "GPT Image 1 mini (low)", pricing: { perImage: 0.005 }, params: { quality: "low" } },
} satisfies Record<string, ModelConfig>;

export type ModelId = keyof typeof MODELS;

export const MODEL_IDS = Object.keys(MODELS) as [ModelId, ...ModelId[]];

export const DEFAULT_MODEL: ModelId = "cf-flux-schnell";
