// stats.mjs — the "成績單" sentence under each demo: run an algorithm with default params on the default map
// of each kind it supports, seeds 1..SEEDS, and count how often it reaches the true answer.
// The true answers are computed here, outside the algorithm: the terrain's highest peak is 1.000 by
// construction, and the shortest TSP tour is found exactly with Held-Karp dynamic programming.
// Every run goes through guarded(), so an algorithm that reads a drawing-only field stops the script
// and the page's "演算法看不到" sentence is checked each time the score card is written.
// Usage: node tests/stats.mjs [slug] [--write]   (--write puts the block into algorithms/<slug>.html)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSite } from "./checks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEEDS = 100;
const GOAL = 0.95;          // same as GOAL in js/demo.js: a best height this high is on the highest peak
const EPS = 1e-6;           // a tour this close to the shortest length counts as the shortest

// Fields the problem object carries only for drawing (see js/problems/*.js). Algorithms must not read them.
export const HIDDEN = { terrain: ["peak"], tsp: ["cities"] };

export function guarded(problem, kind, slug) {
  return new Proxy(problem, {
    get(target, key) {
      if (HIDDEN[kind].includes(key)) throw new Error(`${slug} 讀了 problem.${key}（只給畫圖用，演算法不能讀）`);
      const v = target[key];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

// Shortest closed tour through cities 0..n-1, starting and ending at city 0.
function heldKarp(n, dist) {
  const full = 1 << (n - 1), dp = new Float64Array(full * n).fill(Infinity);
  for (let j = 1; j < n; j++) dp[(1 << (j - 1)) * n + j] = dist(0, j);
  for (let m = 1; m < full; m++) {
    for (let j = 1; j < n; j++) {
      const v = dp[m * n + j];
      if (v === Infinity) continue;
      for (let k = 1; k < n; k++) {
        const bit = 1 << (k - 1);
        if (m & bit) continue;
        const idx = (m | bit) * n + k, w = v + dist(j, k);
        if (w < dp[idx]) dp[idx] = w;
      }
    }
  }
  let best = Infinity;
  for (let j = 1; j < n; j++) best = Math.min(best, dp[(full - 1) * n + j] + dist(j, 0));
  return best;
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const only = args.find((a) => !a.startsWith("--"));
  const { HFG } = loadSite(ROOT);
  const entries = HFG.registry.filter((e) => e.status === "ready" && (!only || e.slug === only));
  if (!entries.length) {
    console.log(`✘ registry 裡沒有狀態是 ready 的「${only}」`);
    process.exit(1);
  }

  const shortest = {};
  for (const m of HFG.problems.tsp.maps) {
    const p = HFG.problems.tsp.create(m.id);
    shortest[m.id] = heldKarp(p.n, p.dist);
  }

  // One map: how many seeds reach the answer, the average result, and whether seed 1 is one of them.
  function runMap(slug, kind, map) {
    const algo = HFG.algorithms[slug], params = HFG.defaultParams(algo, kind);
    const results = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const problem = HFG.problems[kind].create(map.id);
      const { state } = HFG.run(algo, guarded(problem, kind, slug), params, seed, algo.maxSteps[kind]);
      results.push(problem.score(state.best));
    }
    const avg = results.reduce((a, b) => a + b, 0) / SEEDS;
    if (kind === "terrain") {
      const ok = results.map((s) => s >= GOAL), n = ok.filter(Boolean).length;
      return { ok: n, seed1: ok[0], text: `${map.name} <b>${n}</b> 次爬上最高峰` };
    }
    const best = shortest[map.id], ok = results.map((s) => -s <= best + EPS), n = ok.filter(Boolean).length;
    const gap = ((-avg / best - 1) * 100).toFixed(1);
    return { ok: n, seed1: ok[0], text: `${map.name} <b>${n}</b> 次找到最短路線（平均只多 ${gap}%）` };
  }

  // One sentence on the default map of each kind the algorithm supports (the map the demo opens with).
  function block(slug) {
    const algo = HFG.algorithms[slug];
    const rows = algo.supports.map((kind) => runMap(slug, kind, HFG.problems[kind].maps[0]));
    const first = rows[0];
    const seed1 = first.seed1 && first.ok < SEEDS ? "；畫面一開始的種子 1 剛好是成功的那幾次之一" : "";
    return `<p class="demo-scorecard">種子 1～${SEEDS} 各跑一次：${rows.map((r) => r.text).join("，")}${seed1}。</p>`;
  }

  let failed = 0;
  for (const e of entries) {
    let html;
    try {
      html = block(e.slug);
    } catch (err) {
      failed++;
      console.log(`✘ #${e.no} ${e.name}：${err.message}`);
      continue;
    }
    if (!write) {
      console.log(`#${e.no} ${e.name}（${e.slug}）\n      ${html}\n`);
      continue;
    }
    const file = path.join(ROOT, "algorithms", `${e.slug}.html`);
    const page = fs.readFileSync(file, "utf8");
    const anchor = `<div class="demo" data-algorithm="${e.slug}"></div>`;
    let next;
    const old = /<(div|p) class="demo-scorecard">[\s\S]*?<\/\1>/;   // the <div> is the older, longer score card
    if (old.test(page)) next = page.replace(old, html);
    else if (page.includes(anchor)) next = page.replace(anchor, `${anchor}\n      ${html}`);
    else {
      failed++;
      console.log(`✘ ${e.slug}.html 找不到 ${anchor}`);
      continue;
    }
    fs.writeFileSync(file, next);
    console.log(`✔ 寫進 algorithms/${e.slug}.html`);
  }
  process.exit(failed ? 1 : 0);
}

// Run only as a script; importing this file (to test guarded) does nothing else.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
