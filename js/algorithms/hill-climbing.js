// Hill climbing (steepest ascent): look at every neighbor, move to the best one, stop when none is better.
HFG.registerAlgorithm({
  slug: "hill-climbing",
  supports: ["terrain", "tsp"],
  maxSteps: { terrain: 60, tsp: 40 },
  params: { terrain: [], tsp: [] },
  pseudo: [
    "s ← 隨機起點",
    "重複：",
    "  列出 s 的所有鄰居（鄰居：把 s 改一點點得到的解）",
    "  n ← 其中最好的鄰居",
    "  如果 n 沒有比 s 好：停",
    "  s ← n",
  ],

  init(problem, params, rng, t) {
    const s = problem.random(rng);
    t(1, problem.display(s), { pick: s, labels: [{ at: s, text: "s" }] });
    return {
      best: s, bestScore: problem.score(s), current: s,
      points: [s], trail: [s], note: "隨機選一個起點。", done: false,
    };
  },

  step(state, problem, params, rng, t) {
    const cur = state.current;
    const S = { at: cur, text: "s" };
    t(2, `第 ${state.trail.length} 步`, { pick: cur, labels: [S] });
    const neighbors = problem.neighbors(cur);
    t(3, `${neighbors.length} 個鄰居`, { cands: neighbors, labels: [S] });
    let next = neighbors[0], nextScore = problem.score(next);
    for (const nb of neighbors) {
      const sc = problem.score(nb);
      if (sc > nextScore) { next = nb; nextScore = sc; }
    }
    const N = { at: next, text: "n" };
    t(4, problem.display(next), { cands: neighbors, pick: next, labels: [S, N] });
    if (!(nextScore > state.bestScore)) {
      t(5, `${problem.display(next)} 不比 ${problem.display(cur)} 好 → 停`, { pick: cur, labels: [S, N] });
      state.done = true;
      state.note = `看了 ${neighbors.length} 個鄰居，沒有一個比現在好，停在這裡。`;
      return;
    }
    const tiny = problem.display(next) === problem.display(cur) ? "（只多一點點）" : "";
    t(5, `比 ${problem.display(cur)} 好 ✓${tiny}`, { pick: next, from: cur, labels: [S, N] });
    t(6, `走過去`, { pick: next, from: cur, labels: [{ at: next, text: "s" }] });
    state.current = state.best = next;
    state.bestScore = nextScore;
    state.points = [next];
    state.trail.push(next);
    state.note = `看了 ${neighbors.length} 個鄰居，走到最好的那個：${problem.display(next)}。`;
  },
});
