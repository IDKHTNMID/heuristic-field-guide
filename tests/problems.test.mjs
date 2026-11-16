// Tests for the problem objects themselves (js/problems/). Run with `node --test` from the repo root.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadSite } from "./checks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { HFG } = loadSite(ROOT, { algorithms: [] });

const rotate = (t, k) => t.slice(k).concat(t.slice(0, k));

for (const map of HFG.problems.tsp.maps) {
  test(`tsp ${map.id}: the same cycle (rotated or reversed) has exactly the same score`, () => {
    const p = HFG.problems.tsp.create(map.id);
    const rng = HFG.rng(1);
    for (let trial = 0; trial < 50; trial++) {
      const t = p.random(rng);
      const s = p.score(t);
      for (let k = 0; k < p.n; k++) {
        assert.equal(p.score(rotate(t, k)), s);
        assert.equal(p.score(rotate(t.slice().reverse(), k)), s);
      }
    }
  });

  test(`tsp ${map.id}: no 2-opt neighbor that is the same cycle looks better`, () => {
    const p = HFG.problems.tsp.create(map.id);
    const rng = HFG.rng(2);
    for (let trial = 0; trial < 30; trial++) {
      const t = p.random(rng);
      for (const nb of p.neighbors(t)) {
        if (p.key(nb) === p.key(t)) assert.ok(!(p.score(nb) > p.score(t)));
      }
    }
  });
}
