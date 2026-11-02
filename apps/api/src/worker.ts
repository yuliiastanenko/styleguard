import { env } from "./env.js";
import { prisma } from "./db.js";
import { startWorker } from "./pipeline/worker-loop.js";

await prisma.$queryRaw`SELECT 1`;
const worker = startWorker(env.WORKER_CONCURRENCY);

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  console.log("stopping, waiting for running jobs");
  await worker.stop();
  await prisma.$disconnect();
  console.log("worker stopped");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
