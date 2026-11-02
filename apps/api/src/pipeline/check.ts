import type { BrandVersion } from "@prisma/client";

export type CheckResult =
  | {
      status: "ok";
      score: number;
      reasons: string;
      paletteMatch: number | null;
      judgeModel: string;
      judgePromptVersion: string;
    }
  | {
      status: "check_unavailable";
      reason: string;
      judgeModel: string | null;
      judgePromptVersion: string | null;
    };

// TODO: real vision judge in step 5. until then we never invent a score
export async function checkImage(
  _imageUrl: string,
  _brand: BrandVersion,
  _signal?: AbortSignal,
): Promise<CheckResult> {
  return {
    status: "check_unavailable",
    reason: "judge not configured yet",
    judgeModel: null,
    judgePromptVersion: null,
  };
}
