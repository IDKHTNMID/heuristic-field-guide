// demo.js — builds the interactive panel inside every <div class="demo" data-algorithm="<slug>">.
// The code panel is drawn from algo.pseudo; the algorithm reports each line it runs through
// t(line, say, mark) (AGENTS.md section 5), so the highlighted line, the caption and the map always
// come from the same run. "← 上一行" / "← 退一步" go back by running again from the seed (same seed,
// same result), so nothing has to be stored per line. Also wires every [data-set] button on the page
// ("套用這組設定") to that panel.
(function () {
  "use strict";
  const HFG = window.HFG;
  const RUN_SECONDS = { slow: 24, normal: 8, fast: 3 };    // whole-step mode: time for a full maxSteps run
  const LINE_SECONDS = { slow: 1.6, normal: 0.8, fast: 0.3 }; // line mode: time per pseudocode line
  const SPEED_LABEL = { slow: "慢", normal: "中", fast: "快" };
  const MODE_LABEL = { line: "一行一行", step: "一步一步" };
  const STEP_LABEL = { line: ["← 上一行", "下一行 →"], step: ["← 退一步", "走一步 →"] };
  const MAX_FRAME_SECONDS = 0.25;                            // cap per frame so a hidden tab does not jump ahead
  const GLIDE_MS = 420;                                      // how long points glide to their new place (both ways)
  // Terrain: a best height this high is on the highest peak (the second-highest peaks: three-peaks 0.851, many-peaks 0.601).
  const GOAL = 0.95;
  const MISSION = { terrain: "任務：找到最高的那座山（旗子那裡）。", tsp: "任務：每座城市去一次，路線越短越好。" };
  const BANNER_HOLD_MS = 1800;                               // step mode: "found it" hides itself while the run goes on
  const BURST = { n: 36, frames: 40, extra: 20 };            // the square burst when the peak is found
  const FRAME_MS = 1000 / 60;

  const esc = HFG.esc;
  const decimals = (step) => (String(step).split(".")[1] || "").length;
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  function buildDemo(root) {
    const slug = root.dataset.algorithm;
    const algo = HFG.algorithms[slug];
    if (!algo) {
      root.innerHTML = `<p class="demo-error">找不到演算法程式 <code>js/algorithms/${esc(slug)}.js</code>，請確認頁面有載入它。</p>`;
      throw new Error("demo: algorithm not registered: " + slug);
    }
    if (!Array.isArray(algo.pseudo)) throw new Error("demo: algorithm has no pseudo: " + slug);
    const s = {
      kind: algo.supports[0],
      mapId: HFG.problems[algo.supports[0]].maps[0].id,
      seed: 1,
      params: {},
      speed: "normal",
      mode: "line",
      playing: false,
    };
    algo.supports.forEach((k) => { s.params[k] = HFG.defaultParams(algo, k); });

    root.innerHTML = `
      <div class="demo-top">
        <div class="seg" role="group" aria-label="問題">${algo.supports.map((k) =>
          `<button type="button" data-kind="${k}">${HFG.PROBLEM_LABEL[k]}</button>`).join("")}</div>
        <label class="field">地圖 <select class="demo-map-select"></select></label>
        <label class="field">種子 <input class="demo-seed" type="number" min="1" step="1" value="1" inputmode="numeric"></label>
      </div>
      <div class="demo-mission"><span class="tick" aria-hidden="true"></span><span class="mission-text"></span></div>
      <div class="demo-body">
        <div class="demo-stage">
          <div class="stage-box">
            <canvas class="demo-canvas" aria-label="演算法執行畫面"></canvas>
            <div class="demo-banner" role="status"></div>
          </div>
          <p class="demo-legend" aria-label="圖例"></p>
        </div>
        <div class="demo-side">
          <div class="demo-stats">
            <div><span>步數</span><b class="v-step">0</b><small class="v-max"></small></div>
            <div><span>試過幾個解</span><b class="v-evals">0</b></div>
            <div class="best"><span>目前最佳</span><b class="v-best"></b></div>
          </div>
          <div class="code-head">
            <span>虛擬碼 <small class="v-progress"></small></span>
            <div class="seg seg-mode" role="group" aria-label="播放方式">${Object.keys(MODE_LABEL).map((k) =>
              `<button type="button" data-mode="${k}">${MODE_LABEL[k]}</button>`).join("")}</div>
          </div>
          <ol class="code" aria-label="虛擬碼，黃底的是正在執行的那一行">${algo.pseudo.map((text, i) => `
            <li data-line="${i + 1}"><span class="ln">${i + 1}</span><span class="src" style="--ind:${text.length - text.trimStart().length}">${esc(text.trimStart())}</span><span class="say" aria-live="polite"></span></li>`).join("")}
          </ol>
          <div class="demo-buttons">
            <button type="button" class="btn-prev" aria-keyshortcuts="ArrowLeft"></button>
            <button type="button" class="btn-step" aria-keyshortcuts="ArrowRight"></button>
            <button type="button" class="btn-play">▶ 播放</button>
            <button type="button" class="btn-reset">重來</button>
          </div>
          <div class="demo-row">
            <div class="seg seg-speed" role="group" aria-label="播放速度">${Object.keys(RUN_SECONDS).map((k) =>
              `<button type="button" data-speed="${k}">${SPEED_LABEL[k]}</button>`).join("")}</div>
            <span class="demo-hint">鍵盤 <kbd>←</kbd> <kbd>→</kbd> 也可以</span>
          </div>
          <p class="demo-note" aria-live="polite"></p>
        </div>
      </div>
      <details class="demo-more">
        <summary>參數與收斂曲線</summary>
        <div class="demo-more-body">
          <div class="demo-params"></div>
          <canvas class="demo-chart" aria-label="收斂曲線"></canvas>
        </div>
      </details>`;

    const $ = (sel) => root.querySelector(sel);
    const canvas = $(".demo-canvas"), chart = $(".demo-chart");
    const banner = $(".demo-banner"), stageBox = $(".stage-box"), bestBox = $(".demo-stats .best");
    const lineEls = [...root.querySelectorAll(".code li")];
    let problem, state, rng, history, steps;
    let evals = 0, evalsBefore = 0, counting = false;   // how many solutions the algorithm has scored
    let events = [], cursor = 0, before = null;   // the events of the step on screen, and which one is shown
    let tween = null, drawn = null;               // { from: points[], start: ms }; the points last drawn
    let raf = 0, last = 0, carry = 0, visible = true;
    let seen = { reached: false, done: false };   // what the reader has already been told about
    let lastBest = -Infinity, bursts = [], bannerTimer = 0;

    const record = (line, say = "", mark = null) => { events.push({ line, say: String(say), mark }); };
    const atStepEnd = () => cursor >= events.length - 1;
    const finished = () => (state.done || steps >= algo.maxSteps[s.kind]) && atStepEnd();
    const canRunStep = () => !state.done && steps < algo.maxSteps[s.kind];
    const canPrev = () => steps > 0 || (s.mode === "line" && cursor > 0);
    // What the map shows: while a step's lines are being walked through, the state from before the step.
    const shownState = () => (before && !atStepEnd() ? before : state);
    const shownMark = () => (events[cursor] ? events[cursor].mark : null);
    const status = () => ({ reached: problem.kind === "terrain" && shownState().bestScore >= GOAL, done: finished() });

    function renderParams() {
      const defs = algo.params[s.kind] || [];
      $(".demo-params").innerHTML = defs.length ? defs.map((p) => `
        <label class="param">
          <span class="param-head"><span>${esc(p.label)}</span><output data-out="${p.key}">${s.params[s.kind][p.key]}</output></span>
          <input type="range" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${s.params[s.kind][p.key]}">
        </label>`).join("") : `<p class="muted">沒有可調的參數，換種子看看起點不同會怎樣。</p>`;
      $(".demo-params").querySelectorAll("input[type=range]").forEach((input) => {
        input.addEventListener("input", () => {
          const def = defs.find((d) => d.key === input.dataset.key);
          const v = Number(Number(input.value).toFixed(decimals(def.step)));
          s.params[s.kind][def.key] = v;
          $(`[data-out="${def.key}"]`).textContent = v;
          reset();
        });
      });
    }

    function renderControls() {
      root.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === s.kind)));
      root.querySelectorAll("[data-speed]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.speed === s.speed)));
      root.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === s.mode)));
      $(".demo-map-select").innerHTML = HFG.problems[s.kind].maps.map((m) =>
        `<option value="${m.id}"${m.id === s.mapId ? " selected" : ""}>${esc(m.name)}</option>`).join("");
      $(".demo-seed").value = s.seed;
      $(".mission-text").textContent = MISSION[s.kind];
      root.classList.toggle("mode-line", s.mode === "line");
      renderParams();
    }

    // ---------- drawing ----------
    function drawStage(now) {
      HFG.fitCanvas(canvas, 1);
      const shown = shownState();
      let points = null;
      if (tween) {
        const k = (now - tween.start) / GLIDE_MS;
        if (k >= 1 || tween.from.length !== shown.points.length) tween = null;
        else {
          const e = easeInOut(Math.max(0, k));
          points = shown.points.map((p, i) => ({ x: tween.from[i].x + (p.x - tween.from[i].x) * e, y: tween.from[i].y + (p.y - tween.from[i].y) * e }));
        }
      }
      drawn = (points || shown.points).slice();
      HFG.draw(canvas, problem, shown, shownMark(), { phase: HFG.reducedMotion() ? null : now, points });
      drawBursts(now);
    }

    // Glide from what is on screen now to whatever the next frame shows (terrain only; TSP draws no points).
    function glide(now) {
      if (drawn && problem.kind === "terrain" && !HFG.reducedMotion()) tween = { from: drawn, start: now };
    }

    function legend(shown) {
      const items = s.kind === "terrain"
        ? [shown.points.length > 2 ? ["k-dot", "族群（一個點一個解）"] : ["k-s", "目前的解"], ["k-best", "目前最佳"], ["k-flag", "最高峰"],
          ...(shown.trail ? [["k-trail", "走過的路"]] : []), ["k-cand", "正在比較的"], ["k-pick", "選中的"]]
        : [...(shown.current ? [["k-line", "目前的路線"]] : []), ["k-best-line", "目前最短"], ...(shown.edges ? [["k-phero", "費洛蒙"]] : []),
          ["k-city", "城市"], ["k-cand-line", "正在比較的"], ["k-pick-line", "選中的"], ["k-cut", "拿掉的"]];
      // The terrain and the flag are drawn for the reader; say so, since the algorithm sees neither.
      const note = s.kind === "terrain"
        ? `<span class="demo-legend-note">地圖是畫給你看的：演算法看不到地形和旗子，只知道它問過的點有多高。</span>` : "";
      return items.map(([k, text]) => `<span><i class="${k}"></i>${text}</span>`).join("") + note;
    }

    function drawInfo() {
      HFG.fitCanvas(chart, 0.5);
      HFG.drawChart(chart, history, s.kind, algo.maxSteps[s.kind]);
      const shown = shownState();
      const midStep = before && !atStepEnd();     // the numbers should not give away the end of the step
      $(".v-step").textContent = midStep ? steps - 1 : steps;
      $(".v-max").textContent = " / " + algo.maxSteps[s.kind];
      $(".v-best").textContent = problem.display(shown.best);
      $(".v-evals").textContent = (midStep ? evalsBefore : evals).toLocaleString("en-US");
      $(".v-progress").textContent = s.mode === "line" && events.length
        ? `${steps === 0 ? "開始前" : `第 ${steps} 步`}・第 ${cursor + 1}／${events.length} 行` : "";
      lineEls.forEach((li) => { li.classList.remove("on", "done"); li.querySelector(".say").textContent = ""; });
      events.slice(0, cursor).forEach((e) => lineEls[e.line - 1] && lineEls[e.line - 1].classList.add("done"));
      const ev = events[cursor];
      if (ev && lineEls[ev.line - 1]) {
        const li = lineEls[ev.line - 1];
        li.classList.add("on");
        li.querySelector(".say").textContent = ev.say;
      }
      $(".demo-legend").innerHTML = legend(shown);
      const st = status();
      const missionDone = s.kind === "terrain" ? st.reached : st.done;
      $(".demo-mission").classList.toggle("done", missionDone);
      $(".demo-mission .tick").textContent = missionDone ? "✓" : "";
      $(".demo-note").textContent = s.mode === "step" || st.done ? state.note + (st.done ? "（結束）" : "") : "";
      const [prevText, stepText] = STEP_LABEL[s.mode];
      $(".btn-prev").textContent = prevText;
      $(".btn-step").textContent = stepText;
      $(".btn-play").textContent = s.playing ? "❚❚ 暫停" : "▶ 播放";
      $(".btn-prev").disabled = !canPrev();
      $(".btn-play").disabled = $(".btn-step").disabled = st.done;
      $(".btn-play").classList.toggle("primary", s.mode !== "line");     // line mode is driven by "next line"
      $(".btn-step").classList.toggle("primary", s.mode === "line");
    }

    // ---------- feedback: the mission bar, the banner over the map, the burst ----------
    function hideBanner() {
      clearTimeout(bannerTimer);
      banner.classList.remove("show", "fail");
    }
    function showBanner(html, fail) {
      clearTimeout(bannerTimer);
      banner.innerHTML = html;
      banner.classList.toggle("fail", !!fail);
      // Keep the banner off the best point: a point in the upper half puts the banner low.
      banner.classList.toggle("low", problem.kind === "terrain" && shownState().best.y < 0.5);
      banner.classList.add("show");
    }
    function celebrate(now) {
      if (HFG.reducedMotion()) return;
      stageBox.classList.remove("lift");
      void stageBox.offsetWidth;
      stageBox.classList.add("lift");
      const u = canvas.width / 360, best = shownState().best;
      bursts = Array.from({ length: BURST.n }, (_, i) => {
        const a = (i / BURST.n) * Math.PI * 2, v = (4 + Math.random() * 5) * u;
        return { p: best, born: now, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3 * u, r: (3 + Math.random() * 4) * u,
          life: BURST.frames + Math.random() * BURST.extra, spin: (Math.random() - 0.5) * 0.4, color: i % 5 };
      });
    }
    function drawBursts(now) {
      if (!bursts.length) return;
      const ctx = canvas.getContext("2d"), C = HFG.palette(), u = canvas.width / 360;
      const colors = [C.yellow, C.coral, C.teal, C.lilac, C.surface];
      bursts = bursts.filter((b) => (now - b.born) / FRAME_MS < b.life);
      for (const b of bursts) {
        const f = (now - b.born) / FRAME_MS, [x0, y0] = HFG.mapPoint(canvas, b.p);
        ctx.save();
        ctx.translate(x0 + b.vx * f, y0 + b.vy * f + 0.15 * u * f * f);
        ctx.rotate(b.spin * f);
        ctx.globalAlpha = Math.min(1, (b.life - f) / 15);
        ctx.fillStyle = colors[b.color];
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2 * u;
        ctx.fillRect(-b.r, -b.r, 2 * b.r, 2 * b.r);
        ctx.strokeRect(-b.r, -b.r, 2 * b.r, 2 * b.r);
        ctx.restore();
      }
    }

    // After every move: bump the best box when the best got better, and tell the reader when the
    // highest peak is found or the run is over. Only moving forward announces anything.
    function feedback(forward, now) {
      const st = status(), shown = shownState();
      if (forward && shown.bestScore > lastBest && steps > 0) {
        bestBox.classList.remove("bump");
        void bestBox.offsetWidth;
        bestBox.classList.add("bump");
      }
      lastBest = shown.bestScore;
      if (forward) {
        const score = `<big>${esc(problem.display(shown.best))}</big>`;
        if (st.reached && !seen.reached) celebrate(now);
        if (st.done && !seen.done) {
          if (problem.kind === "tsp") showBanner(`跑完了！${score}`);
          else if (st.reached) showBanner(`跑完了！最佳解在最高峰上${score}`);
          else showBanner(`卡關：沒爬上最高峰${score}<button type="button" class="btn" data-act="retry">換個種子再試 ▶</button>`, true);
        } else if (st.reached && !seen.reached) {
          if (s.playing && s.mode === "line") {
            stop();
            showBanner(`找到最高峰了！${score}<button type="button" class="btn" data-act="go-on">繼續播放 ▶</button>`);
          } else {
            showBanner(`找到最高峰了！${score}`);
            if (s.playing) bannerTimer = setTimeout(hideBanner, BANNER_HOLD_MS);
          }
        }
      }
      seen = st;
    }
    banner.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      hideBanner();                                // a click anywhere on the banner puts it away
      if (!b) return;
      if (b.dataset.act === "retry") { s.seed += 1; renderControls(); reset(); }
      play();
    });

    // ---------- running ----------
    // A fresh run from the seed, nothing drawn.
    function restart() {
      problem = HFG.problems[s.kind].create(s.mapId);
      const score = problem.score;                 // count the algorithm's calls only, not the drawing's
      problem.score = (sol) => { if (counting) evals++; return score(sol); };
      evals = evalsBefore = 0;
      rng = HFG.rng(s.seed);
      events = [];
      counting = true;
      try { state = algo.init(problem, s.params[s.kind], rng, record); } finally { counting = false; }
      before = null;
      history = [state.bestScore];
      steps = 0;
    }

    function reset() {
      stop();
      hideBanner();
      restart();
      cursor = s.mode === "line" ? 0 : Math.max(0, events.length - 1);
      tween = drawn = null;
      bursts = [];
      seen = status();
      lastBest = shownState().bestScore;
      drawInfo();
      drawStage(performance.now());
    }

    // Run one whole step of the algorithm, keeping its events. In line mode the map keeps showing the
    // state from before the step (a snapshot) until the last line of the step is reached.
    function runStep(snapshot) {
      before = snapshot ? structuredClone(state) : null;
      events = [];
      evalsBefore = evals;
      counting = true;
      try { algo.step(state, problem, s.params[s.kind], rng, record); } finally { counting = false; }
      steps++;
      history.push(state.bestScore);
    }

    // Go back by running again from the seed up to step `target`, then show line `line` of it.
    // The same seed gives the same run, so this lands exactly where the reader was before.
    function seek(target, line) {
      restart();
      while (steps < target - 1 && canRunStep()) runStep(false);
      if (target > 0 && canRunStep()) runStep(s.mode === "line");
      cursor = Math.max(0, Math.min(line, events.length - 1));
    }

    // One "next line" in line mode.
    function nextLine() {
      if (!atStepEnd()) cursor++;
      else if (canRunStep()) { runStep(true); cursor = 0; }
      else return false;
      return true;
    }
    // One "previous line" in line mode.
    function prevLine() {
      if (cursor > 0 && (before || steps === 0)) cursor--;
      else if (cursor > 0) seek(steps, cursor - 1);          // came over from step mode: rebuild the snapshot
      else if (steps > 0) seek(steps - 1, Infinity);         // first line of a step → last line of the one before
      else return false;
      return true;
    }

    // One or more whole steps in step mode.
    function nextSteps(n) {
      let ran = 0;
      for (; ran < n && canRunStep(); ran++) runStep(false);
      cursor = Math.max(0, events.length - 1);
      return ran > 0;
    }

    function tick(now) {
      raf = 0;
      const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000));
      last = now;
      let changed = false;
      if (s.playing) {
        if (s.mode === "line") {
          carry += dt / LINE_SECONDS[s.speed];
          while (carry >= 1 && s.playing) {
            carry -= 1;
            if (!nextLine()) break;
            glide(now);
            feedback(true, now);
            changed = true;
          }
        } else {
          carry += dt * algo.maxSteps[s.kind] / RUN_SECONDS[s.speed];
          const n = Math.floor(carry);
          carry -= n;
          if (n > 0 && nextSteps(n)) {
            if (s.speed === "slow" && n === 1) glide(now);
            feedback(true, now);
            changed = true;
          }
        }
        if (finished()) { s.playing = false; changed = true; }
      }
      if (changed) drawInfo();
      drawStage(now);
      schedule();
    }
    // Keep animating while something moves: playback, a gliding point, a burst, or a pulsing highlight.
    function schedule() {
      const pulsing = shownMark() && !HFG.reducedMotion();
      if (!raf && visible && (s.playing || tween || bursts.length || pulsing)) raf = requestAnimationFrame(tick);
    }

    function play() {
      if (finished()) return;
      hideBanner();
      s.playing = true;
      last = performance.now();
      carry = 1;                       // the first line or step happens right away
      drawInfo();
      schedule();
    }
    function stop() {
      s.playing = false;
    }
    function move(forward) {
      stop();
      hideBanner();
      const now = performance.now();
      const moved = forward
        ? (s.mode === "line" ? nextLine() : nextSteps(1))
        : (s.mode === "line" ? prevLine() : steps > 0 && (seek(steps - 1, Infinity), true));
      if (moved) { glide(now); feedback(forward, now); }
      drawInfo();
      drawStage(now);
      schedule();
    }

    // ---------- controls ----------
    root.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => {
      s.kind = b.dataset.kind;
      s.mapId = HFG.problems[s.kind].maps[0].id;
      renderControls();
      reset();
    }));
    root.querySelectorAll("[data-speed]").forEach((b) => b.addEventListener("click", () => {
      s.speed = b.dataset.speed;
      renderControls();
    }));
    root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      if (s.mode === b.dataset.mode) return;
      s.mode = b.dataset.mode;
      hideBanner();
      renderControls();
      if (s.mode === "step") { cursor = Math.max(0, events.length - 1); before = null; }
      seen = status();
      drawInfo();
      drawStage(performance.now());
      schedule();
    }));
    $(".demo-map-select").addEventListener("change", (e) => { s.mapId = e.target.value; reset(); schedule(); });
    $(".demo-seed").addEventListener("change", (e) => {
      s.seed = Math.max(1, Math.floor(Number(e.target.value)) || 1);
      e.target.value = s.seed;
      reset();
      schedule();
    });
    $(".btn-play").addEventListener("click", () => {
      if (s.playing) { stop(); drawInfo(); } else play();
    });
    $(".btn-step").addEventListener("click", () => move(true));
    $(".btn-prev").addEventListener("click", () => move(false));
    // ← and → step back and forward, unless the reader is typing or dragging a slider.
    document.addEventListener("keydown", (e) => {
      if ((e.key !== "ArrowRight" && e.key !== "ArrowLeft") || e.altKey || e.ctrlKey || e.metaKey || !visible) return;
      if (e.target.closest && e.target.closest("input, select, textarea, [contenteditable]")) return;
      const forward = e.key === "ArrowRight";
      if ($(forward ? ".btn-step" : ".btn-prev").disabled) return;
      e.preventDefault();
      move(forward);
    });
    $(".btn-reset").addEventListener("click", () => { reset(); schedule(); });
    $(".demo-more").addEventListener("toggle", drawInfo);
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { drawInfo(); drawStage(performance.now()); }, 120);
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; schedule(); }).observe(root);
    }

    // A preset looks like "problem=tsp&map=ring-16&seed=3&t0=5". Missing keys go back to defaults.
    // Presets show where a whole run ends up, so they switch to step mode and play.
    function apply(raw) {
      const q = new URLSearchParams(raw);
      const kind = q.get("problem") || algo.supports[0];
      if (!algo.supports.includes(kind)) throw new Error("demo preset: unsupported problem " + kind);
      s.kind = kind;
      s.mapId = q.get("map") || HFG.problems[kind].maps[0].id;
      s.seed = Number(q.get("seed")) || 1;
      s.mode = "step";
      s.params[kind] = HFG.defaultParams(algo, kind);
      for (const p of algo.params[kind] || []) if (q.has(p.key)) s.params[kind][p.key] = Number(q.get(p.key));
      renderControls();
      reset();
      play();
    }

    renderControls();
    reset();
    schedule();
    return { apply };
  }

  document.addEventListener("DOMContentLoaded", () => {
    const demos = [...document.querySelectorAll(".demo[data-algorithm]")].map(buildDemo);
    document.querySelectorAll("[data-set]").forEach((btn) => btn.addEventListener("click", () => {
      if (!demos.length) return;
      demos[0].apply(btn.dataset.set);
      document.getElementById("demo").scrollIntoView({ behavior: HFG.reducedMotion() ? "auto" : "smooth", block: "start" });
    }));
  });
})();
