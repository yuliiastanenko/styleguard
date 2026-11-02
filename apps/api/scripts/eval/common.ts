import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EVAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../eval");

export const paths = {
  subjects: resolve(EVAL_DIR, "subjects.json"),
  dataset: resolve(EVAL_DIR, "dataset.json"),
  golden: resolve(EVAL_DIR, "golden.json"),
  label: resolve(EVAL_DIR, "label.html"),
  runs: resolve(EVAL_DIR, "runs"),
  results: resolve(EVAL_DIR, "results"),
};

export type Kind = "on" | "drift" | "foreign";

// the brand rules are copied in, so the dataset stays valid after a brand is edited
export type DatasetItem = {
  id: string;
  brand: string;
  brandVersion: number;
  rules: string;
  palette: string[];
  threshold: number;
  subject: string;
  styleFrom: string;
  kind: Kind;
  prompt: string;
  model: string;
  seed: number | null;
  imageUrl: string;
};

export type GoldenItem = { id: string; label: "on" | "off"; note?: string };

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

// code 4006: the free daily neurons are gone, waiting will not help today
export function isQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /\b4006\b|daily free allocation/i.test(msg);
}

// code 3040 and other 429/5xx are short overloads, worth waiting for
export function isTransientError(e: unknown): boolean {
  if (isQuotaError(e)) return false;
  const status = (e as { status?: unknown })?.status;
  const msg = e instanceof Error ? e.message : String(e);
  if (typeof status === "number" && (status === 429 || status >= 500)) return true;
  return /\b3040\b|capacity temporarily exceeded|\b429\b|\b5\d\d\b|timeout|timed out|ECONNRESET|fetch failed/i.test(msg);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return fallback;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
