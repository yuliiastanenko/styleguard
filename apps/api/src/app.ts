import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { env } from "./env.js";
import { health } from "./routes/health.js";
import { models } from "./routes/models.js";
import { brands } from "./routes/brands.js";
import { generations } from "./routes/generations.js";

export const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGINS.split(",").map((s) => s.trim()),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Idempotency-Key"],
  }),
);

app.get("/", (c) => c.json({ name: "styleguard-api" }));
app.route("/health", health);
app.route("/models", models);
app.route("/brands", brands);
app.route("/generations", generations);

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});
