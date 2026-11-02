import { prisma } from "../src/db.js";
import { createBrand, type CreateBrandInput } from "../src/services/brands.js";

const brands: CreateBrandInput[] = [
  {
    slug: "nordic",
    name: "Nordic Co",
    stylePrompt:
      "minimal Scandinavian aesthetic, muted desaturated tones, soft natural daylight, calm mood, generous negative space, matte textures",
    rules:
      "Muted, desaturated palette: beige, sage, soft grey, off-white. Minimal and uncluttered composition with lots of empty space. Soft diffused natural light. No bright saturated colors, no neon, no busy or patterned backgrounds, no text.",
    palette: ["#E8E2D6", "#9CAF88", "#B8B8B2", "#F5F3EE", "#6E7568"],
    threshold: 7,
    note: "initial",
  },
  {
    slug: "neon",
    name: "Neon Labs",
    stylePrompt:
      "bold cyberpunk aesthetic, vivid neon magenta and cyan lighting, deep dark background, high contrast, glossy reflections, energetic futuristic mood",
    rules:
      "Vivid neon palette dominated by magenta and cyan on a near-black background. High contrast, glowing light sources, futuristic and energetic feel. No pastel colors, no daylight scenes, no minimal beige or earthy tones.",
    palette: ["#FF2BD6", "#00E5FF", "#0B0B1A", "#7A00FF", "#F5F5FF"],
    threshold: 7,
    note: "initial",
  },
  {
    slug: "terra",
    name: "Terra Kitchen",
    stylePrompt:
      "warm editorial food photography, terracotta and olive tones, golden hour side light, rustic linen and clay surfaces, shallow depth of field",
    rules:
      "Warm earthy palette: terracotta, olive, cream, warm brown. Natural rustic materials like clay, wood and linen. Warm golden directional light with soft shadows. No cold blue tones, no plastic or glossy surfaces, no neon, no flat studio white backgrounds.",
    palette: ["#C8643B", "#7A7F3A", "#F1E6D2", "#5A3A26", "#D9A066"],
    threshold: 6.5,
    note: "initial",
  },
];

for (const b of brands) {
  const exists = await prisma.brand.findUnique({ where: { slug: b.slug } });
  if (exists) {
    console.log(`skip ${b.slug}, already exists`);
    continue;
  }
  await createBrand(b);
  console.log(`created ${b.slug}`);
}

await prisma.$disconnect();
