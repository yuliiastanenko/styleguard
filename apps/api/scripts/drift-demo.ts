// pushes a brand into drift on purpose: queues off-brand subjects and waits for the judge
// npm run drift:demo -- --brand nordic --count 6
// npm run drift:demo -- --api https://styleguard-api.onrender.com --brand nordic
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const api = arg("api", "http://localhost:8787").replace(/\/+$/, "");
const brand = arg("brand", "nordic");
const count = Number(arg("count", "6"));
const model = arg("model", "cf-flux-schnell");

const offBrand: Record<string, string[]> = {
  nordic: [
    "a crowded neon nightclub with red and purple lasers",
    "a bright carnival with colorful balloons and flags",
    "a busy street market full of saturated fruit stalls",
    "a graffiti covered wall in vivid rainbow colors",
    "a fireworks show over a city at night",
    "a candy shop with shelves of bright sweets",
  ],
  neon: [
    "a sunny wheat field at noon in soft pastel tones",
    "a beige minimalist living room in morning light",
    "a cozy farmhouse kitchen with wooden table",
    "a calm misty lake at dawn",
    "a pastel bakery with macarons",
    "a white ceramic vase on a linen table",
  ],
  terra: [
    "a neon cyberpunk street at night",
    "blue ice cream in a supermarket freezer",
    "a glossy plastic fast food tray with soda",
    "a white sterile laboratory with glass tubes",
    "a cold blue winter landscape",
    "chrome kitchen appliances on a white background",
  ],
};
const subjects = offBrand[brand] ?? offBrand.nordic;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${api}${path}`, { ...init, signal: AbortSignal.timeout(90_000) });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
}

console.log(`queueing ${count} off-brand images for ${brand} on ${api}`);
const ids: string[] = [];
for (let i = 0; i < count; i++) {
  const g = await call("/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brand, model, subject: subjects[i % subjects.length] }),
  });
  ids.push(g.id);
}

const pending = new Set(ids);
const started = Date.now();
while (pending.size && Date.now() - started < 10 * 60_000) {
  await sleep(5_000);
  for (const id of [...pending]) {
    const g = await call(`/generations/${id}`);
    if (g.status === "done" || g.status === "failed") {
      pending.delete(id);
      console.log(`  ${g.subject}: ${g.status}, score ${g.score ?? "-"}, ${g.onBrand === false ? "OFF-brand" : g.onBrand ? "on-brand" : g.checkStatus}`);
    }
  }
}

const d = await call(`/drift?brand=${brand}&model=${model}`);
for (const s of d.series) {
  console.log(`\n${s.brand.name} × ${s.modelLabel}: rolling mean ${s.currentMean?.toFixed(1)} vs threshold ${s.threshold}, status ${s.status.toUpperCase()}`);
}
