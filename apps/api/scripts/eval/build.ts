// npm run eval:build             generates the eval images, safe to rerun, skips what exists
// npm run eval:build -- --limit 10
import { prisma } from "../../src/db.js";
import { latestVersion } from "../../src/services/brands.js";
import { buildPrompt } from "../../src/pipeline/prompt.js";
import { getImageProvider, isModelAvailable, isModelId } from "../../src/providers/index.js";
import { uploadImage } from "../../src/storage/r2.js";
import { errorMessage } from "../../src/lib/errors.js";
import { arg, isQuotaError, paths, readJson, writeJson, type DatasetItem, type Kind } from "./common.js";

type Subjects = Record<
  string,
  { on: string[]; drift: string[]; foreign: { subject: string; style: string }[] }
>;

const model = arg("model", "cf-flux-schnell")!;
const limit = Number(arg("limit", "1000"));

if (!isModelId(model) || !isModelAvailable(model)) {
  console.error(`model ${model} is unknown or has no api key`);
  process.exit(1);
}

const subjects = readJson<Subjects>(paths.subjects, {});
const dataset = readJson<DatasetItem[]>(paths.dataset, []);
const done = new Set(dataset.map((d) => d.id));

const versions = new Map<string, NonNullable<Awaited<ReturnType<typeof latestVersion>>>>();
for (const slug of Object.keys(subjects)) {
  const brand = await prisma.brand.findUnique({ where: { slug } });
  const v = brand && (await latestVersion(brand.id));
  if (!v) {
    console.error(`brand ${slug} not found, run npm run db:seed first`);
    process.exit(1);
  }
  versions.set(slug, v);
}

type Plan = { id: string; brand: string; kind: Kind; subject: string; styleFrom: string };
const plan: Plan[] = [];
for (const [brand, s] of Object.entries(subjects)) {
  s.on.forEach((subject, i) => plan.push({ id: `${brand}-on-${i + 1}`, brand, kind: "on", subject, styleFrom: brand }));
  s.drift.forEach((subject, i) => plan.push({ id: `${brand}-drift-${i + 1}`, brand, kind: "drift", subject, styleFrom: brand }));
  s.foreign.forEach((f, i) => plan.push({ id: `${brand}-foreign-${i + 1}`, brand, kind: "foreign", subject: f.subject, styleFrom: f.style }));
}

const todo = plan.filter((p) => !done.has(p.id)).slice(0, limit);
console.log(`${dataset.length} images exist, ${todo.length} to generate with ${model}`);

const provider = getImageProvider(model);
let made = 0;

for (const p of todo) {
  const brandV = versions.get(p.brand)!;
  const styleV = versions.get(p.styleFrom);
  if (!styleV) {
    console.error(`${p.id}: style brand ${p.styleFrom} not found, skipped`);
    continue;
  }
  const prompt = buildPrompt(p.subject, styleV);

  try {
    const result = await provider.generate(prompt, { signal: AbortSignal.timeout(120_000) });
    const ext = result.mimeType === "image/jpeg" ? "jpg" : result.mimeType === "image/webp" ? "webp" : "png";
    const { url } = await uploadImage(`eval/${p.id}.${ext}`, result.imageBytes, result.mimeType);

    dataset.push({
      id: p.id,
      brand: p.brand,
      brandVersion: brandV.version,
      rules: brandV.rules,
      palette: brandV.palette,
      threshold: brandV.threshold,
      subject: p.subject,
      styleFrom: p.styleFrom,
      kind: p.kind,
      prompt,
      model,
      seed: result.seed,
      imageUrl: url,
    });
    dataset.sort((a, b) => a.id.localeCompare(b.id));
    writeJson(paths.dataset, dataset);
    made++;
    console.log(`  ${p.id} ok (${result.latencyMs}ms)`);
  } catch (e) {
    if (isQuotaError(e)) {
      console.log(`\ndaily limit reached after ${made} images. run the same command tomorrow to continue`);
      console.log(`cloudflare said: ${errorMessage(e).slice(0, 300)}`);
      break;
    }
    console.error(`  ${p.id} failed: ${errorMessage(e)}`);
  }
}

console.log(`\n${dataset.length}/${plan.length} images in eval/dataset.json`);
await prisma.$disconnect();
