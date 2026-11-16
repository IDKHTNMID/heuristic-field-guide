// checks.mjs — the rules in AGENTS.md, written as code. Each check returns a list of error
// messages (Traditional Chinese, so the person reading the output can act on it). [] = pass.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

export const SECTIONS = ["analogy", "demo", "params", "try", "fit", "related", "refs"];
// Upper limits on reading text, counted in characters after removing tags and whitespace
// (punctuation and English names count). The pages should show, not tell.
export const TEXT_LIMITS = { analogy: 80, paramsNote: 80, tryText: 80, fitItem: 28, relatedItem: 50 };
const FAMILIES = ["single", "evolution", "swarm"];
const PROBLEMS = ["terrain", "tsp"];
const TRACKS = ["basic", "extended"];
const STATUSES = ["ready", "planned"];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LINE_MAX = 30;
const SEEDS = [1, 2, 3];
const EPS = 1e-9;

// ---------- loading the site into a sandbox (no browser needed) ----------

export function loadSite(root, { algorithms } = {}) {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  const run = (rel) => {
    const code = fs.readFileSync(path.join(root, rel), "utf8");
    vm.runInContext(code, ctx, { filename: rel });
    return code;
  };
  run("js/core.js");
  run("js/registry.js");
  for (const f of fs.readdirSync(path.join(root, "js/problems")).filter((f) => f.endsWith(".js")).sort()) {
    run("js/problems/" + f);
  }
  const HFG = ctx.HFG;
  const slugs = algorithms ?? (HFG.registry || []).filter((e) => e.status === "ready").map((e) => e.slug);
  const sources = {};
  for (const slug of slugs) {
    const rel = `js/algorithms/${slug}.js`;
    if (fs.existsSync(path.join(root, rel))) sources[slug] = run(rel);
  }
  return { HFG, sources };
}

// ---------- registry ----------

export function checkRegistry(list) {
  const errors = [];
  if (!Array.isArray(list) || list.length === 0) return ["registry 是空的或不是陣列（HFG.registry）"];
  const seen = new Set();
  list.forEach((e, i) => {
    const label = `#${e.no ?? "?"} ${e.slug ?? "?"}`;
    const expected = String(i + 1).padStart(2, "0");
    if (typeof e.no !== "string" || !/^\d{2}$/.test(e.no)) errors.push(`${label}：編號 no 要是兩位數字字串，例："0${i + 1}"`);
    else if (e.no !== expected) errors.push(`${label}：編號要從 01 開始連續、不重複，這一筆應該是 ${expected}`);
    if (typeof e.slug !== "string" || !SLUG.test(e.slug)) errors.push(`${label}：slug 只能用英文小寫、數字和連字號`);
    else if (seen.has(e.slug)) errors.push(`${label}：slug 重複了`);
    seen.add(e.slug);
    for (const k of ["name", "en", "line"]) {
      if (typeof e[k] !== "string" || !e[k].trim()) errors.push(`${label}：${k} 不能是空的`);
    }
    if (typeof e.line === "string" && [...e.line].length > LINE_MAX) errors.push(`${label}：line 超過 ${LINE_MAX} 字`);
    if (!FAMILIES.includes(e.family)) errors.push(`${label}：family 只能是 ${FAMILIES.join(" / ")}`);
    if (!Array.isArray(e.supports) || e.supports.length === 0 || e.supports.some((p) => !PROBLEMS.includes(p))) {
      errors.push(`${label}：supports 要是非空陣列，只能有 ${PROBLEMS.join(" / ")}`);
    }
    if (!TRACKS.includes(e.track)) errors.push(`${label}：track 只能是 ${TRACKS.join(" / ")}`);
    if (!STATUSES.includes(e.status)) errors.push(`${label}：status 只能是 ${STATUSES.join(" / ")}`);
  });
  return errors;
}

// ---------- files ----------

export function checkFiles(root, list) {
  const errors = [];
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  const known = new Set(list.map((e) => e.slug));
  for (const e of list) {
    const js = `js/algorithms/${e.slug}.js`, html = `algorithms/${e.slug}.html`;
    if (e.status === "ready") {
      if (!exists(js)) errors.push(`#${e.no} ${e.slug}：找不到 ${js}`);
      if (!exists(html)) errors.push(`#${e.no} ${e.slug}：找不到 ${html}`);
    } else if (exists(html)) {
      errors.push(`#${e.no} ${e.slug}：已經有 ${html}，但 status 還是 planned，要改成 ready`);
    }
  }
  const listDir = (rel, ext) => (exists(rel) ? fs.readdirSync(path.join(root, rel)).filter((f) => f.endsWith(ext)) : []);
  for (const f of listDir("js/algorithms", ".js")) {
    if (!known.has(f.slice(0, -3))) errors.push(`js/algorithms/${f} 沒有登記在 registry.js`);
  }
  for (const f of listDir("algorithms", ".html")) {
    if (!known.has(f.slice(0, -5))) errors.push(`algorithms/${f} 沒有登記在 registry.js`);
  }
  return errors;
}

// ---------- algorithm contract ----------

function stateError(state, problem) {
  if (!state || typeof state !== "object") return "state 不是物件";
  if (state.best === undefined || state.best === null) return "state 缺少或型別錯誤：best";
  if (typeof state.bestScore !== "number" || !Number.isFinite(state.bestScore)) return "state 缺少或型別錯誤：bestScore";
  if (!Array.isArray(state.points)) return "state 缺少或型別錯誤：points（要是陣列）";
  if (typeof state.note !== "string") return "state 缺少或型別錯誤：note（要是字串）";
  if (typeof state.done !== "boolean") return "state 缺少或型別錯誤：done（要是 true/false）";
  if (Math.abs(state.bestScore - problem.score(state.best)) > EPS) return "bestScore 和 problem.score(best) 不一致";
  return null;
}

// Runs one algorithm with default parameters. With traced = true it records which pseudocode lines
// the algorithm reports through t(line, say, mark); otherwise it passes HFG.noTrace.
function runOnce(HFG, algo, kind, mapId, seed, traced = true) {
  const problem = HFG.problems[kind].create(mapId);
  const params = HFG.defaultParams(algo, kind);
  const rng = HFG.rng(seed);
  const lines = new Set();
  let count = 0, badLine = null;
  const n = algo.pseudo.length;
  const t = traced ? (line) => {
    count++;
    if (!Number.isInteger(line) || line < 1 || line > n) badLine = badLine ?? line;
    else lines.add(line);
  } : HFG.noTrace;
  const state = algo.init(problem, params, rng, t);
  let err = stateError(state, problem);
  if (err) return { error: "init 之後 " + err };
  const history = [state.bestScore];
  for (let k = 0; k < algo.maxSteps[kind] && !state.done; k++) {
    const before = count;
    algo.step(state, problem, params, rng, t);
    if (badLine !== null) return { error: `t() 回報了第 ${badLine} 行，但 pseudo 只有 ${n} 行` };
    if (traced && count === before) return { error: `第 ${k + 1} 步沒有呼叫 t() 回報執行到哪一行` };
    err = stateError(state, problem);
    if (err) return { error: `第 ${k + 1} 步之後 ${err}` };
    if (state.bestScore < history[history.length - 1] - EPS) return { error: `第 ${k + 1} 步 bestScore 變小了（只能變大或不變）` };
    history.push(state.bestScore);
  }
  if (badLine !== null) return { error: `t() 回報了第 ${badLine} 行，但 pseudo 只有 ${n} 行` };
  return { history, lines };
}

export function checkAlgorithm(HFG, algo, entry, source) {
  const errors = [];
  const label = `#${entry.no} ${entry.slug}`;
  if (!algo) return [`${label}：js/algorithms/${entry.slug}.js 沒有呼叫 HFG.registerAlgorithm（或 slug 打錯）`];
  if (algo.slug !== entry.slug) errors.push(`${label}：程式裡的 slug 是 ${algo.slug}`);
  const a = [...(algo.supports || [])].sort().join(","), b = [...entry.supports].sort().join(",");
  if (a !== b) errors.push(`${label}：程式的 supports（${a}）和 registry（${b}）不一樣`);
  if (/Math\.random/.test(source)) errors.push(`${label}：不能用 Math.random()，要用傳進來的 rng()`);
  if (typeof algo.init !== "function" || typeof algo.step !== "function") errors.push(`${label}：要有 init() 和 step()`);
  if (!Array.isArray(algo.pseudo) || !algo.pseudo.length || !algo.pseudo.every((l) => typeof l === "string" && l.trim())) {
    errors.push(`${label}：要有 pseudo（虛擬碼，每一行一個字串）`);
  }
  for (const kind of algo.supports || []) {
    const max = algo.maxSteps && algo.maxSteps[kind];
    if (!Number.isInteger(max) || max <= 0) errors.push(`${label}：maxSteps.${kind} 要是正整數`);
    const ps = algo.params && algo.params[kind];
    if (!Array.isArray(ps)) { errors.push(`${label}：params.${kind} 要是陣列（沒有參數就寫 []）`); continue; }
    for (const p of ps) {
      const nums = ["min", "max", "step", "value"].every((k) => typeof p[k] === "number");
      if (typeof p.key !== "string" || typeof p.label !== "string" || !nums) errors.push(`${label}：參數 ${p.key} 要有 key、label、min、max、step、value`);
      else if (p.value < p.min || p.value > p.max || p.min >= p.max || p.step <= 0) errors.push(`${label}：參數 ${p.key}（${kind}）的預設值或範圍不對`);
    }
  }
  if (errors.length) return errors;

  const hit = new Set();
  let clean = true;
  for (const kind of algo.supports) {
    for (const map of HFG.problems[kind].maps) {
      for (const seed of SEEDS) {
        const where = `${label}［${kind}／${map.name}／seed=${seed}］`;
        try {
          const r = runOnce(HFG, algo, kind, map.id, seed);
          if (r.error) { errors.push(`${where}：${r.error}`); clean = false; continue; }
          r.lines.forEach((l) => hit.add(l));
          if (!(r.history[r.history.length - 1] > r.history[0] + EPS)) errors.push(`${where}：用預設參數跑完 bestScore 沒有變好`);
        } catch (e) {
          errors.push(`${where}：執行出錯：${e && e.message}`);
          clean = false;
        }
      }
    }
    try {
      const mapId = HFG.problems[kind].maps[0].id;
      const r1 = runOnce(HFG, algo, kind, mapId, 1), r2 = runOnce(HFG, algo, kind, mapId, 1);
      const r3 = runOnce(HFG, algo, kind, mapId, 1, false);
      const same = (a, b) => JSON.stringify(a.history) === JSON.stringify(b.history);
      if (!same(r1, r2)) errors.push(`${label}［${kind}］：同一個種子跑兩次結果不同`);
      else if (!same(r1, r3)) errors.push(`${label}［${kind}］：有追蹤和沒追蹤（HFG.noTrace）跑出來的結果不同；t() 只能回報，不能影響演算法`);
    } catch (e) { /* already reported above */ }
  }
  if (clean) {
    algo.pseudo.forEach((text, i) => {
      if (!hit.has(i + 1)) errors.push(`${label}：pseudo 第 ${i + 1} 行「${text.trim()}」從來沒有被執行到（要用 t(${i + 1}, …) 回報）`);
    });
  }
  return errors;
}

// ---------- algorithm page ----------

const sectionBody = (html, id) => {
  const m = html.match(new RegExp(`<section[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</section>`));
  return m ? m[1] : "";
};
const text = (s) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function checkPage(html, entry, { HFG, registry, algo }) {
  const errors = [];
  const label = `algorithms/${entry.slug}.html`;
  const slug = entry.slug;

  const body = html.match(/<body[^>]*\bdata-slug="([^"]*)"/);
  if (!body || body[1] !== slug) errors.push(`${label}：<body> 要有 data-slug="${slug}"`);

  const ids = [...html.matchAll(/<section[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const missing = SECTIONS.filter((id) => !ids.includes(id));
  missing.forEach((id) => errors.push(`${label}：缺少區塊 <section id="${id}">`));
  const extra = ids.filter((id) => !SECTIONS.includes(id));
  extra.forEach((id) => errors.push(`${label}：多了規則裡沒有的區塊 #${id}`));
  if (!missing.length && !extra.length && ids.join() !== SECTIONS.join()) errors.push(`${label}：區塊順序不對，應該是 ${SECTIONS.join(" → ")}`);

  const demo = sectionBody(html, "demo").match(/data-algorithm="([^"]*)"/);
  if (!demo || demo[1] !== slug) errors.push(`${label}：#demo 裡要有 <div class="demo" data-algorithm="${slug}">`);
  if (!html.includes(`src="../js/algorithms/${slug}.js"`)) errors.push(`${label}：沒有載入 ../js/algorithms/${slug}.js`);
  if (html.includes("✏️")) errors.push(`${label}：還有 ✏️ 沒換掉`);
  const len = (s) => text(s).replace(/&[a-z]+;/g, "x").replace(/\s+/g, "").length;
  const tooLong = (id, pieces, max, what) => pieces.forEach((piece) => {
    const n = len(piece);
    if (n > max) errors.push(`${label}：#${id} 的${what}有 ${n} 字，上限 ${max} 字（標點和英文也算）`);
  });
  tooLong("analogy", [sectionBody(html, "analogy").replace(/<h2[\s\S]*?<\/h2>/, "")], TEXT_LIMITS.analogy, "生活比喻");
  tooLong("params", [...sectionBody(html, "params").matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((m) => m[1]), TEXT_LIMITS.paramsNote, "補充");
  tooLong("try", [...sectionBody(html, "try").matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((m) => m[1]), TEXT_LIMITS.tryText, "實驗說明");
  tooLong("fit", [...sectionBody(html, "fit").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]), TEXT_LIMITS.fitItem, "清單項目");
  tooLong("related", [...sectionBody(html, "related").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]), TEXT_LIMITS.relatedItem, "說明");

  const ready = new Set(registry.filter((e) => e.status === "ready").map((e) => e.slug));
  const links = [...sectionBody(html, "related").matchAll(/href="([^"#?]+)\.html"/g)].map((m) => m[1]);
  links.filter((s) => !ready.has(s)).forEach((s) => errors.push(`${label}：related 連到不存在的頁面 ${s}.html`));
  if (!links.some((s) => s !== slug && ready.has(s))) errors.push(`${label}：related 至少要連到一個圖鑑裡的其他演算法`);
  if (!/<li[\s>]/.test(sectionBody(html, "refs"))) errors.push(`${label}：refs 至少要有一筆參考資料（<li>）`);

  if (algo) {
    const params = sectionBody(html, "params");
    for (const kind of algo.supports) {
      for (const p of algo.params[kind] || []) {
        const row = params.match(new RegExp(`<tr[^>]*data-key="${escapeRe(p.key)}"[^>]*>([\\s\\S]*?)</tr>`));
        if (!row) { errors.push(`${label}：參數表缺少 <tr data-key="${p.key}">`); continue; }
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
        const last = cells[cells.length - 1] || "";
        if (!new RegExp(`(^|[^\\d.])${escapeRe(String(p.value))}(?!\\d)`).test(last)) {
          errors.push(`${label}：參數 ${p.key} 的預設值（${kind}）應該寫 ${p.value}，表格寫的是「${last.trim()}」`);
        }
      }
    }

    const presets = presetsOf(html);
    if (!presets.length) errors.push(`${label}：try 至少要有一個「套用這組設定」按鈕（data-set）`);
    for (const raw of presets) parsePreset(HFG, raw, algo).errors.forEach((e) => errors.push(`${label}：${e}`));
  }
  return errors;
}

// ---------- try-it presets ----------

// The raw data-set strings of the buttons in #try, with &amp; decoded.
const presetsOf = (html) => [...sectionBody(html, "try").matchAll(/data-set="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

// Read one data-set string the same way demo.js does: missing problem/map/seed/params fall back to defaults.
function parsePreset(HFG, raw, algo) {
  const errors = [];
  const q = new URLSearchParams(raw);
  const kind = q.get("problem") || algo.supports[0];
  if (!algo.supports.includes(kind)) return { errors: [`data-set「${raw}」的問題 ${kind} 這個演算法不支援`] };
  const defs = algo.params[kind] || [];
  const params = HFG.defaultParams(algo, kind);
  let mapId = HFG.problems[kind].maps[0].id, seed = 1;
  for (const [k, v] of q) {
    if (k === "problem") continue;
    if (k === "map") {
      if (!HFG.problems[kind].maps.some((m) => m.id === v)) errors.push(`data-set「${raw}」的 map「${v}」不存在`);
      else mapId = v;
      continue;
    }
    if (k === "seed") {
      if (!/^\d+$/.test(v) || Number(v) < 1) errors.push(`data-set「${raw}」的 seed 要是正整數`);
      else seed = Number(v);
      continue;
    }
    const def = defs.find((d) => d.key === k);
    if (!def) errors.push(`data-set「${raw}」有不認得的參數 ${k}`);
    else if (!(Number(v) >= def.min && Number(v) <= def.max)) errors.push(`data-set「${raw}」的 ${k}=${v} 超出滑桿範圍 ${def.min}～${def.max}`);
    else params[k] = Number(v);
  }
  return { kind, mapId, seed, params, errors };
}

// Run every try-it preset to the end, so the numbers written on the page can be compared with what
// the demo really shows. Throws on a broken preset rather than quietly running different settings.
export function runPresets(HFG, html, algo) {
  return presetsOf(html).map((raw) => {
    const p = parsePreset(HFG, raw, algo);
    if (p.errors.length) throw new Error(p.errors.join("；"));
    const problem = HFG.problems[p.kind].create(p.mapId);
    const r = HFG.run(algo, problem, p.params, p.seed, algo.maxSteps[p.kind]);
    const final = r.history[r.history.length - 1];
    return {
      raw, kind: p.kind, mapId: p.mapId, seed: p.seed, params: p.params,
      display: problem.display(r.state.best), steps: r.steps, note: r.state.note,
      reachedAt: r.history.findIndex((v) => Math.abs(v - final) < EPS),
    };
  });
}

// ---------- homepage ----------

export function checkIndex(html) {
  const errors = [];
  if (/class="card[\s"]/.test(html)) errors.push("index.html：不能手動寫卡片，卡片由 registry.js 自動產生");
  if (!html.includes('src="js/registry.js"')) errors.push("index.html：沒有載入 js/registry.js");
  return errors;
}
