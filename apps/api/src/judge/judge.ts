import OpenAI from "openai";
import { z } from "zod";
import type { BrandVersion } from "@prisma/client";
import { ProviderError } from "../lib/errors.js";
import { JUDGES, backendFor, type JudgeId } from "./judges.js";
import { JUDGE_PROMPT_VERSION, RETRY_NUDGE, SYSTEM_PROMPT, userPrompt } from "./prompt.js";

export const Verdict = z.object({
  score: z.coerce.number().min(0).max(10),
  paletteMatch: z.coerce.number().min(0).max(1),
  reasons: z.array(z.string().trim().min(3).max(300)).min(1).max(6),
});

export type Verdict = z.infer<typeof Verdict>;

export type JudgeResult =
  | { status: "ok"; verdict: Verdict; judgeModel: JudgeId; judgePromptVersion: string; attempts: number }
  | { status: "check_unavailable"; reason: string; judgeModel: JudgeId; judgePromptVersion: string; attempts: number };

const clients = new Map<JudgeId, OpenAI>();

function clientFor(id: JudgeId) {
  let client = clients.get(id);
  if (!client) {
    // retries are handled by the job queue, not here
    client = new OpenAI({ ...backendFor(JUDGES[id]), maxRetries: 0 });
    clients.set(id, client);
  }
  return client;
}

type Sharp = typeof import("sharp").default;
let sharpLib: Promise<Sharp | null> | null = null;

// sharp is a native module, if it fails to load on some host we send the image as is
function loadSharp() {
  sharpLib ??= import("sharp").then(
    (m) => m.default,
    (e) => {
      console.warn("sharp unavailable, images go to the judge unresized:", (e as Error).message);
      return null;
    },
  );
  return sharpLib;
}

// small jpeg keeps the request light and the token bill low
async function loadImage(imageUrl: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(imageUrl, { signal });
  if (!res.ok) throw new ProviderError(`could not load image for judge: ${res.status}`, res.status);
  const original = Buffer.from(await res.arrayBuffer());

  const sharp = await loadSharp();
  if (!sharp) {
    const mime = res.headers.get("content-type") ?? "image/png";
    return `data:${mime};base64,${original.toString("base64")}`;
  }

  const jpeg = await sharp(original)
    .resize(768, 768, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

// every balanced {...} block in the text, so json after a thinking section or with braces in prose is still found
function jsonCandidates(text: string): string[] {
  const out: string[] = [];
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === "\\") i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        out.push(text.slice(start, i + 1));
        break;
      }
    }
  }
  return out;
}

// thinking models put their reasoning before the answer
function stripThinking(text: string): string {
  const afterChannel = text.lastIndexOf("<channel|>");
  if (afterChannel !== -1) text = text.slice(afterChannel + "<channel|>".length);
  return text.replace(/<think>[\s\S]*?<\/think>/g, "");
}

export function parseVerdict(text: string): { ok: true; verdict: Verdict } | { ok: false; error: string } {
  const candidates = jsonCandidates(stripThinking(text));
  if (candidates.length === 0) return { ok: false, error: "no json object in reply" };

  let lastError = "reply is not valid json";
  for (const c of candidates.reverse()) {
    let raw: unknown;
    try {
      raw = JSON.parse(c);
    } catch {
      continue;
    }
    const parsed = Verdict.safeParse(raw);
    if (parsed.success) return { ok: true, verdict: parsed.data };
    const issue = parsed.error.issues[0];
    lastError = `bad shape: ${issue.path.join(".") || "root"} ${issue.message}`;
  }
  return { ok: false, error: lastError };
}

function replyText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === "string" ? p : (p as { text?: string })?.text ?? "")).join("");
  }
  return "";
}

export async function judgeImage(
  imageUrl: string,
  brand: Pick<BrandVersion, "rules" | "palette">,
  judgeId: JudgeId,
  signal?: AbortSignal,
): Promise<JudgeResult> {
  const cfg = JUDGES[judgeId];
  const client = clientFor(judgeId);
  const image = await loadImage(imageUrl, signal);
  const base = { judgeModel: judgeId, judgePromptVersion: JUDGE_PROMPT_VERSION };

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: userPrompt(brand) },
        { type: "image_url", image_url: { url: image } },
      ],
    },
  ];

  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await client.chat.completions.create(
      {
        model: cfg.model,
        messages,
        temperature: 0,
        max_tokens: cfg.maxTokens,
        ...(cfg.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      },
      { signal },
    );

    const choice = res.choices[0];
    const text = replyText(choice?.message?.content);
    const parsed = parseVerdict(text);
    if (parsed.ok) return { status: "ok", verdict: parsed.verdict, attempts: attempt, ...base };

    const snippet = text.replace(/\s+/g, " ").slice(0, 160);
    lastError = `${parsed.error} (finish: ${choice?.finish_reason ?? "?"}, reply: "${snippet}")`;
    messages.push({ role: "assistant", content: text || "(empty)" }, { role: "user", content: RETRY_NUDGE });
  }

  return { status: "check_unavailable", reason: `judge reply invalid twice: ${lastError}`, attempts: 2, ...base };
}
