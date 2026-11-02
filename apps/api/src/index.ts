import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { app } from "./app.js";
import { prisma } from "./db.js";
import { startWorker } from "./pipeline/worker-loop.js";

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on :${info.port}`);
});

// free hosting gives one process, so the worker can live inside the api.
// with a separate worker service keep RUN_WORKER off
const worker = env.RUN_WORKER ? startWorker(env.WORKER_CONCURRENCY) : null;

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  server.close();
  await worker?.stop();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
