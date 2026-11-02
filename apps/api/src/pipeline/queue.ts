import type { GenerationStatus } from "@prisma/client";
import { prisma } from "../db.js";

export type ClaimedJob = {
  id: string;
  generationId: string;
  attempts: number;
  maxAttempts: number;
};

// a lock older than this means the worker holding it died
const STALE_LOCK = "10 minutes";

// prisma stores DateTime as utc timestamps without a zone, so compare against utc
const NOW = `(now() AT TIME ZONE 'UTC')`;

export async function claimJob(workerId: string): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRawUnsafe<ClaimedJob[]>(
    `UPDATE "Job"
        SET "lockedAt" = ${NOW}, "lockedBy" = $1, "attempts" = "attempts" + 1, "updatedAt" = ${NOW}
      WHERE "id" = (
        SELECT "id" FROM "Job"
         WHERE "status" NOT IN ('done', 'failed')
           AND "runAfter" <= ${NOW}
           AND ("lockedAt" IS NULL OR "lockedAt" < ${NOW} - interval '${STALE_LOCK}')
         ORDER BY "runAfter"
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "generationId", "attempts", "maxAttempts"`,
    workerId,
  );
  return rows[0] ?? null;
}

export async function setStage(job: ClaimedJob, status: GenerationStatus) {
  await prisma.$transaction([
    prisma.job.update({ where: { id: job.id }, data: { status } }),
    prisma.generation.update({ where: { id: job.generationId }, data: { status } }),
  ]);
}

export function backoffMs(attempt: number): number {
  const base = 5_000 * 2 ** (attempt - 1);
  return Math.min(base, 5 * 60_000) + Math.floor(Math.random() * 1_000);
}

export async function scheduleRetry(job: ClaimedJob, error: string) {
  const runAfter = new Date(Date.now() + backoffMs(job.attempts));
  await prisma.$transaction([
    prisma.job.update({
      where: { id: job.id },
      data: { status: "queued", runAfter, lockedAt: null, lockedBy: null, lastError: error },
    }),
    prisma.generation.update({
      where: { id: job.generationId },
      data: { status: "queued", error: `attempt ${job.attempts} failed, retrying: ${error}` },
    }),
  ]);
  return runAfter;
}

export async function failJob(job: ClaimedJob, error: string) {
  await prisma.$transaction([
    prisma.job.update({
      where: { id: job.id },
      data: { status: "failed", lockedAt: null, lockedBy: null, lastError: error },
    }),
    prisma.generation.update({
      where: { id: job.generationId },
      data: { status: "failed", error },
    }),
  ]);
}

export async function completeJob(job: ClaimedJob) {
  await prisma.$transaction([
    prisma.job.update({
      where: { id: job.id },
      data: { status: "done", lockedAt: null, lockedBy: null, lastError: null },
    }),
    prisma.generation.update({
      where: { id: job.generationId },
      data: { status: "done", error: null },
    }),
  ]);
}
