import { env } from "./env.js";
import { prisma } from "./db.js";

// TODO: queue loop
async function main() {
  await prisma.$queryRaw`SELECT 1`;
  console.log(`worker started (${env.NODE_ENV})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
