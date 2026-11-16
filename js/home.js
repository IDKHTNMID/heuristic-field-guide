// home.js — builds the homepage from js/registry.js: counter, filter buttons and one card per entry.
// Every ready card gets a thumbnail made by actually running the algorithm (default params, seed 1);
// it replays when the card scrolls into view or is hovered. The hero map takes turns running each
// ready algorithm live. With reduced motion, both just show the final state.
(function () {
  "use strict";
  const HFG = window.HFG;
  const THUMB_SEED = 1;
  const THUMB_SECONDS = 2.6;     // one thumbnail replay
  const HERO_SECONDS = 6;        // one hero run
  const HERO_HOLD = 1.4;         // pause on the result before the next algorithm
  const HERO_MAPS = { terrain: "many-peaks", tsp: "random-20" };
  // Thumbnails take turns between the two terrain maps so the grid does not show the same picture nine
  // times. TSP thumbnails look alike from algorithm to algorithm (a road through the same cities), so only
  // an algorithm that cannot run terrain gets one (it falls back to its first supported problem).
  const THUMB_VIEWS = [["terrain", "three-peaks"], ["terrain", "many-peaks"]];
  // The homepage groups cards by track (AGENTS.md section 4.2).
  const GROUPS = [
    { track: "basic", title: (n) => `入門課常教的 ${n} 種` },
    { track: "extended", title: () => "課外延伸" },
  ];
  const esc = HFG.esc;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error("無法載入 " + src));
    document.head.appendChild(el);
  });

  function card(e) {
    const inner = `
      <span class="no">${e.no}</span>
      ${e.status === "ready" ? `<span class="screen"><canvas class="thumb" data-thumb="${e.slug}" aria-hidden="true"></canvas></span>` : ""}
      <h3>${esc(e.name)}</h3>
      <div class="en">${esc(e.en)}</div>
      <p>${esc(e.line)}</p>
      <div class="tags">${HFG.tagsHtml(e)}</div>`;
    return e.status === "ready"
      ? `<a class="card ${e.family}" href="algorithms/${e.slug}.html" data-supports="${e.supports.join(" ")}">${inner}</a>`
      : `<div class="card planned" data-supports="${e.supports.join(" ")}"><span class="badge">預告</span>${inner}
           <p class="muted small">還在新增中：會照 <code>AGENTS.md</code> 的規則加進來。</p></div>`;
  }

  // One live run of an algorithm; the last mark it reported is kept so the highlight can pulse.
  function makeRun(algo, kind, mapId, seed) {
    const problem = HFG.problems[kind].create(mapId);
    const params = HFG.defaultParams(algo, kind);
    const rng = HFG.rng(seed);
    const run = { problem, steps: 0, max: algo.maxSteps[kind], mark: null };
    const t = (line, say, mark) => { if (mark) run.mark = mark; };
    run.state = algo.init(problem, params, rng, t);
    run.finished = () => run.state.done || run.steps >= run.max;
    run.advanceTo = (target) => {
      while (run.steps < target && !run.finished()) { algo.step(run.state, problem, params, rng, t); run.steps++; }
    };
    return run;
  }

  // A single animation loop shared by every moving canvas on the page.
  const movers = new Set();
  let raf = 0;
  function loop(now) {
    raf = 0;
    for (const m of [...movers]) if (!m(now)) movers.delete(m);
    if (movers.size && !document.hidden) raf = requestAnimationFrame(loop);
  }
  function animate(mover) {
    movers.add(mover);
    if (!raf) raf = requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && movers.size && !raf) raf = requestAnimationFrame(loop); });

  function thumb(e, turn) {
    const canvas = document.querySelector(`[data-thumb="${e.slug}"]`);
    const algo = HFG.algorithms[e.slug];
    if (!canvas || !algo) return;
    const views = THUMB_VIEWS.map((_, k) => THUMB_VIEWS[(turn + k) % THUMB_VIEWS.length]);
    const [kind, mapId] = views.find(([k]) => algo.supports.includes(k)) || [algo.supports[0], HFG.problems[algo.supports[0]].maps[0].id];
    let run = null;
    const paint = () => { HFG.fitCanvas(canvas, 1); HFG.draw(canvas, run.problem, run.state); };
    const replay = () => {
      run = makeRun(algo, kind, mapId, THUMB_SEED);
      if (HFG.reducedMotion()) { run.advanceTo(run.max); paint(); return; }
      const start = performance.now();
      animate((now) => {
        const k = Math.min(1, (now - start) / 1000 / THUMB_SECONDS);
        run.advanceTo(Math.ceil(k * run.max));
        paint();
        return !run.finished() && k < 1;
      });
    };
    run = makeRun(algo, kind, mapId, THUMB_SEED);
    run.advanceTo(run.max);       // first paint shows the finished run until the card is seen
    paint();
    let seen = false;
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(([en]) => { if (en.isIntersecting && !seen) { seen = true; io.disconnect(); replay(); } });
      io.observe(canvas);
    }
    canvas.closest(".card").addEventListener("mouseenter", () => { if (run.finished()) replay(); });
    window.addEventListener("resize", () => run && paint());
  }

  function hero(ready) {
    const canvas = document.getElementById("hero-canvas");
    const link = document.getElementById("hero");
    if (!canvas || !ready.length) return;
    const nameEl = document.getElementById("hero-name"), scoreEl = document.getElementById("hero-score");
    const bar = document.getElementById("hero-bar");
    let i = 0, run = null, start = 0, entry = null;
    const begin = (now) => {
      entry = ready[i % ready.length];
      const algo = HFG.algorithms[entry.slug];
      const kind = algo.supports.includes("terrain") && i % 3 !== 2 ? "terrain" : algo.supports[algo.supports.length - 1];
      run = makeRun(algo, kind, HERO_MAPS[kind], 2 + (i % 5));
      start = now;
      link.href = `algorithms/${entry.slug}.html`;
      nameEl.innerHTML = `<span class="no">${entry.no}</span>${esc(entry.name)}`;
    };
    const paint = (now) => {
      HFG.fitCanvas(canvas, 1);
      HFG.draw(canvas, run.problem, run.state, run.mark, { phase: HFG.reducedMotion() ? null : now });
      scoreEl.textContent = run.problem.display(run.state.best);
    };
    begin(performance.now());
    if (HFG.reducedMotion()) { run.advanceTo(run.max); paint(null); return; }
    animate((now) => {
      const sec = (now - start) / 1000;
      const k = Math.min(1, sec / HERO_SECONDS);
      run.advanceTo(Math.ceil(k * run.max));
      bar.style.width = (100 * (run.finished() ? 1 : k)) + "%";
      paint(now);
      if ((run.finished() && sec > 1.5) || k >= 1) {
        if (!run.holdFrom) run.holdFrom = now;
        if ((now - run.holdFrom) / 1000 > HERO_HOLD) { i++; begin(now); }
      }
      return true;
    });
    window.addEventListener("resize", () => paint(performance.now()));
  }

  function countUp(el, n) {
    if (HFG.reducedMotion()) { el.textContent = String(n).padStart(2, "0"); return; }
    const start = performance.now();
    animate((now) => {
      const k = Math.min(1, (now - start) / 900);
      el.textContent = String(Math.round(n * (1 - Math.pow(1 - k, 3)))).padStart(2, "0");
      return k < 1;
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const list = HFG.registry;
    const ready = list.filter((e) => e.status === "ready");
    countUp(document.getElementById("count"), ready.length);
    const grid = document.getElementById("grid");
    grid.innerHTML = GROUPS.map((g) => {
      const entries = list.filter((e) => e.track === g.track);
      return entries.length ? `<section class="group"><h2>${esc(g.title(entries.length))}</h2><div class="grid">${entries.map(card).join("")}</div></section>` : "";
    }).join("");
    HFG.reveal && HFG.reveal(grid.querySelectorAll(".card"));

    // Page switch (js/backdrop.js): the card, the hero or the title tile grows into the next page's header.
    if (HFG.morphFrom) {
      grid.addEventListener("click", (ev) => { const c = ev.target.closest("a.card"); if (c) HFG.morphFrom(c); });
      document.getElementById("hero").addEventListener("click", (ev) => HFG.morphFrom(ev.currentTarget));
      document.getElementById("start").addEventListener("click", () => HFG.morphFrom(document.getElementById("title-tile")));
    }

    document.querySelectorAll("[data-filter]").forEach((btn) => btn.addEventListener("click", () => {
      const f = btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      grid.querySelectorAll(".card").forEach((c) => {
        c.hidden = f !== "all" && !c.dataset.supports.split(" ").includes(f);
      });
      grid.querySelectorAll(".group").forEach((g) => { g.hidden = !g.querySelector(".card:not([hidden])"); });
    }));

    const loaded = [];
    for (const [turn, e] of ready.entries()) {
      try {
        await loadScript(`js/algorithms/${e.slug}.js`);
        thumb(e, turn);
        loaded.push(e);
      } catch (err) {
        const c = document.querySelector(`[data-thumb="${e.slug}"]`);
        if (c) c.replaceWith(Object.assign(document.createElement("p"), { className: "demo-error", textContent: err.message }));
        console.error(err);
      }
    }
    hero(loaded);
  });
})();
