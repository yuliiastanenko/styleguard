import { Hono } from "hono";
import { MODELS, DEFAULT_MODEL } from "../providers/index.js";

export const models = new Hono();

models.get("/", (c) =>
  c.json({
    default: DEFAULT_MODEL,
    items: Object.entries(MODELS).map(([id, m]) => ({
      id,
      label: m.label,
      provider: m.provider,
      pricing: m.pricing,
    })),
  }),
);
