// Particle swarm optimization with inertia weight (global-best topology): one step = every particle moves once.
// v ← w·v + c1·r1·(p − x) + c2·r2·(g − x), then x ← x + v. p is the particle's own best, g the swarm's best;
// r1, r2 are drawn per coordinate. g is updated as soon as a particle beats it.
// The trace shows the first particle in detail (one line per velocity term), then one summary line for the rest.
(function () {
  "use strict";
  const VMAX = 0.15;       // speed limit per coordinate, as a fraction of the map width

  const limit = (v) => Math.max(-VMAX, Math.min(VMAX, v));
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });

  HFG.registerAlgorithm({
    slug: "particle-swarm-optimization",
    supports: ["terrain"],
    maxSteps: { terrain: 60 },
    params: {
      terrain: [
        { key: "n", label: "粒子數量", min: 2, max: 60, step: 1, value: 20 },
        { key: "w", label: "慣性權重 w", min: 0, max: 1.2, step: 0.05, value: 0.7 },
        { key: "c1", label: "自己的拉力 c₁", min: 0, max: 3, step: 0.1, value: 1.5 },
        { key: "c2", label: "大家的拉力 c₂", min: 0, max: 3, step: 0.1, value: 1.5 },
      ],
    },
    pseudo: [
      "每個粒子：隨機位置 x、隨機速度 v；p ← x（自己的最好）；g ← 所有 p 裡最好的（大家的最好）",
      "每一輪（直到步數用完），每個粒子輪流做：",
      "  v ← w × v（衝勁：原本的速度留下 w 倍）",
      "  v ← v + c₁ × r ×（p − x）（往 p 拉；r 是 0～1 的隨機數）",
      "  v ← v + c₂ × r ×（g − x）（往 g 拉，r 重抽）",
      "  x ← x + v",
      "  如果 x 比 p 好：p ← x",
      "  如果 x 比 g 好：g ← x",
    ],

    init(problem, params, rng, t) {
      const xs = [], vs = [];
      for (let i = 0; i < params.n; i++) {
        xs.push(problem.random(rng));
        vs.push({ x: (rng() * 2 - 1) * VMAX, y: (rng() * 2 - 1) * VMAX });
      }
      const scores = xs.map(problem.score);
      const b = scores.indexOf(Math.max(...scores));
      t(1, `${params.n} 個粒子，g = ${problem.display(xs[b])}`, { cands: xs.slice(), pick: xs[b], labels: [{ at: xs[b], text: "g" }] });
      return {
        best: xs[b], bestScore: scores[b], xs, vs, ps: xs.slice(), pScores: scores.slice(), round: 0,
        points: xs.slice(), note: `隨機放下 ${params.n} 個粒子，每個都朝隨機方向移動。`, done: false,
      };
    },

    step(state, problem, params, rng, t) {
      const { xs, vs, ps, pScores } = state;
      const n = xs.length;
      let personal = 0, global = 0;
      for (let i = 0; i < n; i++) {
        const first = i === 0, x = xs[i], p = ps[i], g = state.best;
        const at = (d) => problem.clamp(add(x, d));          // only for drawing where the velocity points
        const X = { at: x, text: "x" }, P = { at: p, text: "p" }, G = { at: g, text: "g" };
        if (first) t(2, `第 ${state.round + 1} 輪，先看第 1 個粒子`, { pick: x, labels: [X, P, G] });

        let v = { x: params.w * vs[i].x, y: params.w * vs[i].y };
        if (first) t(3, `衝勁剩 ${Math.round(params.w * 100)}%`, { from: x, pick: at(v), labels: [X, P, G] });
        const r1x = rng(), r1y = rng();
        v = { x: v.x + params.c1 * r1x * (p.x - x.x), y: v.y + params.c1 * r1y * (p.y - x.y) };
        if (first) t(4, x === p ? "x 就在 p 上，這一項是 0" : "往 p 拉一點", { from: x, pick: at(v), labels: [X, P, G] });
        const r2x = rng(), r2y = rng();
        v = { x: limit(v.x + params.c2 * r2x * (g.x - x.x)), y: limit(v.y + params.c2 * r2y * (g.y - x.y)) };
        if (first) t(5, x === g ? "x 就在 g 上，這一項是 0" : "往 g 拉一點", { from: x, pick: at(v), labels: [X, P, G] });

        const moved = add(x, v);
        const nx = problem.clamp(moved);
        // A particle that hits the edge of the map stops moving in that direction.
        vs[i] = { x: nx.x === moved.x ? v.x : 0, y: nx.y === moved.y ? v.y : 0 };
        xs[i] = nx;
        const sc = problem.score(nx);
        if (first) t(6, `移到 ${problem.display(nx)}`, { from: x, pick: nx, labels: [{ at: nx, text: "x" }, P, G] });

        const beatP = sc > pScores[i];
        if (beatP) { ps[i] = nx; pScores[i] = sc; personal++; }
        if (first) t(7, beatP ? "比 p 好 → p 移到這裡" : "沒有比 p 好 → p 不變", { pick: ps[i], labels: [{ at: ps[i], text: "p" }] });
        const beatG = sc > state.bestScore;
        if (beatG) { state.best = nx; state.bestScore = sc; global++; }
        if (first) t(8, beatG ? "比 g 好 → g 移到這裡" : "沒有比 g 好 → g 不變", { pick: state.best, labels: [{ at: state.best, text: "g" }] });
      }
      t(8, `其他 ${n - 1} 個也照做：${personal} 個刷新自己的 p`, { cands: xs.slice(), pick: state.best, labels: [{ at: state.best, text: "g" }] });
      state.points = xs.slice();
      state.round++;
      state.note = `第 ${state.round} 輪：${personal} 個粒子刷新了自己的最好位置` +
        (global ? `，大家的最好位置更新了 ${global} 次，現在是 ${problem.display(state.best)}。` : `，大家的最好位置沒變（${problem.display(state.best)}）。`);
    },
  });
})();
