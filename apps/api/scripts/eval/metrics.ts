import type { DatasetItem } from "./common.js";

export type RunRecord =
  | { id: string; run: number; status: "ok"; score: number; paletteMatch: number; reasons: string[]; ms: number }
  | { id: string; run: number; status: "check_unavailable"; reason: string; ms: number };

export type Metrics = {
  name: string;
  judge: string;
  model: string;
  promptVersion: string;
  updatedAt: string;
  complete: boolean;
  scored: number;
  expected: number;
  unavailable: number;
  agreement: number | null;
  precisionOff: number | null;
  recallOff: number | null;
  f1Off: number | null;
  auc: number | null;
  meanScoreOn: number | null;
  meanScoreOff: number | null;
  confusion: { tp: number; fp: number; fn: number; tn: number };
  repeatItems: number;
  meanStd: number | null;
  maxRange: number | null;
  verdictFlips: number;
  avgMs: number | null;
  byBrand: Record<string, { n: number; agreement: number | null }>;
  disagreements: { id: string; label: "on" | "off"; score: number; threshold: number }[];
};

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

// off-brand is the positive class: catching drift is the job
export function computeMetrics(
  name: string,
  judge: string,
  model: string,
  promptVersion: string,
  items: DatasetItem[],
  labels: Map<string, "on" | "off">,
  runs: RunRecord[],
  repeats: number,
  subsetSize: number,
): Metrics {
  const byItem = new Map(items.map((d) => [d.id, d]));
  const first = new Map<string, RunRecord>();
  for (const r of runs) if (r.run === 0 && byItem.has(r.id)) first.set(r.id, r);

  const c = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const brand: Record<string, { n: number; hit: number }> = {};
  const scoresOn: number[] = [];
  const scoresOff: number[] = [];
  const disagreements: Metrics["disagreements"] = [];
  let unavailable = 0;

  for (const [id, r] of first) {
    if (r.status !== "ok") {
      unavailable++;
      continue;
    }
    const item = byItem.get(id)!;
    const label = labels.get(id)!;
    const predOff = r.score < item.threshold;
    const isOff = label === "off";
    if (predOff && isOff) c.tp++;
    else if (predOff && !isOff) c.fp++;
    else if (!predOff && isOff) c.fn++;
    else c.tn++;

    (isOff ? scoresOff : scoresOn).push(r.score);
    brand[item.brand] ??= { n: 0, hit: 0 };
    brand[item.brand].n++;
    if (predOff === isOff) brand[item.brand].hit++;
    else disagreements.push({ id, label, score: r.score, threshold: item.threshold });
  }

  const scored = c.tp + c.fp + c.fn + c.tn;
  const precision = ratio(c.tp, c.tp + c.fp);
  const recall = ratio(c.tp, c.tp + c.fn);

  // chance that a random off-brand image scores lower than a random on-brand one, threshold free
  let auc: number | null = null;
  if (scoresOn.length && scoresOff.length) {
    let wins = 0;
    for (const off of scoresOff) for (const on of scoresOn) wins += off < on ? 1 : off === on ? 0.5 : 0;
    auc = wins / (scoresOn.length * scoresOff.length);
  }

  const repeated = new Map<string, number[]>();
  for (const r of runs) {
    if (r.status !== "ok" || !byItem.has(r.id)) continue;
    const list = repeated.get(r.id) ?? [];
    list.push(r.score);
    repeated.set(r.id, list);
  }
  const stds: number[] = [];
  let maxRange: number | null = null;
  let flips = 0;
  let repeatItems = 0;
  for (const [id, scores] of repeated) {
    if (scores.length < 2) continue;
    repeatItems++;
    const m = mean(scores)!;
    stds.push(Math.sqrt(mean(scores.map((s) => (s - m) ** 2))!));
    const range = Math.max(...scores) - Math.min(...scores);
    maxRange = Math.max(maxRange ?? 0, range);
    const t = byItem.get(id)!.threshold;
    if (new Set(scores.map((s) => s < t)).size > 1) flips++;
  }

  const expected = items.length + Math.max(0, repeats - 1) * subsetSize;
  const relevant = runs.filter((r) => byItem.has(r.id));

  return {
    name,
    judge,
    model,
    promptVersion,
    updatedAt: new Date().toISOString(),
    complete: relevant.length >= expected,
    scored,
    expected,
    unavailable,
    agreement: ratio(c.tp + c.tn, scored),
    precisionOff: precision,
    recallOff: recall,
    f1Off: precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null,
    auc,
    meanScoreOn: mean(scoresOn),
    meanScoreOff: mean(scoresOff),
    confusion: c,
    repeatItems,
    meanStd: mean(stds),
    maxRange,
    verdictFlips: flips,
    avgMs: mean(relevant.map((r) => r.ms)),
    byBrand: Object.fromEntries(Object.entries(brand).map(([b, v]) => [b, { n: v.n, agreement: ratio(v.hit, v.n) }])),
    disagreements: disagreements.sort((a, b) => Math.abs(b.score - b.threshold) - Math.abs(a.score - a.threshold)),
  };
}

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const num = (x: number | null, d = 2) => (x === null ? "–" : x.toFixed(d));

export function renderSummary(all: Metrics[], datasetSize: number, fresh: Set<string> = new Set()): string {
  const rows = [...all]
    .sort((a, b) => (b.agreement ?? 0) - (a.agreement ?? 0))
    .map(
      (m) =>
        `| ${fresh.has(m.name) ? "**" + m.judge + "** (this run)" : m.judge} | ${m.promptVersion} | ${m.scored}/${datasetSize}${m.complete ? "" : " (partial)"} | ${pct(m.agreement)} | ${pct(m.precisionOff)} | ${pct(m.recallOff)} | ${num(m.auc)} | ${num(m.meanScoreOn, 1)} / ${num(m.meanScoreOff, 1)} | ${num(m.meanStd)} | ${m.verdictFlips}/${m.repeatItems} | ${m.unavailable} | ${m.avgMs === null ? "–" : (m.avgMs / 1000).toFixed(1) + " s"} |`,
    );

  return `## Judge eval

| Judge | Prompt | Scored | Agreement | Precision (off) | Recall (off) | AUC | Mean score on / off | Score σ | Verdict flips | Unavailable | Avg latency |
|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

- **Agreement**: share of images where the judge's on/off call (score vs brand threshold) matches the human label.
- **Precision / recall (off)**: off-brand is the class we want to catch. Precision: when the judge says off-brand, how often it is right. Recall: how many real off-brand images it catches.
- **AUC**: chance that a random off-brand image gets a lower score than a random on-brand one. Ignores thresholds, 0.5 is a coin flip.
- **Score σ / verdict flips**: the same image judged several times. σ is the average standard deviation of the score, flips counts images whose on/off verdict changed between runs.
`;
}
