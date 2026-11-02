import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { validate } from "../lib/validate.js";
import { findBrand, latestVersion } from "../services/brands.js";
import { MODEL_IDS } from "../providers/index.js";
import { activeJudge } from "../pipeline/check.js";
import { JUDGE_PROMPT_VERSION } from "../judge/prompt.js";
import { comparableChecks, modelLabel, updateDrift } from "../drift/service.js";
import { mean, rollingMeans } from "../drift/logic.js";

export const drift = new Hono();

const Query = z.object({
  brand: z.string().optional(),
  model: z.enum(MODEL_IDS).optional(),
  limit: z.coerce.number().int().min(5).max(200).default(50),
});

// one series per brand + model that has scores from the current judge, points oldest first
drift.get("/", validate("query", Query), async (c) => {
  const q = c.req.valid("query");

  const brands = q.brand
    ? [await findBrand(q.brand)].filter((b) => b !== null)
    : await prisma.brand.findMany({ orderBy: { createdAt: "asc" } });

  const series = [];
  for (const brand of brands) {
    const version = await latestVersion(brand.id);
    if (!version) continue;

    const pairs = await prisma.generation.groupBy({
      by: ["model"],
      where: comparableChecks(brand.id, q.model),
    });

    for (const { model } of pairs) {
      const rows = await prisma.generation.findMany({
        where: comparableChecks(brand.id, model),
        orderBy: { createdAt: "desc" },
        take: q.limit,
        select: { id: true, createdAt: true, score: true, onBrand: true, imageUrl: true, subject: true, brandVersion: { select: { version: true } } },
      });
      rows.reverse();

      const scores = rows.map((r) => r.score!);
      const rolling = rollingMeans(scores, env.DRIFT_WINDOW);
      const state = await prisma.driftState.findUnique({ where: { brandId_model: { brandId: brand.id, model } } });

      series.push({
        brand: { id: brand.id, slug: brand.slug, name: brand.name },
        model,
        modelLabel: modelLabel(model),
        threshold: version.threshold,
        brandVersion: version.version,
        status: state?.status ?? "ok",
        statusSince: state?.changedAt ?? null,
        currentMean: mean(scores.slice(-env.DRIFT_WINDOW)),
        points: rows.map((r, i) => ({
          id: r.id,
          createdAt: r.createdAt,
          score: r.score,
          rollingMean: Math.round(rolling[i] * 100) / 100,
          onBrand: r.onBrand,
          brandVersion: r.brandVersion.version,
          subject: r.subject,
          imageUrl: r.imageUrl,
        })),
      });
    }
  }

  return c.json({
    window: env.DRIFT_WINDOW,
    minSamples: env.DRIFT_MIN_SAMPLES,
    judge: activeJudge(),
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    series,
  });
});

// recompute every pair, handy after changing a threshold or the window
drift.post("/recompute", async (c) => {
  const pairs = await prisma.generation.groupBy({
    by: ["model", "brandVersionId"],
    where: { checkStatus: "ok" },
  });
  const versions = await prisma.brandVersion.findMany({
    where: { id: { in: pairs.map((p) => p.brandVersionId) } },
    select: { id: true, brandId: true },
  });
  const brandOf = new Map(versions.map((v) => [v.id, v.brandId]));
  const unique = new Set(pairs.map((p) => `${brandOf.get(p.brandVersionId)}|${p.model}`));

  for (const key of unique) {
    const [brandId, model] = key.split("|");
    await updateDrift(brandId, model);
  }
  return c.json({ recomputed: unique.size });
});
