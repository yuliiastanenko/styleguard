# StyleGuard API

Base URL: `https://<your-service>.onrender.com`

All bodies are JSON. Validation errors return `400`:

```json
{ "error": "validation_error", "issues": [{ "path": "subject", "message": "Too small: expected string to have >=2 characters" }] }
```

Other errors return `{ "error": "<code>" }` with 404 / 409 / 500.

## Health

`GET /health` → `{ "status": "ok", "checks": { "db": "ok" }, "time": "..." }`
`GET /health?deep=1` also checks R2.

## Models

`GET /models` (only models whose provider key is configured)

```json
{
  "default": "cf-flux-schnell",
  "items": [{ "id": "cf-flux-schnell", "label": "FLUX.1 schnell (Cloudflare)", "provider": "cloudflare", "pricing": { "perTile": 0.0000528, "perStep": 0.0001056, "tileSize": 512 } }]
}
```

## Brands

A brand has immutable versions. Editing a brand appends a new version; old generations keep pointing to the version they were made with.

`BrandVersion`:

```json
{ "id": "...", "version": 2, "stylePrompt": "...", "rules": "...", "palette": ["#E8E2D6"], "threshold": 7.5, "note": "stricter threshold", "createdAt": "..." }
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/brands` | | `{ items: Brand[] }` |
| POST | `/brands` | `{ slug, name, stylePrompt, rules, palette, threshold, note? }` | `201 Brand`, `409 slug_taken` |
| GET | `/brands/:idOrSlug` | | `Brand & { versions: (BrandVersion & { generationCount })[] }` newest first |
| GET | `/brands/:idOrSlug/versions/:n` | | `BrandVersion` |
| PATCH | `/brands/:idOrSlug` | any of `{ name, stylePrompt, rules, palette, threshold, note }` | `Brand & { versionCreated: boolean }` |
| DELETE | `/brands/:idOrSlug` | | `204`, `409 brand_has_generations` |

`Brand`:

```json
{ "id": "...", "slug": "nordic", "name": "Nordic Co", "createdAt": "...", "versionCount": 2, "latest": BrandVersion }
```

Rules: `slug` is `[a-z0-9-]{2,40}`, `palette` is 1 to 12 hex colors like `#A1B2C3`, `threshold` is 0 to 10, `stylePrompt` and `rules` at least 10 chars.

## Generations

`POST /generations` queues a job and returns immediately with `202`.

```json
{ "brand": "nordic", "subject": "a ceramic vase", "model": "cf-flux-schnell", "seed": 42 }
```

`model` and `seed` are optional. Send an `Idempotency-Key` header (any unique string, 8+ chars) to make retries safe: the same key returns the same generation with `200` and `"replayed": true`.

`Generation`:

```json
{
  "id": "...",
  "status": "queued | generating | uploading | checking | done | failed",
  "checkStatus": "pending | ok | check_unavailable",
  "brand": { "id": "...", "slug": "nordic", "name": "Nordic Co" },
  "brandVersion": { "id": "...", "version": 2, "threshold": 7.5 },
  "subject": "...",
  "prompt": "...",
  "promptTemplateVersion": "p1",
  "model": "cf-flux-schnell",
  "seed": null,
  "latencyMs": 1946,
  "costUsd": 0.000634,
  "imageUrl": "https://...r2.dev/generations/<id>.jpg",
  "score": 7,
  "reasons": "line one\nline two",
  "paletteMatch": 0.8,
  "onBrand": true,
  "judgeModel": "cf-llama4-scout",
  "judgePromptVersion": "j1",
  "error": null,
  "attempts": 1,
  "maxAttempts": 3,
  "createdAt": "...",
  "updatedAt": "..."
}
```

`score` and `onBrand` are `null` unless `checkStatus` is `ok`. The score is never guessed.

`GET /generations/:id` for polling, until `status` is `done` or `failed`.

`GET /generations?brand=&model=&status=&onBrand=true|false&limit=20&cursor=` → `{ items: Generation[], nextCursor: string | null }`, newest first. Pass `nextCursor` back as `cursor` for the next page.
