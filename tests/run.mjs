// run.mjs — check the whole site against AGENTS.md. Usage: node tests/run.mjs
// Exit code 0 = everything passes, 1 = something to fix (the messages say what).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSite, checkRegistry, checkFiles, checkAlgorithm, checkPage, checkIndex } from "./checks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
let failed = 0;

function report(title, errors) {
  if (errors.length === 0) { console.log(`  ✔ ${title}`); return; }
  failed += errors.length;
  console.log(`  ✘ ${title}`);
  errors.forEach((e) => console.log(`      - ${e}`));
}

let site;
try {
  site = loadSite(ROOT);
} catch (e) {
  console.log(`✘ 載入網站程式失敗：${e.message}`);
  process.exit(1);
}
const { HFG, sources } = site;
const registry = HFG.registry;

console.log("registry 與檔案");
report("js/registry.js 欄位與編號", checkRegistry(registry));
report("檔案和 registry 一致", checkFiles(ROOT, registry));
report("index.html 沒有手寫卡片", checkIndex(read("index.html")));

for (const entry of registry.filter((e) => e.status === "ready")) {
  console.log(`#${entry.no} ${entry.name}（${entry.slug}）`);
  const algo = HFG.algorithms[entry.slug];
  report("演算法程式（介面、預設參數跑得動、會變好、種子可重現）", checkAlgorithm(HFG, algo, entry, sources[entry.slug] || ""));
  const rel = `algorithms/${entry.slug}.html`;
  if (fs.existsSync(path.join(ROOT, rel))) report("頁面區塊與內容", checkPage(read(rel), entry, { HFG, registry, algo }));
}

const planned = registry.filter((e) => e.status === "planned");
if (planned.length) console.log(`預告中（不檢查）：${planned.map((e) => `#${e.no} ${e.name}`).join("、")}`);
console.log(failed ? `\n✘ 有 ${failed} 個問題要修` : "\n✔ 全部通過");
process.exit(failed ? 1 : 0);
