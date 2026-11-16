// Simulated annealing: try one random neighbor per step; always accept better ones, accept worse ones
// with probability e^(Δ/T). The temperature T shrinks by a factor alpha every step.
HFG.registerAlgorithm({
  slug: "simulated-annealing",
  supports: ["terrain", "tsp"],
  maxSteps: { terrain: 600, tsp: 4000 },
  params: {
    terrain: [
      { key: "t0", label: "初始溫度 T₀", min: 0.001, max: 1, step: 0.001, value: 0.25 },
      { key: "alpha", label: "降溫係數 α", min: 0.9, max: 0.999, step: 0.001, value: 0.997 },
    ],
    tsp: [
      { key: "t0", label: "初始溫度 T₀", min: 0.1, max: 100, step: 0.1, value: 20 },
      { key: "alpha", label: "降溫係數 α", min: 0.9, max: 0.9999, step: 0.0001, value: 0.999 },
    ],
  },

  pseudo: [
    "s ← 隨機起點；最佳 ← s；溫度 T ← T₀",
    "重複（直到步數用完）：",
    "  n ← 從 s 的鄰居裡隨機抽一個",
    "  Δ ← 分數(n) − 分數(s)",
    "  如果 Δ ≥ 0（n 不比 s 差）：s ← n",
    "  否則（n 比較差）：以 e^(Δ/T) 的機率 s ← n",
    "  如果 s 比最佳還好：最佳 ← s",
    "  降溫：T ← T × α",
  ],

  init(problem, params, rng, t) {
    const s = problem.random(rng);
    const sc = problem.score(s);
    t(1, `${problem.display(s)}，T = ${params.t0}`, { pick: s, labels: [{ at: s, text: "s" }] });
    return {
      best: s, bestScore: sc, current: s, currentScore: sc, T: params.t0,
      points: [s], trail: [s], note: `起點，溫度 T = ${params.t0}。`, done: false,
    };
  },

  step(state, problem, params, rng, t) {
    const num = (v) => (Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(3));
    const cur = state.current, T = state.T;
    const S = { at: cur, text: "s" };
    t(2, `T = ${num(T)}`, { pick: cur, labels: [S] });
    const cand = problem.neighbor(cur, rng);
    const N = { at: cand, text: "n" };
    t(3, problem.display(cand), { cands: [cand], labels: [S, N] });
    const sc = problem.score(cand);
    const delta = sc - state.currentScore;
    t(4, `Δ = ${delta >= 0 ? "+" : "−"}${num(Math.abs(delta))}`, { cands: [cand], labels: [S, N] });
    if (delta >= 0) {
      t(5, "Δ ≥ 0 → 走過去", { from: cur, pick: cand, labels: [S, N] });
      state.note = `T = ${T.toFixed(3)}：鄰居比較好，直接走過去。`;
    } else {
      t(5, "Δ < 0，比較差，先不走", { cands: [cand], labels: [S, N] });
      const p = Math.exp(delta / T);
      const r = rng();
      if (r < p) {
        t(6, `機率 ${(p * 100).toFixed(0)}%，抽到 ${(r * 100).toFixed(0)} → 接受`, { from: cur, pick: cand, labels: [S, N] });
        state.note = `T = ${T.toFixed(3)}：鄰居比較差，但用 ${(p * 100).toFixed(0)}% 的機率接受了。`;
      } else {
        t(6, `機率 ${(p * 100).toFixed(0)}%，抽到 ${(r * 100).toFixed(0)} → 不接受`, { pick: cur, labels: [S, N] });
        state.note = `T = ${T.toFixed(3)}：鄰居比較差，接受機率 ${(p * 100).toFixed(0)}%，這次沒接受。`;
        state.T = T * params.alpha;
        t(8, `T 降到 ${num(state.T)}`, { pick: cur, labels: [S] });
        return;
      }
    }
    state.current = cand;
    state.currentScore = sc;
    state.points = [cand];
    if (problem.kind === "terrain") state.trail.push(cand);
    const C = { at: cand, text: "s" };
    if (sc > state.bestScore) {
      state.best = cand; state.bestScore = sc;
      t(7, `比最佳還好 → 記下 ${problem.display(cand)}`, { pick: cand, labels: [C] });
    } else {
      t(7, `最佳還是 ${problem.display(state.best)}，不變`, { pick: cand, labels: [C] });
    }
    state.T = T * params.alpha;
    t(8, `T 降到 ${num(state.T)}`, { pick: cand, labels: [C] });
  },
});
