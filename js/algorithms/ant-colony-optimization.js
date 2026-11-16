// Ant colony optimization (Ant System variant): one step = every ant builds a full tour.
// Next city j is chosen with weight tau(i,j)^alpha * (1 / d(i,j))^beta. Then pheromone evaporates
// by rho and every ant deposits 1 / (its tour length) on the edges it used.
// The trace shows the first ant's first choice in detail, then one line per phase.
(function () {
  "use strict";

  // Pheromone edges for drawing: 0 = the weakest edge, 1 = the strongest. When every edge is equal
  // (before the first round) nothing is drawn, so the map starts with just the cities.
  function edgesOf(tau, n) {
    let max = -Infinity, min = Infinity;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { max = Math.max(max, tau[i][j]); min = Math.min(min, tau[i][j]); }
    const out = [];
    if (!(max > min)) return out;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const w = (tau[i][j] - min) / (max - min);
        if (w > 0.05) out.push({ a: i, b: j, w });
      }
    }
    return out;
  }

  const pct = (q) => (q < 0.005 ? "<1%" : `${Math.round(q * 100)}%`);

  HFG.registerAlgorithm({
    slug: "ant-colony-optimization",
    supports: ["tsp"],
    maxSteps: { tsp: 80 },
    params: {
      tsp: [
        { key: "ants", label: "螞蟻數量", min: 1, max: 40, step: 1, value: 20 },
        { key: "alpha", label: "費洛蒙權重 α", min: 0, max: 5, step: 0.1, value: 1 },
        { key: "beta", label: "距離權重 β", min: 0, max: 8, step: 0.1, value: 3 },
        { key: "rho", label: "蒸發率 ρ", min: 0.01, max: 0.99, step: 0.01, value: 0.3 },
      ],
    },
    pseudo: [
      "每兩座城市之間的路，費洛蒙都設成一樣多",
      "每一輪（直到步數用完）：",
      "  每隻螞蟻：從隨機一座城市出發，走完一圈",
      "    重複到每座城都去過：從還沒去的城抽下一站，抽到的機率和 費洛蒙^α ×（1/距離）^β 成正比",
      "  蒸發：每條路的費洛蒙都 ×（1 − ρ）",
      "  每隻螞蟻在自己走過的每條路上，加 1 / 路線長 的費洛蒙",
      "  找出這一輪最短的路線；比紀錄還短就記下來",
    ],

    init(problem, params, rng, t) {
      const n = problem.n;
      // Pheromone starts equal on every edge, sized from a greedy nearest-neighbor tour.
      const nn = [0], left = new Set([...Array(n).keys()].slice(1));
      while (left.size) {
        const i = nn[nn.length - 1];
        let j = -1;
        for (const c of left) if (j < 0 || problem.dist(i, c) < problem.dist(i, j)) j = c;
        nn.push(j); left.delete(j);
      }
      const tau0 = params.ants / -problem.score(nn);
      const tau = [...Array(n)].map(() => new Array(n).fill(tau0));
      const s = problem.random(rng);
      t(1, `每條路都是 ${tau0.toFixed(3)}`);
      return {
        best: s, bestScore: problem.score(s), current: null, tau, iter: 0,
        points: [], edges: edgesOf(tau, n),
        note: "每條路上的費洛蒙一樣多，螞蟻還沒出發。（目前最短路線先放一條隨機的）", done: false,
      };
    },

    step(state, problem, params, rng, t) {
      const n = problem.n, tau = state.tau;
      t(2, `第 ${state.iter + 1} 輪：${params.ants} 隻螞蟻出發`);
      const tours = [];
      for (let a = 0; a < params.ants; a++) {
        const first = a === 0;
        const tour = [HFG.randInt(rng, n)];
        if (first) t(3, `第 1 隻從 ${tour[0]} 號城市出發`, { path: [tour[0]], labels: [{ at: tour[0], text: "起點" }] });
        const visited = new Array(n).fill(false);
        visited[tour[0]] = true;
        for (let k = 1; k < n; k++) {
          const i = tour[k - 1];
          const w = [];
          let total = 0;
          for (let j = 0; j < n; j++) {
            const v = visited[j] ? 0 : Math.pow(tau[i][j], params.alpha) * Math.pow(1 / problem.dist(i, j), params.beta);
            w.push(v); total += v;
          }
          let r = rng() * total, j = 0;
          while (j < n - 1 && (visited[j] || r > w[j])) { r -= w[j]; j++; }
          if (visited[j]) j = visited.indexOf(false);   // guards against rounding at the end of the wheel
          if (first && k === 1) {
            const top = w.map((v, c) => [v / total, c]).sort((x, y) => y[0] - x[0]).slice(0, 3);
            t(4, `機率最高：${top.map(([q, c]) => `${c} 號 ${pct(q)}`).join("、")}，抽到 ${j} 號`,
              { path: [i, j], labels: top.map(([q, c]) => ({ at: c, text: `${c} 號 ${pct(q)}` })) });
          }
          tour.push(j); visited[j] = true;
        }
        if (first) t(4, `第 1 隻走完一圈：${problem.display(tour)}`, { path: [...tour, tour[0]] });
        tours.push(tour);
      }
      if (params.ants > 1) t(3, `其他 ${params.ants - 1} 隻也照樣走完一圈`, { cands: tours.slice(1) });
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) tau[i][j] *= 1 - params.rho;
      t(5, `每條路都乘上 ${(1 - params.rho).toFixed(2)}`);
      let iterBest = tours[0];
      for (const tr of tours) {
        const len = -problem.score(tr);
        for (let k = 0; k < n; k++) {
          const a = tr[k], b = tr[(k + 1) % n];
          tau[a][b] += 1 / len; tau[b][a] += 1 / len;
        }
        if (problem.score(tr) > problem.score(iterBest)) iterBest = tr;
      }
      state.iter++;
      state.current = iterBest;
      state.points = tours;
      state.edges = edgesOf(tau, n);
      t(6, "路線越短，留下的越多（紫線變粗）");
      const sc = problem.score(iterBest);
      const better = sc > state.bestScore;
      if (better) { state.best = iterBest; state.bestScore = sc; }
      t(7, `這輪最短 ${problem.display(iterBest)}${better ? "，刷新紀錄" : ""}`, { pick: iterBest });
      state.note = `第 ${state.iter} 輪：${params.ants} 隻螞蟻各走完一圈，這輪最短 ${problem.display(iterBest)}` +
        (better ? "，刷新紀錄。" : "。") + "紫線越粗代表費洛蒙越多。";
    },
  });
})();
