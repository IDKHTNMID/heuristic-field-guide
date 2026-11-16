// core.js — HFG namespace, seeded random numbers and shared helpers.
// Classic script (no ES module) so pages also work when opened directly from disk.
(function () {
  "use strict";
  const HFG = (window.HFG = window.HFG || {});
  HFG.algorithms = HFG.algorithms || {};
  HFG.problems = HFG.problems || {};

  HFG.FAMILY = { single: "單一解搜尋", evolution: "演化計算", swarm: "群體智慧" };
  HFG.PROBLEM_LABEL = { terrain: "連續地形", tsp: "TSP 路線" };
  HFG.TRACK = { basic: "入門", extended: "課外延伸" };

  // mulberry32: small, fast, deterministic PRNG returning numbers in [0, 1).
  HFG.rng = function (seed) {
    let a = (Number(seed) | 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  HFG.randInt = (rng, n) => Math.floor(rng() * n);
  HFG.gauss = function (rng) {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
  HFG.shuffle = function (arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = HFG.randInt(rng, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  HFG.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Tags shown on homepage cards and page headers: family, problems, and "課外延伸" for extended entries.
  HFG.tagsHtml = function (e) {
    return `<span class="tag">${HFG.FAMILY[e.family]}</span>` +
      e.supports.map((p) => `<span class="tag light">${HFG.PROBLEM_LABEL[p]}</span>`).join("") +
      (e.track === "extended" ? `<span class="tag outline">${HFG.TRACK.extended}</span>` : "");
  };

  HFG.registerAlgorithm = function (def) {
    if (!def || typeof def.slug !== "string") throw new Error("registerAlgorithm: slug is required");
    HFG.algorithms[def.slug] = def;
  };
  HFG.registerProblem = function (def) {
    if (!def || typeof def.kind !== "string") throw new Error("registerProblem: kind is required");
    HFG.problems[def.kind] = def;
  };

  HFG.defaultParams = function (algo, kind) {
    const out = {};
    ((algo.params && algo.params[kind]) || []).forEach((p) => { out[p.key] = p.value; });
    return out;
  };

  // Headless run, used by homepage thumbnails and the Node checks.
  // The tracer that ignores everything. Algorithms call t(line, say, mark) to report which
  // pseudocode line they are on; the demo passes a recorder instead (see AGENTS.md section 5).
  HFG.noTrace = function () {};

  // True when the reader asked the system for less motion; animations then show their end state.
  HFG.reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  HFG.run = function (algo, problem, params, seed, steps, t = HFG.noTrace) {
    const rng = HFG.rng(seed);
    const state = algo.init(problem, params, rng, t);
    const history = [state.bestScore];
    let n = 0;
    while (n < steps && !state.done) {
      algo.step(state, problem, params, rng, t);
      n++;
      history.push(state.bestScore);
    }
    return { state, history, steps: n };
  };
})();
