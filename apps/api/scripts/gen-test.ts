// npm run gen:test -- cf-flux-schnell "a ceramic coffee cup on a wooden table"
import { getImageProvider, isModelId, MODEL_IDS } from "../src/providers/index.js";
import { uploadImage } from "../src/storage/r2.js";

const [modelArg = "cf-flux-schnell", ...rest] = process.argv.slice(2);
const prompt = rest.join(" ") || "a ceramic coffee cup on a wooden table, soft daylight";

if (!isModelId(modelArg)) {
  console.error(`unknown model "${modelArg}", use one of: ${MODEL_IDS.join(", ")}`);
  process.exit(1);
}

const result = await getImageProvider(modelArg).generate(prompt, {
  signal: AbortSignal.timeout(120_000),
});

const ext = result.mimeType.split("/")[1] ?? "png";
const { url } = await uploadImage(`tests/${modelArg}-${Date.now()}.${ext}`, result.imageBytes, result.mimeType);

console.log({
  model: result.model,
  seed: result.seed,
  latencyMs: result.latencyMs,
  costUsd: result.costUsd,
  sizeKb: Math.round(result.imageBytes.length / 1024),
  url,
});
