// Great deluge (Dueck 1993): one solution walks around like simulated annealing, but instead of a
// temperature there is a water level L. A random neighbor is taken only if it is above the water
// (score > L), and every accepted move raises the level by UP. The level starts at the score of the
// starting point. When PATIENCE tries in a row all land under water, we take it that every neighbor is
// flooded and stop.
(function () {
  "use strict";
  const PATIENCE = { terrain: 50, tsp: 300 };   // stop after this many flooded neighbors in a row

  // The water level in the units the page shows: a height on the terrain, a tour length on TSP.
  // The TSP score is minus the length, so on TSP "above the water" means "shorter than this length",
  // and a rising level shows up as a shrinking length.
  const level = (problem, L) => (problem.kind === "tsp" ? (-L).toFixed(1) : L.toFixed(3));
  const tsp = (problem) => problem.kind === "tsp";

  HFG.registerAlgorithm({
    slug: "great-deluge",
    supports: ["terrain", "tsp"],
    maxSteps: { terrain: 1000, tsp: 4000 },
    params: {
      terrain: [{ key: "up", label: "水位漲幅 UP", min: 0.0001, max: 0.02, step: 0.0001, value: 0.001 }],
      tsp: [{ key: "up", label: "水位漲幅 UP", min: 0.1, max: 10, step: 0.1, value: 1 }],
    },

    pseudo: [
      "s ← 隨機起點；水位 L ← 分數(s)（分數沒高過 L 的解算被淹）",
      "重複（直到步數用完）：",
      "  n ← 從 s 的鄰居裡隨機抽一個",
      "  如果 分數(n) > L（n 沒被淹）：",
      "    s ← n（就算 n 比 s 差也走）",
      "    L ← L + UP（水漲一格）",
      "  否則（n 被淹）：不走",
      "    如果連續 K 次抽到的鄰居都被淹：停（K：事先定好的次數）",
    ],

    init(problem, params, rng, t) {
      const s = problem.random(rng);
      const sc = problem.score(s);
      const lv = level(problem, sc);
      t(1, `${problem.display(s)}，水位 ${lv}${tsp(problem) ? "（要比它短）" : ""}`, { pick: s, labels: [{ at: s, text: "s" }] });
      return {
        best: s, bestScore: sc, current: s, currentScore: sc, L: sc, wet: 0,
        points: [s], trail: [s], note: `起點，水位先設在起點的分數（${lv}）。`, done: false,
      };
    },

    step(state, problem, params, rng, t) {
      const cur = state.current, L = state.L, K = PATIENCE[problem.kind];
      const lv = level(problem, L);
      const S = { at: cur, text: "s" };
      t(2, `水位 ${lv}`, { pick: cur, labels: [S] });
      const cand = problem.neighbor(cur, rng);
      const N = { at: cand, text: "n" };
      t(3, problem.display(cand), { cands: [cand], labels: [S, N] });
      const sc = problem.score(cand);

      if (sc > L) {
        t(4, tsp(problem) ? `比水位 ${lv} 短 ✓` : `高過水位 ${lv} ✓`, { from: cur, pick: cand, labels: [S, N] });
        state.current = cand;
        state.currentScore = sc;
        state.points = [cand];
        if (problem.kind === "terrain") state.trail.push(cand);
        if (sc > state.bestScore) { state.best = cand; state.bestScore = sc; }
        state.wet = 0;
        t(5, "走過去", { from: cur, pick: cand, labels: [{ at: cand, text: "s" }] });
        state.L = L + params.up;
        const up = level(problem, state.L);
        t(6, tsp(problem) ? `水漲一格：之後要短於 ${up}` : `水漲到 ${up}`, { pick: cand, labels: [{ at: cand, text: "s" }] });
        state.note = `鄰居沒被淹，走過去：${problem.display(cand)}。水位變成 ${up}。`;
        return;
      }

      t(4, tsp(problem) ? `沒比水位 ${lv} 短 → 被淹` : `沒高過水位 ${lv} → 被淹`, { cands: [cand], labels: [S, N] });
      state.wet++;
      t(7, `不走（連續第 ${state.wet} 次被淹）`, { pick: cur, labels: [S] });
      if (state.wet >= K) {
        t(8, `連續 ${K} 次 → 停`, { pick: cur, labels: [S] });
        state.done = true;
        state.note = `連續 ${K} 次抽到的鄰居都被淹，當作四周都淹了，停在${problem.display(cur)}。`;
      } else {
        t(8, `還沒到 ${K} 次，繼續`, { pick: cur, labels: [S] });
        state.note = `鄰居被淹了，不走（連續第 ${state.wet} 次，滿 ${K} 次就停）。水位 ${lv}。`;
      }
    },
  });
})();
