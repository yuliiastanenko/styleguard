// npm run eval:label   builds eval/label.html, open it in a browser and label every image
import { paths, readJson, type DatasetItem, type GoldenItem } from "./common.js";
import { writeFileSync } from "node:fs";

const dataset = readJson<DatasetItem[]>(paths.dataset, []);
const golden = readJson<GoldenItem[]>(paths.golden, []);

if (dataset.length === 0) {
  console.error("eval/dataset.json is empty, run npm run eval:build first");
  process.exit(1);
}

// shuffle with a fixed seed so brands and kinds are mixed, and the order is the same every time
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const items = dataset
  .map((d) => ({ id: d.id, brand: d.brand, rules: d.rules, palette: d.palette, imageUrl: d.imageUrl }))
  .map((d) => ({ d, k: rand() }))
  .sort((a, b) => a.k - b.k)
  .map((x) => x.d);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StyleGuard labeling</title>
<style>
  :root { --bg: #f6f6f4; --card: #fff; --ink: #1d1d1b; --muted: #6b6b66; --line: #e3e3de; --on: #1f8a5b; --off: #c2412d; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: var(--bg); color: var(--ink); }
  header { display: flex; align-items: center; gap: 16px; padding: 12px 20px; border-bottom: 1px solid var(--line); background: var(--card); position: sticky; top: 0; }
  header b { font-size: 16px; }
  .bar { flex: 1; height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--ink); width: 0; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 20px; padding: 20px; max-width: 1200px; margin: 0 auto; }
  img { width: 100%; max-height: 78vh; object-fit: contain; background: #ddd; border-radius: 8px; display: block; }
  aside { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px; align-self: start; }
  h2 { margin: 0 0 8px; font-size: 18px; }
  .rules { color: var(--muted); white-space: pre-wrap; }
  .sw { display: flex; gap: 6px; margin: 12px 0 16px; }
  .sw span { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--line); }
  .btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  button { font: inherit; padding: 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); cursor: pointer; }
  button.on { background: var(--on); color: #fff; border-color: var(--on); }
  button.off { background: var(--off); color: #fff; border-color: var(--off); }
  button.sel { outline: 3px solid var(--ink); outline-offset: 2px; }
  .nav { display: flex; gap: 8px; margin-top: 8px; }
  .nav button { flex: 1; padding: 8px; }
  textarea { width: 100%; margin-top: 12px; font: inherit; padding: 8px; border: 1px solid var(--line); border-radius: 8px; min-height: 60px; }
  .hint { color: var(--muted); font-size: 13px; margin-top: 12px; }
  .done { text-align: center; padding: 60px 20px; }
  @media (max-width: 800px) { main { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <b>StyleGuard labeling</b>
  <span id="count"></span>
  <div class="bar"><i id="bar"></i></div>
  <button id="download">Download golden.json</button>
</header>
<main id="app"></main>
<script>
const ITEMS = ${JSON.stringify(items)};
const KEY = "styleguard-golden";
let labels = {};
try { labels = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
${JSON.stringify(golden)}.forEach(g => { if (!labels[g.id]) labels[g.id] = g; });

let i = ITEMS.findIndex(it => !labels[it.id]);
if (i === -1) i = 0;

function save() { try { localStorage.setItem(KEY, JSON.stringify(labels)); } catch {} }

function render() {
  const n = Object.keys(labels).filter(id => ITEMS.some(it => it.id === id)).length;
  document.getElementById("count").textContent = n + " / " + ITEMS.length + " labeled";
  document.getElementById("bar").style.width = (100 * n / ITEMS.length) + "%";
  const it = ITEMS[i];
  const cur = labels[it.id];
  const app = document.getElementById("app");
  app.innerHTML = "";
  const img = document.createElement("img");
  img.src = it.imageUrl;
  img.alt = "image " + (i + 1);
  const aside = document.createElement("aside");
  aside.innerHTML =
    '<h2>' + (i + 1) + '. ' + it.brand + '</h2>' +
    '<div class="rules"></div>' +
    '<div class="sw">' + it.palette.map(c => '<span style="background:' + c + '" title="' + c + '"></span>').join("") + '</div>' +
    '<div class="btns"><button class="on' + (cur && cur.label === "on" ? " sel" : "") + '" id="b-on">On-brand (1)</button>' +
    '<button class="off' + (cur && cur.label === "off" ? " sel" : "") + '" id="b-off">Off-brand (2)</button></div>' +
    '<textarea id="note" placeholder="Note, optional: why"></textarea>' +
    '<div class="nav"><button id="prev">← Back</button><button id="next">Skip →</button></div>' +
    '<div class="hint">Judge only the style against the rules, not image quality or the subject. Keys: 1 on, 2 off, arrows to move.</div>';
  aside.querySelector(".rules").textContent = it.rules;
  aside.querySelector("#note").value = cur && cur.note ? cur.note : "";
  app.append(img, aside);
  document.getElementById("b-on").onclick = () => mark("on");
  document.getElementById("b-off").onclick = () => mark("off");
  document.getElementById("prev").onclick = () => go(-1);
  document.getElementById("next").onclick = () => go(1);
  if (i + 1 < ITEMS.length) new Image().src = ITEMS[i + 1].imageUrl;
}

function mark(label) {
  const it = ITEMS[i];
  const note = document.getElementById("note").value.trim();
  labels[it.id] = note ? { id: it.id, label, note } : { id: it.id, label };
  save();
  const next = ITEMS.findIndex((x, j) => j > i && !labels[x.id]);
  if (next !== -1) { i = next; render(); return; }
  const any = ITEMS.findIndex(x => !labels[x.id]);
  if (any !== -1) { i = any; render(); return; }
  render();
  finished();
}

function go(d) { i = Math.min(ITEMS.length - 1, Math.max(0, i + d)); render(); }

function finished() {
  const box = document.createElement("div");
  box.className = "done";
  box.innerHTML = "<h2>All " + ITEMS.length + " images labeled</h2><p>Download golden.json and put it into the eval folder.</p>";
  document.getElementById("app").prepend(box);
}

function download() {
  const out = ITEMS.filter(it => labels[it.id]).map(it => labels[it.id]).sort((a, b) => a.id.localeCompare(b.id));
  const blob = new Blob([JSON.stringify(out, null, 2) + "\\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "golden.json";
  a.click();
}

document.getElementById("download").onclick = download;
document.addEventListener("keydown", e => {
  if (e.target.tagName === "TEXTAREA") return;
  if (e.key === "1") mark("on");
  else if (e.key === "2") mark("off");
  else if (e.key === "ArrowLeft") go(-1);
  else if (e.key === "ArrowRight") go(1);
});
render();
</script>
</body>
</html>
`;

writeFileSync(paths.label, html);
console.log(`eval/label.html ready with ${items.length} images, ${golden.length} already labeled in golden.json`);
