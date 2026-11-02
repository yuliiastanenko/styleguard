import { fal } from "@fal-ai/client";
import { env } from "../env.js";
import { ProviderError } from "../lib/errors.js";
import { estimateCost } from "./cost.js";
import type { ImageProvider, ModelConfig } from "./types.js";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!env.FAL_KEY) throw new Error("FAL_KEY is not set");
  fal.config({ credentials: env.FAL_KEY });
  configured = true;
}

type FalImageOutput = {
  images: { url: string; content_type?: string; width?: number; height?: number }[];
  seed: number;
};

export function createFalProvider(id: string, cfg: Extract<ModelConfig, { provider: "fal" }>): ImageProvider {
  return {
    async generate(prompt, opts = {}) {
      ensureConfigured();
      const width = opts.width ?? 1024;
      const height = opts.height ?? 1024;
      const started = Date.now();

      const result = await fal.subscribe(cfg.endpoint, {
        input: {
          prompt,
          image_size: { width, height },
          num_images: 1,
          output_format: "png",
          ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
          ...cfg.params,
        },
        abortSignal: opts.signal,
      });

      const data = result.data as FalImageOutput;
      const image = data.images?.[0];
      if (!image?.url) throw new Error(`fal returned no image (request ${result.requestId})`);

      const res = await fetch(image.url, { signal: opts.signal });
      if (!res.ok) throw new ProviderError(`failed to download fal image: ${res.status}`, res.status);
      const imageBytes = new Uint8Array(await res.arrayBuffer());

      return {
        imageBytes,
        mimeType: image.content_type ?? "image/png",
        seed: data.seed ?? null,
        model: id,
        latencyMs: Date.now() - started,
        costUsd: estimateCost(cfg.pricing, width, height),
      };
    },
  };
}
