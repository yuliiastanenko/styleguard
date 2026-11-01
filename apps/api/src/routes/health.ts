import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../db.js";
import { pingR2 } from "../storage/r2.js";
import { validate } from "../lib/validate.js";

export const health = new Hono();

// ?deep=1 also checks r2
health.get(
  "/",
  validate("query", z.object({ deep: z.enum(["0", "1"]).optional() })),
  async (c) => {
    const { deep } = c.req.valid("query");
    const checks: Record<string, string> = {};

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.db = "ok";
    } catch (e) {
      checks.db = `error: ${(e as Error).message.slice(0, 200)}`;
    }

    if (deep === "1") {
      try {
        await pingR2();
        checks.r2 = "ok";
      } catch (e) {
        checks.r2 = `error: ${(e as Error).name}`;
      }
    }

    const ok = Object.values(checks).every((v) => v === "ok");
    return c.json(
      { status: ok ? "ok" : "degraded", checks, time: new Date().toISOString() },
      ok ? 200 : 503,
    );
  },
);
