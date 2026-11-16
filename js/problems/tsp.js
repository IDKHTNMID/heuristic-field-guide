// tsp.js — travelling salesman: visit every city once and return, shortest tour wins.
// A solution is an array of city indices (a permutation). Score = -(tour length).
// Cities live in a 100 x 100 square.
(function () {
  "use strict";
  const HFG = window.HFG;
  const SIZE = 100;

  function randomCities(n, seed) {
    const rng = HFG.rng(seed);
    const out = [];
    for (let i = 0; i < n; i++) out.push({ x: 5 + rng() * (SIZE - 10), y: 5 + rng() * (SIZE - 10) });
    return out;
  }
  function ringCities(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      out.push({ x: SIZE / 2 + 40 * Math.cos(a), y: SIZE / 2 + 40 * Math.sin(a) });
    }
    return out;
  }
  const MAPS = [
    { id: "random-20", name: "隨機 20 城", cities: () => randomCities(20, 7) },
    { id: "ring-16", name: "圓環 16 城", cities: () => ringCities(16) },
  ];

  // Reverse tour[i..j] (inclusive). This is one 2-opt move.
  function reversed(tour, i, j) {
    const t = tour.slice();
    while (i < j) { [t[i], t[j]] = [t[j], t[i]]; i++; j--; }
    return t;
  }

  function create(mapId) {
    const map = MAPS.find((m) => m.id === mapId) || MAPS[0];
    const cities = map.cities();
    const n = cities.length;
    const D = cities.map((a) => cities.map((b) => Math.hypot(a.x - b.x, a.y - b.y)));
    // Walk the cycle from city 0, towards the smaller-numbered neighbour, so the same cycle always adds up
    // in the same order. Otherwise a rotated or reversed copy can differ in the last digit and look "better".
    const length = (t) => {
      const start = t.indexOf(0);
      const dir = t[(start + 1) % n] < t[(start - 1 + n) % n] ? 1 : -1;
      let s = 0;
      for (let k = 0, i = start; k < n; k++) {
        const next = (i + dir + n) % n;
        s += D[t[i]][t[next]];
        i = next;
      }
      return s;
    };
    const randomPair = (rng) => {
      let i = HFG.randInt(rng, n), j = HFG.randInt(rng, n - 1);
      if (j >= i) j++;
      return i < j ? [i, j] : [j, i];
    };

    return {
      kind: "tsp",
      mapId: map.id,
      mapName: map.name,
      cities,                                  // for drawing only; algorithms use dist() and n
      n,
      dist: (i, j) => D[i][j],
      score: (t) => -length(t),
      display: (t) => "路線長 " + length(t).toFixed(1),
      random: (rng) => HFG.shuffle([...Array(n).keys()], rng),
      neighbors(t) {
        const out = [];
        for (let i = 1; i < n - 1; i++) {
          for (let j = i + 1; j < n; j++) out.push(reversed(t, i, j));
        }
        return out;
      },
      neighbor(t, rng) {
        const [i, j] = randomPair(rng);
        return reversed(t, i, j);
      },
      // Double-bridge: cut the tour into A|B|C|D and reconnect as A|C|B|D. Repeat `strength` times.
      perturb(t, rng, strength = 1) {
        let out = t.slice();
        for (let k = 0; k < Math.max(1, Math.round(strength)); k++) {
          const cuts = [];
          while (cuts.length < 3) {
            const c = 1 + HFG.randInt(rng, n - 1);
            if (!cuts.includes(c)) cuts.push(c);
          }
          cuts.sort((a, b) => a - b);
          const [p, q, r] = cuts;
          out = out.slice(0, p).concat(out.slice(q, r), out.slice(p, q), out.slice(r));
        }
        return out;
      },
      // Order crossover (OX): copy a slice from parent a, fill the rest in parent b's order.
      crossover(a, b, rng) {
        const [i, j] = randomPair(rng);
        const child = new Array(n).fill(-1);
        const used = new Set();
        for (let k = i; k <= j; k++) { child[k] = a[k]; used.add(a[k]); }
        let pos = (j + 1) % n;
        for (let k = 0; k < n; k++) {
          const c = b[(j + 1 + k) % n];
          if (used.has(c)) continue;
          child[pos] = c;
          pos = (pos + 1) % n;
        }
        return child;
      },
      // Reverse a random stretch of the tour (same move as one random 2-opt).
      mutate(t, rng) {
        const [i, j] = randomPair(rng);
        return reversed(t, i, j);
      },
      // Same tour regardless of starting city or direction -> same key.
      key(t) {
        const s = t.indexOf(0);
        const fwd = [], back = [];
        for (let k = 0; k < n; k++) {
          fwd.push(t[(s + k) % n]);
          back.push(t[(s - k + n) % n]);
        }
        return (fwd[1] < back[1] ? fwd : back).join("-");
      },
    };
  }

  HFG.registerProblem({
    kind: "tsp",
    maps: MAPS.map((m) => ({ id: m.id, name: m.name })),
    create,
  });
})();
