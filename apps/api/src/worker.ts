import { hostname } from "node:os";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { claimJob, completeJob, failJob, scheduleRetry } from "./pipeline/queue.js";
import { runPipeline } from "./pipeline/run.js";
import { errorMessage, isRetryable } from "./lib/errors.js";

const workerId = `${hostname()}-${process.pid}`;
const IDLE_MS = 1_000;

let stopping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loop(slot: number) {
  while (!stopping) {
    let job;
    try {
      job = await claimJob(`${workerId}#${slot}`);
    } catch (e) {
      console.error(`[${slot}] claim failed:`, errorMessage(e));
      await sleep(5_000);
      continue;
    }

    if (!job) {
      await sleep(IDLE_MS);
      continue;
    }

    // only possible when a previous worker died mid-job
    if (job.attempts > job.maxAttempts) {
      await failJob(job, "gave up after a worker crash, max attempts reached").catch((e) =>
        console.error(`[${slot}] could not fail job:`, errorMessage(e)),
      );
      continue;
    }

    const started = Date.now();
    console.log(`[${slot}] job ${job.id} gen ${job.generationId} attempt ${job.attempts}/${job.maxAttempts}`);

    try {
      await runPipeline(job);
      await completeJob(job);
      console.log(`[${slot}] done ${job.generationId} in ${Date.now() - started}ms`);
    } catch (e) {
      const msg = errorMessage(e);
      try {
        if (isRetryable(e) && job.attempts < job.maxAttempts) {
          const at = await scheduleRetry(job, msg);
          console.warn(`[${slot}] retry ${job.generationId} at ${at.toISOString()}: ${msg}`);
        } else {
          await failJob(job, msg);
          console.error(`[${slot}] failed ${job.generationId}: ${msg}`);
        }
      } catch (dbError) {
        // the stale lock will hand the job to another worker later
        console.error(`[${slot}] could not record failure:`, errorMessage(dbError));
      }
    }
  }
}

async function main() {
  await prisma.$queryRaw`SELECT 1`;
  console.log(`worker ${workerId} started, concurrency ${env.WORKER_CONCURRENCY}`);

  const loops = Array.from({ length: env.WORKER_CONCURRENCY }, (_, i) => loop(i + 1));

  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log("stopping, waiting for running jobs");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await Promise.all(loops);
  await prisma.$disconnect();
  console.log("worker stopped");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
