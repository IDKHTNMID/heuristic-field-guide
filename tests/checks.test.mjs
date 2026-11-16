// Tests for the checker itself: every check must pass a good fixture and fail a broken one.
// Run with: node --test   (from the repo root)
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadSite, checkRegistry, checkAlgorithm, checkPage, checkIndex, runPresets, TEXT_LIMITS } from "./checks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { HFG } = loadSite(ROOT, { algorithms: [] });

const fails = (errors, pattern) =>
  assert.ok(errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}, got: ${JSON.stringify(errors)}`);
const passes = (errors) => assert.deepEqual(errors, []);

// ---------- registry ----------
const entry = (over = {}) => ({
  no: "01", slug: "hill-climbing", name: "爬山法", en: "Hill Climbing", family: "single",
  supports: ["terrain", "tsp"], track: "basic", line: "每一步都往旁邊最高的地方走。", status: "ready", ...over,
});
const twoEntries = () => [entry(), entry({ no: "02", slug: "simulated-annealing", name: "模擬退火", en: "Simulated Annealing" })];

test("registry: a correct list passes", () => passes(checkRegistry(twoEntries())));
test("registry: duplicate number fails", () => {
  const r = twoEntries(); r[1].no = "01";
  fails(checkRegistry(r), /編號/);
});
test("registry: skipped number fails", () => {
  const r = twoEntries(); r[1].no = "03";
  fails(checkRegistry(r), /編號/);
});
test("registry: number must be two digits", () => fails(checkRegistry([entry({ no: "1" })]), /編號/));
test("registry: duplicate slug fails", () => {
  const r = twoEntries(); r[1].slug = "hill-climbing";
  fails(checkRegistry(r), /slug/);
});
test("registry: slug with capitals or spaces fails", () => fails(checkRegistry([entry({ slug: "Hill Climbing" })]), /slug/));
test("registry: unknown family fails", () => fails(checkRegistry([entry({ family: "physics" })]), /family/));
test("registry: unknown problem in supports fails", () => fails(checkRegistry([entry({ supports: ["maze"] })]), /supports/));
test("registry: empty supports fails", () => fails(checkRegistry([entry({ supports: [] })]), /supports/));
test("registry: unknown track fails", () => fails(checkRegistry([entry({ track: "advanced" })]), /track/));
test("registry: unknown status fails", () => fails(checkRegistry([entry({ status: "draft" })]), /status/));
test("registry: one-line summary over 30 characters fails", () =>
  fails(checkRegistry([entry({ line: "這".repeat(31) })]), /line/));
test("registry: missing English name fails", () => fails(checkRegistry([entry({ en: "" })]), /en/));

// ---------- algorithm contract ----------
const climb = (over = {}) => ({
  slug: "hill-climbing",
  supports: ["terrain", "tsp"],
  maxSteps: { terrain: 100, tsp: 100 },
  params: { terrain: [], tsp: [] },
  pseudo: ["s ← 隨機起點", "重複：", "  n ← s 最好的鄰居", "  如果 n 沒有比 s 好：停", "  s ← n"],
  init(problem, params, rng, t) {
    const s = problem.random(rng);
    t(1, "起點", { pick: s });
    return { best: s, bestScore: problem.score(s), points: [s], note: "起點", done: false };
  },
  step(state, problem, params, rng, t) {
    t(2, "下一步");
    const next = problem.neighbors(state.best).reduce((a, b) => (problem.score(b) > problem.score(a) ? b : a));
    t(3, "最好的鄰居", { pick: next });
    if (problem.score(next) <= state.bestScore) { t(4, "停"); state.done = true; state.note = "卡住了"; return; }
    t(5, "走過去", { from: state.best, pick: next });
    state.best = next; state.bestScore = problem.score(next); state.points = [next]; state.note = "往上走";
  },
  ...over,
});
const SRC = "HFG.registerAlgorithm({ /* fixture */ });";

test("algorithm: a correct hill climber passes", () => passes(checkAlgorithm(HFG, climb(), entry(), SRC)));
test("algorithm: supports different from registry fails", () =>
  fails(checkAlgorithm(HFG, climb({ supports: ["terrain"], maxSteps: { terrain: 100 }, params: { terrain: [] } }), entry(), SRC), /supports/));
test("algorithm: missing maxSteps for a supported problem fails", () =>
  fails(checkAlgorithm(HFG, climb({ maxSteps: { terrain: 100 } }), entry(), SRC), /maxSteps/));
test("algorithm: param default outside its range fails", () =>
  fails(checkAlgorithm(HFG, climb({ params: { terrain: [{ key: "k", label: "k", min: 0, max: 1, step: 0.1, value: 2 }], tsp: [] } }), entry(), SRC), /參數/));
test("algorithm: source using Math.random fails", () =>
  fails(checkAlgorithm(HFG, climb(), entry(), "const r = Math.random();"), /Math\.random/));
test("algorithm: missing state field fails", () =>
  fails(checkAlgorithm(HFG, climb({
    init(problem, params, rng) { const s = problem.random(rng); return { best: s, bestScore: problem.score(s), points: [s], done: false }; },
  }), entry(), SRC), /note/));
test("algorithm: bestScore that does not match score(best) fails", () =>
  fails(checkAlgorithm(HFG, climb({
    init(problem, params, rng) { const s = problem.random(rng); return { best: s, bestScore: 999, points: [s], note: "", done: false }; },
  }), entry(), SRC), /bestScore/));
test("algorithm: bestScore that goes down fails", () =>
  fails(checkAlgorithm(HFG, climb({
    step(state, problem, params, rng, t) {
      t(2, "亂跳");
      const s = problem.random(rng);
      state.best = s; state.bestScore = problem.score(s); state.points = [s]; state.note = "亂跳";
    },
  }), entry(), SRC), /變小/));
test("algorithm: no improvement fails", () =>
  fails(checkAlgorithm(HFG, climb({ step(state, problem, params, rng, t) { t(2, "原地"); state.note = "原地不動"; } }), entry(), SRC), /沒有變好/));
test("algorithm: different results for the same seed fails", () =>
  fails(checkAlgorithm(HFG, climb({
    init(problem) {
      const s = problem.random(Math.random);
      return { best: s, bestScore: problem.score(s), points: [s], note: "", done: false };
    },
  }), entry(), SRC), /種子/));
test("algorithm: throwing during a run fails", () =>
  fails(checkAlgorithm(HFG, climb({ step() { throw new Error("boom"); } }), entry(), SRC), /boom/));
test("algorithm: missing pseudocode fails", () =>
  fails(checkAlgorithm(HFG, climb({ pseudo: undefined }), entry(), SRC), /pseudo/));
test("algorithm: trace pointing at a line the pseudocode does not have fails", () => {
  const base = climb();
  fails(checkAlgorithm(HFG, climb({ step(state, problem, params, rng, t) { t(9, "?"); base.step(state, problem, params, rng, t); } }), entry(), SRC), /第 9 行/);
});
test("algorithm: pseudocode line that never runs fails", () => {
  const base = climb();
  fails(checkAlgorithm(HFG, climb({ pseudo: [...base.pseudo, "  永遠跑不到"] }), entry(), SRC), /第 6 行/);
});
test("algorithm: a step that reports no line fails", () => {
  const base = climb();
  fails(checkAlgorithm(HFG, climb({ step(state, problem, params, rng) { base.step(state, problem, params, rng, () => {}); } }), entry(), SRC), /t\(/);
});
test("algorithm: behaving differently while traced fails", () => {
  const base = climb();
  fails(checkAlgorithm(HFG, climb({
    init(problem, params, rng, t) { if (t !== HFG.noTrace) rng(); return base.init(problem, params, rng, t); },
  }), entry(), SRC), /追蹤/);
});

// ---------- page ----------
const page = (over = {}) => {
  const p = {
    body: '<body data-slug="hill-climbing">',
    sections: ["analogy", "demo", "params", "try", "fit", "related", "refs"],
    demo: '<div class="demo" data-algorithm="hill-climbing"></div>',
    analogy: "<p>比喻</p>",
    fit: "<ul><li>a</li></ul>",
    params: '<table><tr data-key="seed"><td>種子</td><td>a</td><td>b</td><td>1</td></tr></table>',
    tryset: '<button class="try-set" data-set="problem=terrain&map=three-peaks&seed=3">套用</button>',
    related: '<a href="simulated-annealing.html">模擬退火</a>',
    refs: "<ol><li>Someone（2000）。〈Title〉。</li></ol>",
    script: '<script src="../js/algorithms/hill-climbing.js"></script>',
    extra: "",
    ...over,
  };
  const content = {
    analogy: p.analogy, demo: p.demo, steps: "<p>步驟</p>", params: p.params, try: p.tryset,
    fit: p.fit, related: p.related, refs: p.refs,
  };
  return `<html>${p.body}${p.sections.map((id) => `<section id="${id}"><h2>${id}</h2>${content[id] || ""}</section>`).join("")}${p.extra}${p.script}</body></html>`;
};
const registry = twoEntries();
const pageCtx = () => ({ HFG, registry, algo: climb() });

test("page: a correct page passes", () => passes(checkPage(page(), entry(), pageCtx())));
test("page: missing section fails", () =>
  fails(checkPage(page({ sections: ["analogy", "demo", "params", "try", "fit", "related"] }), entry(), pageCtx()), /refs/));
test("page: sections out of order fails", () =>
  fails(checkPage(page({ sections: ["demo", "analogy", "params", "try", "fit", "related", "refs"] }), entry(), pageCtx()), /順序/));
test("page: wrong data-slug fails", () =>
  fails(checkPage(page({ body: '<body data-slug="tabu-search">' }), entry(), pageCtx()), /data-slug/));
test("page: demo pointing at another algorithm fails", () =>
  fails(checkPage(page({ demo: '<div class="demo" data-algorithm="tabu-search"></div>' }), entry(), pageCtx()), /data-algorithm/));
test("page: not loading its own script fails", () =>
  fails(checkPage(page({ script: "" }), entry(), pageCtx()), /algorithms\/hill-climbing\.js/));
test("page: leftover pencil placeholder fails", () =>
  fails(checkPage(page({ extra: "<p>✏️ 待補</p>" }), entry(), pageCtx()), /✏️/));
test("page: a hand-written steps section fails (the code panel comes from the algorithm file)", () =>
  fails(checkPage(page({ sections: ["analogy", "demo", "steps", "params", "try", "fit", "related", "refs"] }), entry(), pageCtx()), /steps/));
test("page: analogy longer than the limit fails", () =>
  fails(checkPage(page({ analogy: `<p>${"字".repeat(TEXT_LIMITS.analogy + 1)}</p>` }), entry(), pageCtx()), /analogy/));
test("page: analogy at the limit passes", () =>
  passes(checkPage(page({ analogy: `<p>${"字".repeat(TEXT_LIMITS.analogy)}</p>` }), entry(), pageCtx())));
test("page: try-it description longer than the limit fails", () =>
  fails(checkPage(page({ tryset: `<li><h3>實驗</h3><p>${"字".repeat(TEXT_LIMITS.tryText + 1)}</p><button class="try-set" data-set="seed=2">套用</button></li>` }), entry(), pageCtx()), /try/));
test("page: params note longer than the limit fails", () =>
  fails(checkPage(page({ params: page().match(/<table>[\s\S]*<\/table>/)[0] + `<p>${"字".repeat(TEXT_LIMITS.paramsNote + 1)}</p>` }), entry(), pageCtx()), /params/));
test("page: params note at the limit passes", () =>
  passes(checkPage(page({ params: page().match(/<table>[\s\S]*<\/table>/)[0] + `<p>${"字".repeat(TEXT_LIMITS.paramsNote)}</p>` }), entry(), pageCtx())));
test("page: fit item longer than the limit fails", () =>
  fails(checkPage(page({ fit: `<ul><li>${"字".repeat(TEXT_LIMITS.fitItem + 1)}</li></ul>` }), entry(), pageCtx()), /fit/));
test("page: related item longer than the limit fails", () =>
  fails(checkPage(page({ related: `<ul><li><a href="simulated-annealing.html">模擬退火</a>${"字".repeat(TEXT_LIMITS.relatedItem)}</li></ul>` }), entry(), pageCtx()), /related/));
test("page: related section without a link to another page fails", () =>
  fails(checkPage(page({ related: "<p>沒有連結</p>" }), entry(), pageCtx()), /related/));
test("page: related link to a page that is not in the registry fails", () =>
  fails(checkPage(page({ related: '<a href="magic.html">魔法</a>' }), entry(), pageCtx()), /related/));
test("page: empty references fails", () =>
  fails(checkPage(page({ refs: "<p>無</p>" }), entry(), pageCtx()), /refs/));
test("page: parameter missing from the table fails", () => {
  const ctx = pageCtx();
  ctx.algo = climb({ params: { terrain: [{ key: "step", label: "步長", min: 0, max: 1, step: 0.1, value: 0.5 }], tsp: [] } });
  fails(checkPage(page(), entry(), ctx), /step/);
});
test("page: parameter table with the wrong default fails", () => {
  const ctx = pageCtx();
  ctx.algo = climb({ params: { terrain: [{ key: "step", label: "步長", min: 0, max: 1, step: 0.1, value: 0.5 }], tsp: [] } });
  const html = page({ params: '<table><tr data-key="step"><td>步長</td><td>a</td><td>b</td><td>0.3</td></tr></table>' });
  fails(checkPage(html, entry(), ctx), /0\.5/);
});
test("page: parameter table with the right default passes", () => {
  const ctx = pageCtx();
  ctx.algo = climb({ params: { terrain: [{ key: "step", label: "步長", min: 0, max: 1, step: 0.1, value: 0.5 }], tsp: [] } });
  const html = page({ params: '<table><tr data-key="step"><td>步長</td><td>a</td><td>b</td><td>地形 0.5</td></tr></table>' });
  passes(checkPage(html, entry(), ctx));
});
test("page: try-it preset with an unsupported problem fails", () => {
  const ctx = pageCtx();
  ctx.algo = climb({ supports: ["terrain"] });
  fails(checkPage(page({ tryset: '<button class="try-set" data-set="problem=tsp&seed=3">套用</button>' }), entry({ supports: ["terrain"] }), ctx), /data-set/);
});
test("page: try-it preset with an unknown map fails", () =>
  fails(checkPage(page({ tryset: '<button class="try-set" data-set="problem=terrain&map=moon&seed=3">套用</button>' }), entry(), pageCtx()), /map/));
test("page: try-it preset with an unknown parameter fails", () =>
  fails(checkPage(page({ tryset: '<button class="try-set" data-set="problem=terrain&speed=9">套用</button>' }), entry(), pageCtx()), /speed/));
test("page: try-it preset with a value outside the slider range fails", () => {
  const ctx = pageCtx();
  ctx.algo = climb({ params: { terrain: [{ key: "step", label: "步長", min: 0, max: 1, step: 0.1, value: 0.5 }], tsp: [] } });
  const html = page({
    params: '<table><tr data-key="step"><td>步長</td><td>a</td><td>b</td><td>0.5</td></tr></table>',
    tryset: '<button class="try-set" data-set="problem=terrain&step=5">套用</button>',
  });
  fails(checkPage(html, entry(), ctx), /step/);
});
test("page: try section without any preset fails", () =>
  fails(checkPage(page({ tryset: "<p>自己玩</p>" }), entry(), pageCtx()), /try/));

// ---------- index ----------
test("index: generated grid passes", () => passes(checkIndex('<div class="grid" id="grid"></div><script src="js/registry.js"></script>')));
test("index: hand-written card fails", () =>
  fails(checkIndex('<div class="grid" id="grid"><article class="card">手寫</article></div><script src="js/registry.js"></script>'), /手動/));
test("index: not loading the registry fails", () => fails(checkIndex('<div class="grid" id="grid"></div>'), /registry/));

// ---------- try-it presets runner ----------
// A fake algorithm that only remembers what it was given, so the test can see what runPresets applied.
const echo = {
  slug: "echo",
  supports: ["terrain", "tsp"],
  maxSteps: { terrain: 3, tsp: 5 },
  params: { terrain: [{ key: "k", label: "k", min: 0, max: 10, step: 1, value: 1 }], tsp: [{ key: "k", label: "k", min: 0, max: 10, step: 1, value: 4 }] },
  init(problem, params, rng) {
    const s = problem.random(rng);
    return { best: s, bestScore: problem.score(s), points: [s], note: `${problem.kind}/${problem.mapId}/k=${params.k}`, done: false };
  },
  step(state) { state.note += "+"; },
};
const tryHtml = (...sets) => `<section id="try">${sets.map((s) => `<button class="try-set" data-set="${s}">x</button>`).join("")}</section>`;

test("presets: applies problem, map, seed and parameter from data-set", () => {
  const [r] = runPresets(HFG, tryHtml("problem=tsp&amp;map=ring-16&amp;seed=5&amp;k=2"), echo);
  assert.equal(r.raw, "problem=tsp&map=ring-16&seed=5&k=2");
  assert.equal(r.kind, "tsp"); assert.equal(r.mapId, "ring-16"); assert.equal(r.seed, 5);
  assert.equal(r.params.k, 2);
  assert.equal(r.steps, 5);
  assert.equal(r.note, "tsp/ring-16/k=2+++++");
  const manual = HFG.run(echo, HFG.problems.tsp.create("ring-16"), { k: 2 }, 5, 5);
  assert.equal(r.display, HFG.problems.tsp.create("ring-16").display(manual.state.best));
});
test("presets: missing fields fall back to first problem, first map, seed 1 and default parameters", () => {
  const [r] = runPresets(HFG, tryHtml(""), echo);
  assert.equal(r.kind, "terrain"); assert.equal(r.mapId, HFG.problems.terrain.maps[0].id); assert.equal(r.seed, 1);
  assert.equal(r.params.k, 1);
});
test("presets: reports the first step that reached the final best", () => {
  const [r] = runPresets(HFG, tryHtml("problem=tsp"), echo);
  assert.equal(r.reachedAt, 0);
});
test("presets: only reads buttons inside the try section", () =>
  assert.equal(runPresets(HFG, `<p data-set="seed=9"></p>${tryHtml("seed=2")}`, echo).length, 1));
test("presets: unknown parameter throws instead of running something else", () =>
  assert.throws(() => runPresets(HFG, tryHtml("k=2&amp;zz=1"), echo), /zz/));
test("presets: unsupported problem throws", () =>
  assert.throws(() => runPresets(HFG, tryHtml("problem=maze"), echo), /maze/));
