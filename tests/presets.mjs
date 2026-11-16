// presets.mjs — run every "試試看" button (data-set) to the end and print what the demo would show,
// so the numbers written on a page can be checked. Usage: node tests/presets.mjs [slug]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSite, runPresets } from "./checks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv[2];
const { HFG } = loadSite(ROOT);
const entries = HFG.registry.filter((e) => e.status === "ready" && (!only || e.slug === only));
if (!entries.length) {
  console.log(`✘ registry 裡沒有狀態是 ready 的「${only}」`);
  process.exit(1);
}
let failed = 0;
for (const e of entries) {
  console.log(`#${e.no} ${e.name}（${e.slug}）`);
  try {
    const html = fs.readFileSync(path.join(ROOT, "algorithms", `${e.slug}.html`), "utf8");
    for (const r of runPresets(HFG, html, HFG.algorithms[e.slug])) {
      console.log(`  ${r.raw || "（全部預設）"}`);
      console.log(`      → ${r.display}（跑了 ${r.steps} 步，第 ${r.reachedAt} 步到達最後的最佳）`);
    }
  } catch (err) {
    failed++;
    console.log(`  ✘ ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
