import { Hono } from "hono";
import { z } from "zod";
import { Prisma, type Brand, type BrandVersion } from "@prisma/client";
import { prisma } from "../db.js";
import { validate } from "../lib/validate.js";
import {
  CreateBrand,
  UpdateBrand,
  createBrand,
  findBrand,
  updateBrand,
} from "../services/brands.js";

export const brands = new Hono();

const versionDto = (v: BrandVersion) => ({
  id: v.id,
  version: v.version,
  stylePrompt: v.stylePrompt,
  rules: v.rules,
  palette: v.palette,
  threshold: v.threshold,
  note: v.note,
  createdAt: v.createdAt,
});

const brandDto = (b: Brand, latest: BrandVersion | null, versionCount: number) => ({
  id: b.id,
  slug: b.slug,
  name: b.name,
  createdAt: b.createdAt,
  versionCount,
  latest: latest ? versionDto(latest) : null,
});

brands.get("/", async (c) => {
  const rows = await prisma.brand.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      versions: { orderBy: { version: "desc" }, take: 1 },
      _count: { select: { versions: true } },
    },
  });
  return c.json({ items: rows.map((b) => brandDto(b, b.versions[0] ?? null, b._count.versions)) });
});

brands.post("/", validate("json", CreateBrand), async (c) => {
  try {
    const brand = await createBrand(c.req.valid("json"));
    return c.json(brandDto(brand, brand.versions[0], 1), 201);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return c.json({ error: "slug_taken" }, 409);
    }
    throw e;
  }
});

brands.get("/:id", async (c) => {
  const brand = await findBrand(c.req.param("id"));
  if (!brand) return c.json({ error: "brand_not_found" }, 404);

  const versions = await prisma.brandVersion.findMany({
    where: { brandId: brand.id },
    orderBy: { version: "desc" },
    include: { _count: { select: { generations: true } } },
  });

  return c.json({
    ...brandDto(brand, versions[0] ?? null, versions.length),
    versions: versions.map((v) => ({ ...versionDto(v), generationCount: v._count.generations })),
  });
});

brands.get(
  "/:id/versions/:version",
  validate("param", z.object({ id: z.string(), version: z.coerce.number().int().positive() })),
  async (c) => {
    const { id, version } = c.req.valid("param");
    const brand = await findBrand(id);
    if (!brand) return c.json({ error: "brand_not_found" }, 404);

    const v = await prisma.brandVersion.findUnique({
      where: { brandId_version: { brandId: brand.id, version } },
    });
    if (!v) return c.json({ error: "version_not_found" }, 404);
    return c.json(versionDto(v));
  },
);

brands.patch("/:id", validate("json", UpdateBrand), async (c) => {
  const brand = await findBrand(c.req.param("id"));
  if (!brand) return c.json({ error: "brand_not_found" }, 404);

  const { version, created } = await updateBrand(brand.id, c.req.valid("json"));
  const fresh = await prisma.brand.findUniqueOrThrow({
    where: { id: brand.id },
    include: { _count: { select: { versions: true } } },
  });

  return c.json({ ...brandDto(fresh, version, fresh._count.versions), versionCreated: created });
});

brands.delete("/:id", async (c) => {
  const brand = await findBrand(c.req.param("id"));
  if (!brand) return c.json({ error: "brand_not_found" }, 404);

  const used = await prisma.generation.count({ where: { brandVersion: { brandId: brand.id } } });
  if (used > 0) return c.json({ error: "brand_has_generations", generations: used }, 409);

  await prisma.brand.delete({ where: { id: brand.id } });
  return c.body(null, 204);
});

