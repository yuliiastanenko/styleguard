import { Hono } from "hono";
import { MODELS, DEFAULT_MODEL, MODEL_IDS, isModelAvailable } from "../providers/index.js";

export const models = new Hono();

models.get("/", (c) =>
  c.json({
    default: DEFAULT_MODEL,
    items: MODEL_IDS.filter(isModelAvailable).map((id) => ({
      id,
      label: MODELS[id].label,
      provider: MODELS[id].provider,
      pricing: MODELS[id].pricing,
    })),
  }),
);
