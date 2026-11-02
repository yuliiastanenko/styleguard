// npm run eval                                   judge from JUDGE_MODEL, 5 repeats on 10 images
// npm run eval -- --judge cf-llama4-scout,cf-gemma4
// npm run eval -- --repeats 1                     single pass, cheapest
// npm run eval -- --min-agreement 0.7             exit 1 below that, used in ci
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { judgeImage } from "../../src/judge/judge.js";
import { JUDGES, isJudgeId, type JudgeId } from "../../src/judge/judges.js";
import { JUDGE_PROMPT_VERSION } from "../../src/judge/prompt.js";
import { env } from "../../src/env.js";
import { errorMessage } from "../../src/lib/errors.js";
import { arg, isQuotaError, isTransientError, sleep, paths, readJson, writeJson, type DatasetItem, type GoldenItem } from "./common.js";
import { computeMetrics, renderSummary, type Metrics, type RunRecord } from "./metrics.js";

const judgeIds = (arg("judge", env.JUDGE_MODEL) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const repeats = Number(arg("repeats", "5"));
const subsetSize = Number(arg("repeat-subset", "10"));
const concurrency = Number(arg("concurrency", "2"));
const minAgreement = arg("min-agreement") ? Number(arg("min-agreement")) : null;

for (const id of judgeIds) {
  if (!isJudgeId(id)) {
    console.error(`unknown judge ${id}, use one of: ${Object.keys(JUDGES).join(", ")}`);
    process.exit(1);
  }
}

const dataset = readJson<DatasetItem[]>(paths.dataset, []);
const golden = readJson<GoldenItem[]>(paths.golden, []);
const labels = new Map(golden.map((g) => [g.id, g.label]));
const items = dataset.filter((d) => labels.has(d.id));

if (items.length === 0) {
  console.error("no labeled images. run eval:build, eval:label and put golden.json into the eval folder");
  process.exit(1);
}

// any edit to the judge code or prompt gives a new hash, so old cached runs are never reused by mistake
const srcDir = resolve(paths.runs, "../../apps/api/src/judge");
const judgeSource = ["prompt.ts", "judge.ts"].map((f) => readFileSync(resolve(srcDir, f), "utf8")).join("\n");

function runName(judge: JudgeId) {
  const hash = createHash("sha256").update(judgeSource).update(JUDGES[judge].model).digest("hex").slice(0, 8);
  return `${judge}__${JUDGE_PROMPT_VERSION}__${hash}`;
}

function readRuns(file: string): RunRecord[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RunRecord);
}

// repeats go to a fixed, balanced subset so the spread numbers are comparable between judges
function repeatSubset(): Set<string> {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const on = sorted.filter((d) => labels.get(d.id) === "on");
  const off = sorted.filter((d) => labels.get(d.id) === "off");
  const pick = (list: DatasetItem[], n: number) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n);
  const half = Math.ceil(subsetSize / 2);
  return new Set([...pick(on, half), ...pick(off, subsetSize - half)].map((d) => d.id));
}

async function pool<T>(tasks: T[], n: number, fn: (t: T) => Promise<boolean>) {
  let next = 0;
  let stop = false;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (!stop && next < tasks.length) {
        const t = tasks[next++];
        if (!(await fn(t))) stop = true;
      }
    }),
  );
  return stop;
}

mkdirSync(paths.runs, { recursive: true });
const subset = repeatSubset();
const results: { name: string; metrics: Metrics }[] = [];
let quotaHit = false;

for (const judge of judgeIds as JudgeId[]) {
  const name = runName(judge);
  const file = resolve(paths.runs, `${name}.jsonl`);
  const have = new Set(readRuns(file).map((r) => `${r.id}#${r.run}`));

  const tasks: { item: DatasetItem; run: number }[] = [];
  for (let run = 0; run < repeats; run++) {
    for (const item of items) {
      if (run > 0 && !subset.has(item.id)) continue;
      if (!have.has(`${item.id}#${run}`)) tasks.push({ item, run });
    }
  }

  console.log(`\n${judge}: ${have.size} cached, ${tasks.length} to run`);

  if (!quotaHit && tasks.length > 0) {
    let n = 0;
    quotaHit = await pool(tasks, concurrency, async ({ item, run }) => {
      let started = Date.now();
      try {
        let r;
        for (let tries = 1; ; tries++) {
          started = Date.now();
          try {
            r = await judgeImage(item.imageUrl, item, judge, AbortSignal.timeout(120_000));
            break;
          } catch (e) {
            if (!isTransientError(e) || tries >= 5) throw e;
            const wait = 5_000 * 2 ** (tries - 1);
            console.log(`  ${item.id}: cloudflare busy, retry in ${wait / 1000}s`);
            await sleep(wait);
          }
        }
        const rec: RunRecord =
          r.status === "ok"
            ? { id: item.id, run, status: "ok", score: r.verdict.score, paletteMatch: r.verdict.paletteMatch, reasons: r.verdict.reasons, ms: Date.now() - started }
            : { id: item.id, run, status: "check_unavailable", reason: r.reason, ms: Date.now() - started };
        appendFileSync(file, JSON.stringify(rec) + "\n");
        n++;
        if (n % 10 === 0) console.log(`  ${n}/${tasks.length}`);
        return true;
      } catch (e) {
        if (isQuotaError(e)) {
          if (!quotaHit) {
            console.log(`  daily limit reached after ${n} calls, run the same command tomorrow to continue`);
            console.log(`  cloudflare said: ${errorMessage(e).slice(0, 300)}`);
          }
          quotaHit = true;
          return false;
        }
        console.error(`  ${item.id} run ${run} failed: ${errorMessage(e)}`);
        return true;
      }
    });
  }

  const metrics = computeMetrics(name, judge, JUDGES[judge].model, JUDGE_PROMPT_VERSION, items, labels, readRuns(file), repeats, subset.size);
  // an older hash for the same judge and prompt version is outdated code, keep only the current one
  mkdirSync(paths.results, { recursive: true });
  for (const f of readdirSync(paths.results)) {
    if (f.startsWith(`${judge}__${JUDGE_PROMPT_VERSION}__`) && f !== `${name}.json`) rmSync(resolve(paths.results, f));
  }
  writeJson(resolve(paths.results, `${name}.json`), metrics);
  results.push({ name, metrics });
}

// summary covers every result file, so the table compares all judges and prompt versions tried so far
const all = readdirSync(paths.results)
  .filter((f) => f.endsWith(".json"))
  .map((f) => readJson<Metrics>(resolve(paths.results, f), null as unknown as Metrics))
  .filter(Boolean);
const summary = renderSummary(all, items.length, new Set(results.map((r) => r.name)));
writeFileSync(resolve(paths.results, "summary.md"), summary);

console.log("\n" + summary);
for (const { metrics } of results) {
  if (metrics.disagreements.length) {
    console.log(`\n${metrics.judge} disagrees with you on:`);
    for (const d of metrics.disagreements.slice(0, 8)) {
      console.log(`  ${d.id}: you ${d.label}, judge ${d.score} vs threshold ${d.threshold}`);
    }
  }
}

if (minAgreement !== null) {
  const failing = results.filter((r) => r.metrics.complete && (r.metrics.agreement ?? 0) < minAgreement);
  if (failing.length) {
    console.error(`\nagreement below ${minAgreement}: ${failing.map((f) => f.metrics.judge).join(", ")}`);
    process.exit(1);
  }
}
