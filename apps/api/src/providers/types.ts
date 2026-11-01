export type GenerateOpts = {
  seed?: number;
  width?: number;
  height?: number;
  signal?: AbortSignal;
};

export type GenerateResult = {
  imageBytes: Uint8Array;
  mimeType: string;
  seed: number | null;
  model: string;
  latencyMs: number;
  costUsd: number | null;
};

export interface ImageProvider {
  generate(prompt: string, opts?: GenerateOpts): Promise<GenerateResult>;
}

export type Pricing =
  | { perImage: number }
  | { perMegapixel: number }
  | { perTile: number; perStep: number; tileSize: number };

type Base = { endpoint: string; label: string; pricing: Pricing };

export type ModelConfig =
  | (Base & { provider: "fal"; params?: Record<string, unknown> })
  | (Base & { provider: "openai"; params?: { quality?: "low" | "medium" | "high" } })
  | (Base & {
      provider: "cloudflare";
      input: "json" | "multipart";
      steps?: number;
      sizable?: boolean;
      seedable?: boolean;
    });
