import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { latestVersion } from "../services/brands.js";
import { MODELS, isModelId } from "../providers/index.js";
import { activeJudge } from "../pipeline/check.js";
import { JUDGE_PROMPT_VERSION } from "../judge/prompt.js";
import { decide, mean } from "./logic.js";
import { sendSlack } from "./slack.js";

export const modelLabel = (id: string) => (isModelId(id) ? MODELS[id].label : id);

// eval showed every judge has its own scale, so scores from another judge or prompt are never mixed in
export function comparableChecks(brandId: string, model?: string): Prisma.GenerationWhereInput {
  return {
    brandVersion: { brandId },
    ...(model ? { model } : {}),
    checkStatus: "ok",
    score: { not: null },
    judgeModel: activeJudge(),
    judgePromptVersion: JUDGE_PROMPT_VERSION,
  };
}

export async function updateDrift(brandId: string, model: string) {
  const [brand, version, recent] = await Promise.all([
    prisma.brand.findUniqueOrThrow({ where: { id: brandId } }),
    latestVersion(brandId),
    prisma.generation.findMany({
      where: comparableChecks(brandId, model),
      orderBy: { createdAt: "desc" },
      take: env.DRIFT_WINDOW,
      select: { subject: true, imageUrl: true, score: true },
    }),
  ]);
  if (!version) return;

  const scores = recent.map((g) => g.score!);
  const m = mean(scores);

  const state = await prisma.driftState.upsert({
    where: { brandId_model: { brandId, model } },
    create: { brandId, model },
    update: {},
  });

  const d = decide(state.status, m, scores.length, version.threshold, env.DRIFT_MIN_SAMPLES, env.DRIFT_RECOVERY_MARGIN);

  if (!d.changed) {
    await prisma.driftState.update({ where: { id: state.id }, data: { mean: m, samples: scores.length } });
    return;
  }

  // two workers can finish at once, only the one whose update matches the old status sends the alert
  const flipped = await prisma.driftState.updateMany({
    where: { id: state.id, status: state.status },
    data: { status: d.next, mean: m, samples: scores.length, changedAt: new Date() },
  });
  if (flipped.count === 0) return;

  await sendSlack({
    kind: d.next === "drifting" ? "drift" : "recovered",
    brandName: brand.name,
    brandSlug: brand.slug,
    brandVersion: version.version,
    modelLabel: modelLabel(model),
    mean: m!,
    threshold: version.threshold,
    samples: scores.length,
    judge: activeJudge(),
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    latest: recent[0] ? { subject: recent[0].subject, imageUrl: recent[0].imageUrl, score: recent[0].score } : undefined,
  });
}
