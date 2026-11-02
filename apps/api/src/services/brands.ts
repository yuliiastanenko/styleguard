import { Prisma, type BrandVersion } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a hex color like #A1B2C3");

export const VersionFields = z.object({
  stylePrompt: z.string().trim().min(10).max(2000),
  rules: z.string().trim().min(10).max(4000),
  palette: z.array(hex).min(1).max(12),
  threshold: z.number().min(0).max(10),
  note: z.string().trim().max(500).optional(),
});

export const CreateBrand = VersionFields.extend({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, "lowercase letters, digits and dashes"),
  name: z.string().trim().min(1).max(100),
});

export const UpdateBrand = VersionFields.partial().extend({
  name: z.string().trim().min(1).max(100).optional(),
});

export type CreateBrandInput = z.infer<typeof CreateBrand>;
export type UpdateBrandInput = z.infer<typeof UpdateBrand>;

export function findBrand(idOrSlug: string) {
  return prisma.brand.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] } });
}

export function latestVersion(brandId: string) {
  return prisma.brandVersion.findFirst({ where: { brandId }, orderBy: { version: "desc" } });
}

export async function createBrand(input: CreateBrandInput) {
  const { slug, name, ...version } = input;
  return prisma.brand.create({
    data: { slug, name, versions: { create: { ...version, version: 1 } } },
    include: { versions: true },
  });
}

const sameVersion = (a: BrandVersion, b: z.infer<typeof VersionFields>) =>
  a.stylePrompt === b.stylePrompt &&
  a.rules === b.rules &&
  a.threshold === b.threshold &&
  a.palette.join() === b.palette.join();

// versions are never updated in place, an edit appends version + 1
export async function updateBrand(brandId: string, input: UpdateBrandInput) {
  const { name, ...changes } = input;

  if (name) await prisma.brand.update({ where: { id: brandId }, data: { name } });

  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await latestVersion(brandId);
    if (!current) throw new Error(`brand ${brandId} has no versions`);

    const next = {
      stylePrompt: changes.stylePrompt ?? current.stylePrompt,
      rules: changes.rules ?? current.rules,
      palette: changes.palette ?? current.palette,
      threshold: changes.threshold ?? current.threshold,
    };
    if (sameVersion(current, next)) return { version: current, created: false };

    try {
      const version = await prisma.brandVersion.create({
        data: { ...next, note: changes.note, brandId, version: current.version + 1 },
      });
      return { version, created: true };
    } catch (e) {
      // someone else saved a version at the same moment, read again and retry
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("could not save brand version, try again");
}
