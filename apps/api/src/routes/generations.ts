import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { validate } from "../lib/validate.js";
import { findBrand, latestVersion } from "../services/brands.js";
import { DEFAULT_MODEL, MODEL_IDS, isModelAvailable } from "../providers/index.js";
import { buildPrompt, PROMPT_TEMPLATE_VERSION } from "../pipeline/prompt.js";

export const generations = new Hono();

const include = {
  brandVersion: { include: { brand: true } },
  job: true,
} satisfies Prisma.GenerationInclude;

type GenerationRow = Prisma.GenerationGetPayload<{ include: typeof include }>;

const dto = (g: GenerationRow) => ({
  id: g.id,
  status: g.status,
  checkStatus: g.checkStatus,
  brand: { id: g.brandVersion.brand.id, slug: g.brandVersion.brand.slug, name: g.brandVersion.brand.name },
  brandVersion: { id: g.brandVersion.id, version: g.brandVersion.version, threshold: g.brandVersion.threshold },
  subject: g.subject,
  prompt: g.prompt,
  promptTemplateVersion: g.promptTemplateVersion,
  model: g.model,
  seed: g.seed,
  latencyMs: g.latencyMs,
  costUsd: g.costUsd,
  imageUrl: g.imageUrl,
  score: g.score,
  reasons: g.reasons,
  paletteMatch: g.paletteMatch,
  onBrand: g.onBrand,
  judgeModel: g.judgeModel,
  judgePromptVersion: g.judgePromptVersion,
  error: g.error,
  attempts: g.job?.attempts ?? 0,
  maxAttempts: g.job?.maxAttempts ?? 0,
  createdAt: g.createdAt,
  updatedAt: g.updatedAt,
});

const CreateGeneration = z.object({
  brand: z.string().min(1),
  subject: z.string().trim().min(2).max(500),
  model: z.enum(MODEL_IDS).default(DEFAULT_MODEL),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

generations.post("/", validate("json", CreateGeneration), async (c) => {
  const body = c.req.valid("json");
  const idempotencyKey = c.req.header("Idempotency-Key")?.trim() || body.idempotencyKey;

  if (idempotencyKey) {
    const existing = await prisma.generation.findUnique({ where: { idempotencyKey }, include });
    if (existing) return c.json({ ...dto(existing), replayed: true }, 200);
  }

  if (!isModelAvailable(body.model)) return c.json({ error: "model_unavailable", model: body.model }, 400);

  const brand = await findBrand(body.brand);
  if (!brand) return c.json({ error: "brand_not_found" }, 404);
  const version = await latestVersion(brand.id);
  if (!version) return c.json({ error: "brand_has_no_versions" }, 409);

  try {
    const created = await prisma.generation.create({
      data: {
        idempotencyKey,
        brandVersionId: version.id,
        subject: body.subject,
        prompt: buildPrompt(body.subject, version),
        promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
        model: body.model,
        seed: body.seed,
        job: { create: {} },
      },
      include,
    });
    return c.json(dto(created), 202);
  } catch (e) {
    // two requests with the same key raced, return the one that won
    if (idempotencyKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.generation.findUniqueOrThrow({ where: { idempotencyKey }, include });
      return c.json({ ...dto(existing), replayed: true }, 200);
    }
    throw e;
  }
});

const ListQuery = z.object({
  brand: z.string().optional(),
  model: z.enum(MODEL_IDS).optional(),
  status: z.enum(["queued", "generating", "uploading", "checking", "done", "failed"]).optional(),
  onBrand: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

generations.get("/", validate("query", ListQuery), async (c) => {
  const q = c.req.valid("query");

  const where: Prisma.GenerationWhereInput = {};
  if (q.brand) {
    const brand = await findBrand(q.brand);
    if (!brand) return c.json({ items: [], nextCursor: null });
    where.brandVersion = { brandId: brand.id };
  }
  if (q.model) where.model = q.model;
  if (q.status) where.status = q.status;
  if (q.onBrand) where.onBrand = q.onBrand === "true";

  const rows = await prisma.generation.findMany({
    where,
    include,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > q.limit;
  const items = rows.slice(0, q.limit);
  return c.json({ items: items.map(dto), nextCursor: hasMore ? items[items.length - 1].id : null });
});

generations.get("/:id", async (c) => {
  const g = await prisma.generation.findUnique({ where: { id: c.req.param("id") }, include });
  if (!g) return c.json({ error: "generation_not_found" }, 404);
  return c.json(dto(g));
});
