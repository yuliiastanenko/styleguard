import type { BrandVersion } from "@prisma/client";

// bump on any wording change, every stored score keeps the version it was made with
export const JUDGE_PROMPT_VERSION = "j1";

export const SYSTEM_PROMPT = `You review images for brand consistency.
You judge only the visual style: colors, light, mood, composition, materials.
You do not judge the subject or how well the image matches the request.
You answer with a single JSON object and nothing else.`;

export function userPrompt(brand: Pick<BrandVersion, "rules" | "palette">): string {
  return `Brand rules:
${brand.rules}

Brand palette (hex): ${brand.palette.join(", ")}

Score how well the image follows these rules.
10 = fully on brand, nothing to fix
7 = on brand with small deviations
4 = clear drift, several rules broken
1 = a completely different style

Also estimate paletteMatch from 0 to 1: how close the dominant colors of the image are to the brand palette.

Reply with exactly this JSON shape:
{"score": <number 0-10>, "paletteMatch": <number 0-1>, "reasons": ["<short concrete observation tied to a rule>", ...]}

Give 2 to 4 reasons. Mention what breaks the rules, not only what follows them.`;
}

export const RETRY_NUDGE =
  'Your previous reply was not valid. Reply with only the JSON object, e.g. {"score": 6, "paletteMatch": 0.5, "reasons": ["...", "..."]}';
