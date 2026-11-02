export type DriftStatus = "ok" | "drifting";

export type DriftDecision = { next: DriftStatus; changed: boolean };

// drift starts when the rolling mean falls under the threshold and only ends a margin above it,
// so a mean sitting right at the line does not flip back and forth on every image
export function decide(
  current: DriftStatus,
  mean: number | null,
  samples: number,
  threshold: number,
  minSamples: number,
  recoveryMargin: number,
): DriftDecision {
  if (mean === null || samples < minSamples) return { next: current, changed: false };

  if (current === "ok" && mean < threshold) return { next: "drifting", changed: true };
  if (current === "drifting" && mean >= threshold + recoveryMargin) return { next: "ok", changed: true };
  return { next: current, changed: false };
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

// trailing mean for each point, oldest first
export function rollingMeans(scores: number[], window: number): number[] {
  return scores.map((_, i) => mean(scores.slice(Math.max(0, i - window + 1), i + 1))!);
}
