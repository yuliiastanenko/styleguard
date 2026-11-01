import { env } from "../env.js";
import { estimateCost } from "./cost.js";
import type { ImageProvider, ModelConfig } from "./types.js";

function sniffMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return "application/octet-stream";
}

export function createCloudflareProvider(
  id: string,
  cfg: Extract<ModelConfig, { provider: "cloudflare" }>,
): ImageProvider {
  return {
    async generate(prompt, opts = {}) {
      if (!env.CF_AI_TOKEN) throw new Error("CF_AI_TOKEN is not set");

      const width = cfg.sizable ? (opts.width ?? 1024) : 1024;
      const height = cfg.sizable ? (opts.height ?? 1024) : 1024;
      const seed = cfg.seedable ? (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) : null;

      const fields: Record<string, string | number> = { prompt };
      if (seed !== null) fields.seed = seed;
      if (cfg.steps) fields.steps = cfg.steps;
      if (cfg.sizable) Object.assign(fields, { width, height });

      let body: BodyInit;
      const headers: Record<string, string> = { Authorization: `Bearer ${env.CF_AI_TOKEN}` };
      if (cfg.input === "multipart") {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
        body = form;
      } else {
        body = JSON.stringify(fields);
        headers["Content-Type"] = "application/json";
      }

      const started = Date.now();
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.R2_ACCOUNT_ID}/ai/run/${cfg.endpoint}`,
        { method: "POST", headers, body, signal: opts.signal },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`cloudflare ai ${res.status}: ${text.slice(0, 300)}`);
      }

      // some models answer with json + base64, others with raw image bytes
      let imageBytes: Uint8Array;
      if (res.headers.get("content-type")?.includes("application/json")) {
        const json = (await res.json()) as { result?: { image?: string } };
        const b64 = json.result?.image;
        if (!b64) throw new Error("cloudflare ai returned no image");
        imageBytes = Uint8Array.from(Buffer.from(b64, "base64"));
      } else {
        imageBytes = new Uint8Array(await res.arrayBuffer());
      }

      return {
        imageBytes,
        mimeType: sniffMime(imageBytes),
        seed,
        model: id,
        latencyMs: Date.now() - started,
        costUsd: estimateCost(cfg.pricing, width, height, cfg.steps ?? 0),
      };
    },
  };
}
