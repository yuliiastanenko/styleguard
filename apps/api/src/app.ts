import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { env } from "./env.js";
import { health } from "./routes/health.js";
import { models } from "./routes/models.js";
import { brands } from "./routes/brands.js";
import { generations } from "./routes/generations.js";
import { drift } from "./routes/drift.js";

export const app = new Hono();

// entries like https://*.lovable.app match any subdomain
const patterns = env.CORS_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+")}$`, "i"));

function allowedOrigin(origin: string) {
  return patterns.some((re) => re.test(origin));
}

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigin(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Idempotency-Key"],
  }),
);

app.get("/", (c) => c.json({ name: "styleguard-api" }));
app.route("/health", health);
app.route("/models", models);
app.route("/brands", brands);
app.route("/generations", generations);
app.route("/drift", drift);

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});
