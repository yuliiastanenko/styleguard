import type { Pricing } from "./types.js";

export function estimateCost(pricing: Pricing, width: number, height: number, steps = 0): number {
  let usd: number;
  if ("perImage" in pricing) {
    usd = pricing.perImage;
  } else if ("perMegapixel" in pricing) {
    usd = ((width * height) / 1_000_000) * pricing.perMegapixel;
  } else {
    const tiles = Math.ceil(width / pricing.tileSize) * Math.ceil(height / pricing.tileSize);
    usd = tiles * pricing.perTile + steps * pricing.perStep;
  }
  return Math.round(usd * 1e6) / 1e6;
}
