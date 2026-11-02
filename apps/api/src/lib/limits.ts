import type { Context } from "hono";
import { prisma } from "../db.js";
import { env } from "../env.js";

export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextUtcMidnight(now = new Date()): Date {
  return new Date(startOfUtcDay(now).getTime() + 24 * 60 * 60 * 1000);
}

// counted in the database, so it holds across restarts and several instances
export async function dailyUsage() {
  const used = await prisma.generation.count({ where: { createdAt: { gte: startOfUtcDay() } } });
  return { limit: env.DAILY_GENERATION_LIMIT, used, remaining: Math.max(0, env.DAILY_GENERATION_LIMIT - used), resetsAt: nextUtcMidnight() };
}

// render puts the real client address first in x-forwarded-for
export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || c.req.header("x-real-ip") || "unknown";
}

// sliding window kept in memory, fine for one instance, a shared store would be needed with more
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  take(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.ceil((recent[0] + this.windowMs - now) / 1000) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return { ok: true };
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
  }
}

export const perIpGenerations = new RateLimiter(env.RATE_LIMIT_PER_IP, env.RATE_LIMIT_WINDOW_MIN * 60_000);
