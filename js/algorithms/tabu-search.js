// Tabu search: move to the best neighbor that is not on the tabu list, even if it is worse.
// The tabu list remembers the last `tenure` positions visited. Textbooks often store moves instead and let a tabu
// move through if it beats the best so far; a visited position can never do that, so this version needs no exception.
HFG.registerAlgorithm({
  slug: "tabu-search",
  supports: ["terrain", "tsp"],
  maxSteps: { terrain: 1000, tsp: 400 },
  params: {
    terrain: [{ key: "tenure", label: "禁忌表長度", min: 1, max: 1000, step: 1, value: 600 }],
    tsp: [{ key: "tenure", label: "禁忌表長度", min: 1, max: 100, step: 1, value: 30 }],
  },

  pseudo: [
    "s ← 隨機起點；禁忌表 ← [s]（禁忌表：最近走過、不准走回去的解）",
    "重複（直到步數用完）：",
    "  把 s 的所有鄰居照分數由好排到壞",
    "  n ← 排最前面、又不在禁忌表裡的那個鄰居",
    "  如果找不到 n（鄰居全在禁忌表裡）：停",
    "  s ← n（就算 n 比 s 差也走）",
    "  把 n 加進禁忌表；超過禁忌表長度，就刪掉最舊的一筆",
  ],

  init(problem, params, rng, t) {
    const s = problem.random(rng);
    t(1, problem.display(s), { pick: s, labels: [{ at: s, text: "s" }] });
    return {
      best: s, bestScore: problem.score(s), current: s, tabu: [problem.key(s)],
      points: [s], trail: [s], note: "隨機選一個起點，先把它記進禁忌表。", done: false,
    };
  },

  step(state, problem, params, rng, t) {
    const cur = state.current;
    const S = { at: cur, text: "s" };
    t(2, `禁忌表有 ${state.tabu.length} 筆`, { pick: cur, labels: [S] });
    const ranked = problem.neighbors(cur)
      .map((s) => ({ s, sc: problem.score(s), k: problem.key(s) }))
      .sort((a, b) => b.sc - a.sc);
    t(3, `${ranked.length} 個鄰居，最好 ${problem.display(ranked[0].s)}`, { cands: ranked.map((c) => c.s), labels: [S] });
    const pick = ranked.find((c) => !state.tabu.includes(c.k));
    if (!pick) {
      t(4, "每一個都在禁忌表裡", { cands: ranked.map((c) => c.s), labels: [S] });
      t(5, "找不到 → 停", { pick: cur, labels: [S] });
      state.done = true;
      state.note = "所有鄰居都在禁忌表裡，沒有路可以走了。";
      return;
    }
    const skipped = ranked.indexOf(pick);
    const N = { at: pick.s, text: "n" };
    t(4, skipped ? `跳過 ${skipped} 個禁忌的，n = ${problem.display(pick.s)}` : `第一個就能走：${problem.display(pick.s)}`,
      { cands: ranked.slice(0, skipped).map((c) => c.s), pick: pick.s, labels: [S, N] });
    t(5, "找到了，繼續", { pick: pick.s, labels: [S, N] });
    const worse = pick.sc < problem.score(cur);
    t(6, worse ? "比現在差，還是走過去" : "走過去", { from: cur, pick: pick.s, labels: [N] });
    state.current = pick.s;
    state.points = [pick.s];
    if (problem.kind === "terrain") state.trail.push(pick.s);
    state.tabu.push(pick.k);
    if (state.tabu.length > params.tenure) state.tabu.shift();
    if (pick.sc > state.bestScore) { state.best = pick.s; state.bestScore = pick.sc; }
    t(7, `禁忌表有 ${state.tabu.length} 筆（上限 ${params.tenure}）`, { pick: pick.s, labels: [{ at: pick.s, text: "s" }] });
    state.note = (skipped ? `跳過 ${skipped} 個禁忌的鄰居，` : "") +
      (worse ? "最好的可走鄰居比現在差，還是走過去。" : "走到最好的可走鄰居。") +
      `禁忌表現在有 ${state.tabu.length} 筆。`;
  },
});
