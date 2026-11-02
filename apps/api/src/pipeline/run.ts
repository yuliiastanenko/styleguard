import { prisma } from "../db.js";
import { getImageProvider, isModelId } from "../providers/index.js";
import { imageKeyFor, uploadImage } from "../storage/r2.js";
import { env } from "../env.js";
import { errorMessage, isRetryable } from "../lib/errors.js";
import { checkImage, saveCheck, saveUnavailable } from "./check.js";
import { setStage, type ClaimedJob } from "./queue.js";
import { updateDrift } from "../drift/service.js";

const GENERATE_TIMEOUT_MS = 120_000;
const UPLOAD_TIMEOUT_MS = 30_000;
const CHECK_TIMEOUT_MS = 120_000;

function extFor(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

// each stage checks what is already saved, so a retry picks up where the last attempt stopped
export async function runPipeline(job: ClaimedJob) {
  const gen = await prisma.generation.findUniqueOrThrow({
    where: { id: job.generationId },
    include: { brandVersion: true },
  });

  if (!isModelId(gen.model)) throw new Error(`unknown model ${gen.model}`);

  if (!gen.imageKey) {
    await setStage(job, "generating");
    const result = await getImageProvider(gen.model).generate(gen.prompt, {
      seed: gen.seed ?? undefined,
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });

    await prisma.generation.update({
      where: { id: gen.id },
      data: { seed: result.seed, latencyMs: result.latencyMs, costUsd: result.costUsd },
    });

    await setStage(job, "uploading");
    const key = imageKeyFor(gen.id, extFor(result.mimeType));
    const upload = await Promise.race([
      uploadImage(key, result.imageBytes, result.mimeType),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error("upload timed out"), { name: "TimeoutError" })), UPLOAD_TIMEOUT_MS),
      ),
    ]);

    gen.imageKey = upload.key;
    gen.imageUrl = upload.url;
    await prisma.generation.update({
      where: { id: gen.id },
      data: { imageKey: upload.key, imageUrl: upload.url },
    });
  }

  await setStage(job, "checking");
  try {
    const result = await checkImage(gen.imageUrl!, gen.brandVersion, AbortSignal.timeout(CHECK_TIMEOUT_MS));
    await saveCheck(gen.id, gen.brandVersion.threshold, result);
    if (result.status === "ok") {
      await updateDrift(gen.brandVersion.brandId, gen.model).catch((e) =>
        console.error(`[drift] update failed: ${errorMessage(e)}`),
      );
    }
  } catch (e) {
    // the image is fine, so a judge outage on the last attempt should not fail the whole generation
    if (isRetryable(e) && job.attempts < job.maxAttempts) throw e;
    await saveUnavailable(gen.id, `judge error: ${errorMessage(e)}`, env.JUDGE_MODEL);
  }
}
