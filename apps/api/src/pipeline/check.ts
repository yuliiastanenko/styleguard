import type { BrandVersion } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { isJudgeId, type JudgeId } from "../judge/judges.js";
import { judgeImage, type JudgeResult } from "../judge/judge.js";
import { JUDGE_PROMPT_VERSION } from "../judge/prompt.js";

export function activeJudge(): JudgeId {
  if (!isJudgeId(env.JUDGE_MODEL)) throw new Error(`unknown JUDGE_MODEL ${env.JUDGE_MODEL}`);
  return env.JUDGE_MODEL;
}

export function checkImage(imageUrl: string, brand: BrandVersion, signal?: AbortSignal) {
  return judgeImage(imageUrl, brand, activeJudge(), signal);
}

// the score comes from the judge, the on/off-brand call is ours
export async function saveCheck(generationId: string, threshold: number, result: JudgeResult) {
  if (result.status === "ok") {
    const { score, paletteMatch, reasons } = result.verdict;
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        checkStatus: "ok",
        score,
        paletteMatch,
        reasons: reasons.join("\n"),
        onBrand: score >= threshold,
        judgeModel: result.judgeModel,
        judgePromptVersion: result.judgePromptVersion,
      },
    });
    return;
  }

  await saveUnavailable(generationId, result.reason, result.judgeModel);
}

export async function saveUnavailable(generationId: string, reason: string, judgeModel: string | null) {
  await prisma.generation.update({
    where: { id: generationId },
    data: {
      checkStatus: "check_unavailable",
      score: null,
      paletteMatch: null,
      onBrand: null,
      reasons: reason,
      judgeModel,
      judgePromptVersion: JUDGE_PROMPT_VERSION,
    },
  });
}
