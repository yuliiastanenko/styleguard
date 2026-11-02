import { env } from "../env.js";

export type JudgeConfig = {
  label: string;
  model: string;
  backend: "cloudflare" | "openai";
  // only some backends accept response_format, the others get the schema in the prompt only
  jsonMode: boolean;
  // room for the json plus any reasoning the model writes first
  maxTokens: number;
};

export const JUDGES = {
  "cf-llama4-scout": { label: "Llama 4 Scout (Cloudflare)", model: "@cf/meta/llama-4-scout-17b-16e-instruct", backend: "cloudflare", jsonMode: false, maxTokens: 800 },
  "cf-gemma4": { label: "Gemma 4 26B (Cloudflare)", model: "@cf/google/gemma-4-26b-a4b-it", backend: "cloudflare", jsonMode: false, maxTokens: 2000 },
  "openai-gpt-4.1-mini": { label: "GPT-4.1 mini", model: "gpt-4.1-mini", backend: "openai", jsonMode: true, maxTokens: 800 },
} satisfies Record<string, JudgeConfig>;

export type JudgeId = keyof typeof JUDGES;

export const JUDGE_IDS = Object.keys(JUDGES) as [JudgeId, ...JudgeId[]];

export function isJudgeId(value: string): value is JudgeId {
  return value in JUDGES;
}

export function backendFor(cfg: JudgeConfig): { baseURL?: string; apiKey: string } {
  if (cfg.backend === "cloudflare") {
    if (!env.CF_AI_TOKEN) throw new Error("CF_AI_TOKEN is not set");
    return {
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${env.R2_ACCOUNT_ID}/ai/v1`,
      apiKey: env.CF_AI_TOKEN,
    };
  }
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  return { apiKey: env.OPENAI_API_KEY };
}
