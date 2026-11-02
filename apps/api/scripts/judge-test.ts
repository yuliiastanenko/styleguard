// npm run judge:test -- <generationId> [judge] [--save]
// npm run judge:test -- unchecked --save     re-judges everything that has no score yet
import { prisma } from "../src/db.js";
import { judgeImage } from "../src/judge/judge.js";
import { isJudgeId, JUDGE_IDS } from "../src/judge/judges.js";
import { activeJudge, saveCheck } from "../src/pipeline/check.js";

const args = process.argv.slice(2);
const save = args.includes("--save");
const [target, judgeArg] = args.filter((a) => !a.startsWith("--"));

if (!target) {
  console.error("usage: judge:test -- <generationId|unchecked> [judge] [--save]");
  process.exit(1);
}
if (judgeArg && !isJudgeId(judgeArg)) {
  console.error(`unknown judge "${judgeArg}", use one of: ${JUDGE_IDS.join(", ")}`);
  process.exit(1);
}
const judge = judgeArg && isJudgeId(judgeArg) ? judgeArg : activeJudge();

const gens = await prisma.generation.findMany({
  where:
    target === "unchecked"
      ? { status: "done", imageUrl: { not: null }, checkStatus: { not: "ok" } }
      : { id: target },
  include: { brandVersion: { include: { brand: true } } },
  orderBy: { createdAt: "asc" },
});

if (gens.length === 0) console.log("nothing to judge");

for (const g of gens) {
  if (!g.imageUrl) {
    console.log(`${g.id}: no image yet`);
    continue;
  }
  const started = Date.now();
  const result = await judgeImage(g.imageUrl, g.brandVersion, judge, AbortSignal.timeout(60_000));
  const ms = Date.now() - started;

  if (result.status === "ok") {
    const { score, paletteMatch, reasons } = result.verdict;
    const verdict = score >= g.brandVersion.threshold ? "ON-brand" : "OFF-brand";
    console.log(`\n${g.id} ${g.brandVersion.brand.slug} v${g.brandVersion.version} "${g.subject}"`);
    console.log(`  ${judge}: score ${score} (threshold ${g.brandVersion.threshold}) -> ${verdict}, palette ${paletteMatch}, ${ms}ms, tries ${result.attempts}`);
    for (const r of reasons) console.log(`  - ${r}`);
  } else {
    console.log(`\n${g.id}: check_unavailable (${result.reason})`);
  }

  if (save) await saveCheck(g.id, g.brandVersion.threshold, result);
}

if (save) console.log("\nsaved");
await prisma.$disconnect();
