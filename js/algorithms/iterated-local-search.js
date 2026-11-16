// Iterated local search: climb with hill climbing until stuck (a local optimum). Then kick the
// accepted local optimum with problem.perturb and climb again. Keep the new optimum only if it is better.
HFG.registerAlgorithm({
  slug: "iterated-local-search",
  supports: ["terrain", "tsp"],
  maxSteps: { terrain: 400, tsp: 300 },
  params: {
    terrain: [{ key: "strength", label: "踢的力道", min: 0.1, max: 4, step: 0.1, value: 1.5 }],
    tsp: [{ key: "strength", label: "踢的力道（double-bridge 次數）", min: 1, max: 6, step: 1, value: 3 }],
  },
  pseudo: [
    "s ← 隨機起點；據點 ← 還沒有（據點：目前最好的那個山頂）",
    "重複（直到步數用完）：",
    "  爬山一步：s 有比較好的鄰居，就走到最好的那個",
    "  如果沒有比較好的鄰居（s 到了山頂）：",
    "    如果 s 比據點好（或還沒有據點）：據點 ← s",
    "    s ← 把據點踢一下（隨機改一大步），從那裡再爬",
  ],

  init(problem, params, rng, t) {
    const s = problem.random(rng);
    const sc = problem.score(s);
    t(1, problem.display(s), { pick: s, labels: [{ at: s, text: "s" }] });
    return {
      best: s, bestScore: sc, current: s, home: null, homeScore: -Infinity, kicks: 0,
      points: [s], trail: [s], note: "隨機選一個起點，先用爬山法往上爬。", done: false,
    };
  },

  step(state, problem, params, rng, t) {
    const cur = state.current;
    const S = { at: cur, text: "s" };
    const home = () => (state.home ? [{ at: state.home, text: "據點" }] : []);
    t(2, state.home ? `據點 ${problem.display(state.home)}` : "還沒有據點", { pick: cur, labels: [S, ...home()] });
    const neighbors = problem.neighbors(cur);
    let next = null, nextScore = problem.score(cur);
    for (const nb of neighbors) {
      const sc = problem.score(nb);
      if (sc > nextScore) { next = nb; nextScore = sc; }
    }
    if (next) {
      t(3, `往上爬到 ${problem.display(next)}`, { cands: neighbors, from: cur, pick: next, labels: [S, ...home()] });
      state.current = next;
      state.note = `爬山中：${problem.display(next)}。`;
    } else {
      t(3, "四周都沒有更好的", { cands: neighbors, pick: cur, labels: [S, ...home()] });
      // Local optimum reached: accept it if better than the current home, then kick from home.
      const here = cur, hereScore = problem.score(here);
      t(4, `到山頂了：${problem.display(here)}`, { pick: here, labels: [S, ...home()] });
      let verdict, say;
      if (hereScore > state.homeScore) {
        verdict = state.home ? "這個山頂比較好，換成新的據點" : "爬到第一個山頂，當成據點";
        say = state.home ? "比據點好 → 換成新據點" : "第一個山頂 → 當成據點";
        state.home = here; state.homeScore = hereScore;
      } else {
        verdict = "這個山頂沒有比較好，回到原本的據點";
        say = "沒有比據點好 → 據點不變";
      }
      t(5, say, { pick: state.home, labels: home() });
      state.kicks++;
      state.current = problem.perturb(state.home, rng, params.strength);
      t(6, `踢一下（第 ${state.kicks} 次）→ ${problem.display(state.current)}`,
        { from: state.home, pick: state.current, labels: [...home(), { at: state.current, text: "s" }] });
      state.note = `${verdict}，然後踢一下（第 ${state.kicks} 次），從新位置再爬。`;
    }
    state.points = [state.current];
    if (problem.kind === "terrain") state.trail.push(state.current);
    const sc = problem.score(state.current);
    if (sc > state.bestScore) { state.best = state.current; state.bestScore = sc; }
  },
});
