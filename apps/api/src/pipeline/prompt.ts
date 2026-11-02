import type { BrandVersion } from "@prisma/client";

// bump when the template below changes, old generations keep their value
export const PROMPT_TEMPLATE_VERSION = "p1";

export function buildPrompt(subject: string, brand: Pick<BrandVersion, "stylePrompt">): string {
  return `${subject.trim().replace(/[.\s]+$/, "")}. Style: ${brand.stylePrompt}.`;
}
