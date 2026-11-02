import type { BrandVersion } from "@prisma/client";

// bump on any wording change, every stored score keeps the version it was made with
// j2: explicit score anchors, llama scored clean images around 7 under j1
export const JUDGE_PROMPT_VERSION = "j2";

export const SYSTEM_PROMPT = `You review images for brand consistency.
You judge only the visual style: colors, light, mood, composition, materials.
You do not judge the subject or how well the image matches the request.
You answer with a single JSON object and nothing else.`;

export function userPrompt(brand: Pick<BrandVersion, "rules" | "palette">): string {
  return `Brand rules:
${brand.rules}

Brand palette (hex): ${brand.palette.join(", ")}

Score how well the image follows these rules.
9-10 = follows every rule, a designer would ship it as is
7-8 = follows the rules with a small, easy to miss deviation
4-6 = clearly breaks at least one rule
0-3 = breaks several rules or looks like a different brand

Only rules that are written above count. Do not take points off for the subject, image quality or anything the rules do not mention. If nothing breaks a rule, the score is 9 or 10.

Also estimate paletteMatch from 0 to 1: how close the dominant colors of the image are to the brand palette.

Reply with exactly this JSON shape:
{"score": <number 0-10>, "paletteMatch": <number 0-1>, "reasons": ["<short concrete observation tied to a rule>", ...]}

Give 2 to 4 reasons. Mention what breaks the rules, not only what follows them.`;
}

export const RETRY_NUDGE =
  'Your previous reply was not valid. Reply with only the JSON object, e.g. {"score": 6, "paletteMatch": 0.5, "reasons": ["...", "..."]}';
