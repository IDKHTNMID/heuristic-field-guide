// terrain.js — continuous 2D terrain: find the highest point.
// A solution is a point {x, y} with both coordinates in [0, 1]. Score = height, scaled so the
// global peak of every map is 1.0.
(function () {
  "use strict";
  const HFG = window.HFG;

  const STEP = 0.02;          // grid step used by neighbors() and key()
  const NEIGHBOR_SIGMA = 0.05; // random neighbor (SA)
  const MUTATE_SIGMA = 0.05;   // mutation (GA)
  const PERTURB_SIGMA = 0.12;  // one unit of perturbation strength (ILS)
  const SCAN = 200;            // grid resolution used to find the global peak

  // Each map is a sum of Gaussian bumps: [cx, cy, height, width].
  function manyPeaks() {
    const rng = HFG.rng(20261116);
    const bumps = [[0.78, 0.22, 1.0, 0.05]];
    for (let i = 0; i < 13; i++) {
      bumps.push([0.08 + rng() * 0.84, 0.08 + rng() * 0.84, 0.35 + rng() * 0.45, 0.06 + rng() * 0.06]);
    }
    return bumps;
  }
  const MAPS = [
    { id: "three-peaks", name: "三座山", bumps: [[0.25, 0.68, 0.72, 0.13], [0.76, 0.30, 1.0, 0.07], [0.72, 0.80, 0.85, 0.10]] },
    { id: "many-peaks", name: "群峰", bumps: manyPeaks() },
  ];

  function rawHeight(bumps, x, y) {
    let h = 0;
    for (const [cx, cy, hh, w] of bumps) {
      const dx = x - cx, dy = y - cy;
      h += hh * Math.exp(-(dx * dx + dy * dy) / (2 * w * w));
    }
    return h;
  }

  function create(mapId) {
    const map = MAPS.find((m) => m.id === mapId) || MAPS[0];
    let top = 0, peak = { x: 0, y: 0 };
    for (let i = 0; i <= SCAN; i++) {
      for (let j = 0; j <= SCAN; j++) {
        const h = rawHeight(map.bumps, i / SCAN, j / SCAN);
        if (h > top) { top = h; peak = { x: i / SCAN, y: j / SCAN }; }
      }
    }
    // Refine between grid points so no point can score above 1.
    for (let d = 1 / SCAN; d > 1e-7; d /= 2) {
      let moved = true;
      while (moved) {
        moved = false;
        for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
          const q = { x: Math.min(1, Math.max(0, peak.x + dx)), y: Math.min(1, Math.max(0, peak.y + dy)) };
          const h = rawHeight(map.bumps, q.x, q.y);
          if (h > top) { top = h; peak = q; moved = true; }
        }
      }
    }
    const clamp = (p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) });
    const score = (p) => rawHeight(map.bumps, p.x, p.y) / top;
    const jitter = (p, sigma, rng) => clamp({ x: p.x + sigma * HFG.gauss(rng), y: p.y + sigma * HFG.gauss(rng) });

    return {
      kind: "terrain",
      mapId: map.id,
      mapName: map.name,
      peak,                                   // for drawing only; algorithms must not read it
      score,
      display: (p) => "高度 " + score(p).toFixed(3),
      random: (rng) => ({ x: rng(), y: rng() }),
      neighbors(p) {
        const out = [];
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx || dy) out.push(clamp({ x: p.x + dx * STEP, y: p.y + dy * STEP }));
          }
        }
        return out;
      },
      neighbor: (p, rng) => jitter(p, NEIGHBOR_SIGMA, rng),
      perturb: (p, rng, strength = 1) => jitter(p, PERTURB_SIGMA * strength, rng),
      crossover(a, b, rng) {
        const t = rng();
        return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      },
      mutate: (p, rng) => jitter(p, MUTATE_SIGMA, rng),
      key: (p) => Math.round(p.x / STEP) + "," + Math.round(p.y / STEP),
      clamp,
    };
  }

  HFG.registerProblem({
    kind: "terrain",
    maps: MAPS.map((m) => ({ id: m.id, name: m.name })),
    create,
  });
})();
