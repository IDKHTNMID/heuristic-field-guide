// Genetic algorithm: one step = one generation. Keep the best individual (elitism), pick parents by
// tournament, create children with problem.crossover, mutate each child with probability pm.
// The trace shows the first child in detail and then one summary line for the rest.
HFG.registerAlgorithm({
  slug: "genetic-algorithm",
  supports: ["terrain", "tsp"],
  maxSteps: { terrain: 60, tsp: 200 },
  params: {
    terrain: [
      { key: "pop", label: "族群大小", min: 4, max: 80, step: 1, value: 30 },
      { key: "pm", label: "突變機率", min: 0, max: 1, step: 0.01, value: 0.2 },
    ],
    tsp: [
      { key: "pop", label: "族群大小", min: 4, max: 120, step: 1, value: 50 },
      { key: "pm", label: "突變機率", min: 0, max: 1, step: 0.01, value: 0.3 },
    ],
  },
  pseudo: [
    "族群 ← 隨機產生 P 個解（P：族群大小）",
    "每一代（直到步數用完）：",
    "  新族群（下一代）← 先放進目前族群裡最好的 1 個解，原封不動",
    "  重複下面 3 行（每次做出 1 個孩子），直到新族群也有 P 個解：",
    "    挑父母：從族群隨機抽 3 個、留最好的當 a；再抽 3 個、留最好的當 b",
    "    孩子 ← 交配(a, b)：混合 a 和 b，做出一個新解",
    "    孩子有 pm（突變機率）的機會被隨機改一點；改不改都放進新族群",
    "  族群 ← 新族群",
  ],

  init(problem, params, rng, t) {
    const pop = [];
    for (let i = 0; i < params.pop; i++) pop.push(problem.random(rng));
    const scores = pop.map(problem.score);
    const b = scores.indexOf(Math.max(...scores));
    t(1, `${params.pop} 個解，最好 ${problem.display(pop[b])}`, { cands: pop, pick: pop[b] });
    return {
      best: pop[b], bestScore: scores[b], current: pop[b], pop, scores, gen: 0,
      points: pop, note: `隨機產生 ${params.pop} 個解，這是第 0 代。`, done: false,
    };
  },

  step(state, problem, params, rng, t) {
    const { pop, scores } = state;
    const TOURNAMENT = 3;
    const pickParent = () => {
      let w = HFG.randInt(rng, pop.length);
      for (let k = 1; k < TOURNAMENT; k++) {
        const c = HFG.randInt(rng, pop.length);
        if (scores[c] > scores[w]) w = c;
      }
      return pop[w];
    };
    t(2, `第 ${state.gen + 1} 代`);
    const eliteIdx = scores.indexOf(Math.max(...scores));
    const next = [pop[eliteIdx]];
    t(3, `保留 ${problem.display(pop[eliteIdx])}`, { pick: pop[eliteIdx], labels: [{ at: pop[eliteIdx], text: "最好的" }] });
    let mutated = 0;
    while (next.length < pop.length) {
      const first = next.length === 1;
      if (first) t(4, `第 1 個孩子（共要做 ${pop.length - 1} 個）`);
      const a = pickParent(), b = pickParent();
      const AB = [{ at: a, text: "a" }, { at: b, text: "b" }];
      if (first) t(5, `a：${problem.display(a)}／b：${problem.display(b)}`, { cands: [a, b], labels: AB });
      let child = problem.crossover(a, b, rng);
      if (first) t(6, problem.display(child), { cands: [a, b], pick: child, labels: [...AB, { at: child, text: "孩子" }] });
      const mutate = rng() < params.pm;
      if (mutate) { child = problem.mutate(child, rng); mutated++; }
      if (first) t(7, mutate ? `突變了 → ${problem.display(child)}` : `這次沒有突變`, { pick: child, labels: [{ at: child, text: "孩子" }] });
      next.push(child);
    }
    state.pop = next;
    state.scores = next.map(problem.score);
    state.points = next;
    const b = state.scores.indexOf(Math.max(...state.scores));
    state.current = next[b];
    if (state.scores[b] > state.bestScore) { state.best = next[b]; state.bestScore = state.scores[b]; }
    state.gen++;
    t(8, `${next.length} 個新解（${mutated} 個突變），最好 ${problem.display(next[b])}`, { cands: next, pick: next[b] });
    state.note = `第 ${state.gen} 代：保留最好的 1 個，其餘 ${next.length - 1} 個由比賽選出的父母交配產生，其中 ${mutated} 個有突變。`;
  },
});
