import { env } from "../env.js";
import { errorMessage } from "../lib/errors.js";

export type DriftAlert = {
  kind: "drift" | "recovered";
  brandName: string;
  brandSlug: string;
  brandVersion: number;
  modelLabel: string;
  mean: number;
  threshold: number;
  samples: number;
  judge: string;
  judgePromptVersion: string;
  latest?: { subject: string; imageUrl: string | null; score: number | null };
};

export function slackPayload(a: DriftAlert) {
  const title =
    a.kind === "drift"
      ? `:warning: Style drift: ${a.brandName} × ${a.modelLabel}`
      : `:white_check_mark: Back on brand: ${a.brandName} × ${a.modelLabel}`;

  const body =
    a.kind === "drift"
      ? `Average judge score over the last ${a.samples} images is *${a.mean.toFixed(1)}*, below the brand threshold of *${a.threshold}* (v${a.brandVersion}).`
      : `Average judge score over the last ${a.samples} images is back to *${a.mean.toFixed(1)}* (threshold ${a.threshold}, v${a.brandVersion}).`;

  const lines = [body, `Judge: ${a.judge} / prompt ${a.judgePromptVersion}`];
  if (a.latest) {
    const img = a.latest.imageUrl ? `<${a.latest.imageUrl}|${a.latest.subject}>` : a.latest.subject;
    lines.push(`Latest: ${img}${a.latest.score !== null ? ` scored ${a.latest.score}` : ""}`);
  }
  if (env.PUBLIC_APP_URL) lines.push(`<${env.PUBLIC_APP_URL}/history?brand=${a.brandSlug}|Open history>`);

  return {
    text: `${title}\n${body}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${title}*` } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
    ],
  };
}

// a slack outage must never fail a generation, so this only logs
export async function sendSlack(a: DriftAlert): Promise<boolean> {
  const payload = slackPayload(a);
  if (!env.SLACK_WEBHOOK_URL) {
    console.log(`[drift] ${payload.text.replace(/\n/g, " ")} (no SLACK_WEBHOOK_URL, not sent)`);
    return false;
  }
  try {
    const res = await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`slack ${res.status}: ${(await res.text()).slice(0, 200)}`);
    console.log(`[drift] slack sent: ${a.kind} ${a.brandSlug} × ${a.modelLabel}`);
    return true;
  } catch (e) {
    console.error(`[drift] slack failed: ${errorMessage(e)}`);
    return false;
  }
}
