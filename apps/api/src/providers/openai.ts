import OpenAI from "openai";
import { env } from "../env.js";
import { estimateCost } from "./cost.js";
import type { ImageProvider, ModelConfig } from "./types.js";

let client: OpenAI | null = null;

function getClient() {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

// openai only supports a few fixed sizes
function pickSize(width: number, height: number) {
  if (width > height) return { size: "1536x1024" as const, w: 1536, h: 1024 };
  if (height > width) return { size: "1024x1536" as const, w: 1024, h: 1536 };
  return { size: "1024x1024" as const, w: 1024, h: 1024 };
}

export function createOpenAIProvider(id: string, cfg: Extract<ModelConfig, { provider: "openai" }>): ImageProvider {
  return {
    async generate(prompt, opts = {}) {
      const { size, w, h } = pickSize(opts.width ?? 1024, opts.height ?? 1024);
      const started = Date.now();

      const res = await getClient().images.generate(
        {
          model: cfg.endpoint,
          prompt,
          size,
          n: 1,
          output_format: "png",
          quality: cfg.params?.quality ?? "low",
        },
        { signal: opts.signal },
      );

      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error("openai returned no image");

      return {
        imageBytes: Uint8Array.from(Buffer.from(b64, "base64")),
        mimeType: "image/png",
        seed: null, // openai has no seed param
        model: id,
        latencyMs: Date.now() - started,
        costUsd: estimateCost(cfg.pricing, w, h),
      };
    },
  };
}
