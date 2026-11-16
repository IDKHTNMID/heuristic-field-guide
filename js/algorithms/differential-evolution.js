// Differential evolution (DE/rand/1/bin): one step = one generation.
// For each individual x: mutant v = a + F * (b - c) from three other random individuals,
// mix x and v coordinate by coordinate with rate CR, keep the trial only if it is not worse than x.
// The trace shows the first individual in detail, then one summary line for the rest.
HFG.registerAlgorithm({
  slug: "differential-evolution",
  supports: ["terrain"],
  maxSteps: { terrain: 60 },
  params: {
    terrain: [
      { key: "np", label: "族群大小 NP", min: 4, max: 60, step: 1, value: 20 },
      { key: "f", label: "縮放係數 F", min: 0.1, max: 1.5, step: 0.05, value: 0.6 },
      { key: "cr", label: "交配率 CR", min: 0, max: 1, step: 0.05, value: 0.7 },
    ],
  },
  pseudo: [
    "族群 ← 在地圖上隨機撒 NP 個點",
    "每一代（直到步數用完），族群裡每個點 x 輪流做：",
    "  從族群隨機挑 x 以外、彼此不同的三個點 a、b、c",
    "  突變點 v ← a + F ×（b − c）",
    "  試驗點 u ← 橫、縱座標各自以 CR 的機率取 v 的，否則取 x 的（至少一個取 v）",
    "  如果 u 不比 x 差：x ← u；否則 x 不變",
  ],

  init(problem, params, rng, t) {
    const pop = [];
    for (let i = 0; i < params.np; i++) pop.push(problem.random(rng));
    const scores = pop.map(problem.score);
    const b = scores.indexOf(Math.max(...scores));
    t(1, `撒下 ${params.np} 個點，最好 ${problem.display(pop[b])}`, { cands: pop.slice(), pick: pop[b] });
    return {
      best: pop[b], bestScore: scores[b], pop, scores, gen: 0,
      points: pop, note: `隨機撒下 ${params.np} 個點，這是第 0 代。`, done: false,
    };
  },

  step(state, problem, params, rng, t) {
    const { pop, scores } = state;
    const n = pop.length;
    let replaced = 0, stepSum = 0;
    for (let i = 0; i < n; i++) {
      const first = i === 0, x = pop[i];
      const X = { at: x, text: "x" };
      if (first) t(2, `第 ${state.gen + 1} 代，先看第 1 個點 x`, { pick: x, labels: [X] });
      const pick = [];
      while (pick.length < 3) {
        const r = HFG.randInt(rng, n);
        if (r !== i && !pick.includes(r)) pick.push(r);
      }
      const [a, b, c] = pick.map((r) => pop[r]);
      const v = { x: a.x + params.f * (b.x - c.x), y: a.y + params.f * (b.y - c.y) };
      const shownV = problem.clamp(v);               // only for drawing: v itself may leave the map
      if (first) {
        const ABC = [{ at: a, text: "a" }, { at: b, text: "b" }, { at: c, text: "c" }];
        t(3, "隨機挑到 a、b、c", { cands: [a, b, c], pick: x, labels: [X, ...ABC] });
        t(4, `從 a 沿著（b − c）的方向走 ${params.f} 倍`,
          { cands: [b, c], from: a, pick: shownV, labels: [...ABC, { at: shownV, text: "v" }] });
      }
      stepSum += Math.hypot(b.x - c.x, b.y - c.y) * params.f;
      const forced = rng() < 0.5 ? "x" : "y";       // at least one coordinate comes from the mutant
      const useVx = forced === "x" || rng() < params.cr;
      const useVy = forced === "y" || rng() < params.cr;
      const trial = problem.clamp({ x: useVx ? v.x : x.x, y: useVy ? v.y : x.y });
      const sc = problem.score(trial);
      if (first) {
        t(5, `u 的橫座標取 ${useVx ? "v" : "x"}、縱座標取 ${useVy ? "v" : "x"}`,
          { cands: [x, shownV], pick: trial, labels: [X, { at: shownV, text: "v" }, { at: trial, text: "u" }] });
        t(6, sc >= scores[i] ? `u ${problem.display(trial)} 不比 x 差 → x 換成 u` : "u 比 x 差 → 留下 x",
          sc >= scores[i] ? { from: x, pick: trial, labels: [{ at: trial, text: "x" }] } : { pick: x, labels: [X] });
      }
      if (sc >= scores[i]) { pop[i] = trial; scores[i] = sc; replaced++; }
    }
    const b = scores.indexOf(Math.max(...scores));
    if (scores[b] > state.bestScore) { state.best = pop[b]; state.bestScore = scores[b]; }
    t(6, `其他 ${n - 1} 個點也照做：這一代共 ${replaced} 個被換掉`, { cands: pop.slice(), pick: pop[b] });
    state.points = pop.slice();
    state.gen++;
    state.note = `第 ${state.gen} 代：${replaced} 個點被更好的試驗點取代，平均步伐 ${(stepSum / n).toFixed(3)}。`;
  },
});
