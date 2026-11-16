// render.js — draw a problem + algorithm state on a <canvas>, plus the convergence chart.
// Colors come from the CSS custom properties in css/site.css (AGENTS.md section 7), so changing a color
// only touches the CSS. All sizes are in CSS pixels times the canvas pixel ratio (u).
// Look: flat height bands with ink contour lines, bold ink markers (AGENTS.md sections 5.3 and 7).
(function () {
  "use strict";
  const HFG = window.HFG;
  const TRAIL_MAX = 600;
  const TSP_CANDIDATES_SHOWN = 3;        // a TSP mark draws at most this many candidate tours
  const DIFF_MAX = 6;                    // a TSP tour that changes at most this many edges is drawn as a diff
  const PAD = 0.04;                      // margin around both maps, so marks at the edge stay visible
  const DIM = 0.35;                      // opacity of the unmarked points while a line marks some of them
  const MIN_U = 1;                       // sizes never shrink below what a 360-CSS-pixel map would use
  const bgCache = new Map();
  const candCache = new WeakMap();

  // Palette: read once per draw from the CSS variables, with fallbacks for pages without the stylesheet.
  const FALLBACK = {
    ink: "#111111", muted: "#3F3F46", surface: "#FFFFFF", soft: "#F5ECD4",
    yellow: "#FFDB58", coral: "#FF6B6B", teal: "#4ECDC4", lilac: "#C9B8FF", trace: "#0F766E",
    mapLo: "#FFF3C4", mapHi: "#138F86",
  };
  const VARS = {
    ink: "--ink", muted: "--muted", surface: "--surface", soft: "--soft",
    yellow: "--yellow", coral: "--coral", teal: "--teal", lilac: "--lilac", trace: "--trace",
    mapLo: "--map-lo", mapHi: "--map-hi",
  };
  HFG.palette = function () {
    const css = getComputedStyle(document.documentElement);
    const C = {};
    for (const k in VARS) C[k] = css.getPropertyValue(VARS[k]).trim() || FALLBACK[k];
    return C;
  };
  const rgb = (hex) => {
    const h = hex.replace("#", "");
    const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  };

  // Marching squares: for each corner pattern, which cell edges (0 top, 1 right, 2 bottom, 3 left) a
  // contour segment joins. HFG.contours adds the segments of level L to the current path of ctx.
  const CASES = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]],
    [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[0, 3]], []];
  HFG.contours = function (ctx, v, nx, ny, cell, L) {
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
      const idx = (a > L) | ((b > L) << 1) | ((c > L) << 2) | ((d > L) << 3);
      if (idx === 0 || idx === 15) continue;
      const x = i * cell, y = j * cell;
      const pt = (e) => {
        if (e === 0) return [x + cell * (L - a) / (b - a), y];
        if (e === 1) return [x + cell, y + cell * (L - b) / (c - b)];
        if (e === 2) return [x + cell * (L - d) / (c - d), y + cell];
        return [x, y + cell * (L - a) / (d - a)];
      };
      for (const [e1, e2] of CASES[idx]) { ctx.moveTo(...pt(e1)); ctx.lineTo(...pt(e2)); }
    }
  };

  // Height map in flat bands, one per 0.1 of height, colored from --map-lo (low) to --map-hi (high),
  // with an ink contour line on every band edge. Fill and lines use the same interpolated grid, so they
  // line up exactly.
  const GRID = 160;
  const BANDS = 10;
  const BAND_GAMMA = 0.9;
  function terrainBackground(problem, W, C) {
    const key = [problem.mapId, W, C.mapLo, C.mapHi, C.ink].join(":");
    if (bgCache.has(key)) return bgCache.get(key);
    const lo = rgb(C.mapLo), hi = rgb(C.mapHi);
    const colors = [];
    for (let b = 0; b < BANDS; b++) {
      const t = Math.pow(b / (BANDS - 1), BAND_GAMMA);
      colors.push([0, 1, 2].map((ch) => Math.round(lo[ch] + (hi[ch] - lo[ch]) * t)));
    }
    const n = GRID + 1, v = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] = problem.score({ x: i / GRID, y: j / GRID });
    const c = document.createElement("canvas");
    c.width = c.height = W;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(W, W);
    const s = GRID / W;
    for (let py = 0; py < W; py++) {
      const gy = (py + 0.5) * s, j = Math.min(GRID - 1, Math.floor(gy)), fy = gy - j;
      for (let px = 0; px < W; px++) {
        const gx = (px + 0.5) * s, i = Math.min(GRID - 1, Math.floor(gx)), fx = gx - i;
        const top = v[j * n + i] * (1 - fx) + v[j * n + i + 1] * fx;
        const bottom = v[(j + 1) * n + i] * (1 - fx) + v[(j + 1) * n + i + 1] * fx;
        const h = top * (1 - fy) + bottom * fy;
        const col = colors[Math.max(0, Math.min(BANDS - 1, Math.floor(h * BANDS)))];
        const p = (py * W + px) * 4;
        img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(1, W / 320);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let k = 1; k < BANDS; k++) HFG.contours(ctx, v, n, n, W / GRID, k / BANDS);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (bgCache.size > 12) bgCache.clear();
    bgCache.set(key, c);
    return c;
  }

  // ---------- markers ----------
  function ring(ctx, x, y, r, u, C, fill = C.surface) {          // one solution of a population
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  }
  function crosshair(ctx, x, y, u, C) {                           // the one current solution
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(x - 15 * u, y); ctx.lineTo(x - 6 * u, y);
    ctx.moveTo(x + 6 * u, y); ctx.lineTo(x + 15 * u, y);
    ctx.moveTo(x, y - 15 * u); ctx.lineTo(x, y - 6 * u);
    ctx.moveTo(x, y + 6 * u); ctx.lineTo(x, y + 15 * u);
    ctx.stroke();
    ring(ctx, x, y, 8 * u, u * 1.25, C, "rgba(0,0,0,0)");
    ctx.beginPath();
    ctx.arc(x, y, 3.2 * u, 0, Math.PI * 2);
    ctx.fillStyle = C.coral;
    ctx.fill();
  }
  function diamond(ctx, x, y, r, u, C) {                          // the best solution so far
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fillStyle = C.yellow;
    ctx.fill();
    ctx.lineWidth = 2 * u;
    ctx.lineJoin = "miter";
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  }
  function flag(ctx, x, y, u, C) {                                // the true highest point
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.5 * u;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 26 * u);
    ctx.stroke();
    ctx.fillStyle = C.coral;
    ctx.lineWidth = 2 * u;
    ctx.fillRect(x, y - 26 * u, 16 * u, 11 * u);
    ctx.strokeRect(x, y - 26 * u, 16 * u, 11 * u);
  }
  // The walk so far as one pen line, fading toward the oldest step.
  function penLine(ctx, pts, u, C) {
    const [r, g, b] = rgb(C.ink);
    ctx.lineWidth = 2.2 * u;
    ctx.lineCap = "round";
    for (let i = 1; i < pts.length; i++) {
      ctx.strokeStyle = `rgba(${r},${g},${b},${(0.15 + 0.7 * (i / pts.length)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(...pts[i - 1]);
      ctx.lineTo(...pts[i]);
      ctx.stroke();
    }
  }

  function arrow(ctx, [x1, y1], [x2, y2], u, color) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    if (d < 4 * u) return;
    const ang = Math.atan2(y2 - y1, x2 - x1), head = Math.min(10 * u, d / 2);
    const ex = x2 - Math.cos(ang) * 8 * u, ey = y2 - Math.sin(ang) * 8 * u;
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = 2.5 * u;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(ang) * 2 * u, ey + Math.sin(ang) * 2 * u);
    ctx.lineTo(ex - Math.cos(ang - 0.5) * head, ey - Math.sin(ang - 0.5) * head);
    ctx.lineTo(ex - Math.cos(ang + 0.5) * head, ey - Math.sin(ang + 0.5) * head);
    ctx.closePath();
    ctx.fill();
  }

  // A small name tag next to a point: above, below, right or left, whichever does not cover a tag already
  // drawn. When all four are taken it moves further up and a thin line points back at the point.
  function label(ctx, x, y, text, u, C, taken) {
    ctx.font = `900 ${13 * u}px Outfit, "Noto Sans TC", sans-serif`;
    const w = ctx.measureText(text).width + 12 * u, h = 21 * u, gap = 13 * u;
    const cx = (v) => Math.max(2 * u, Math.min(ctx.canvas.width - w - 2 * u, v));
    const cy = (v) => Math.max(2 * u, Math.min(ctx.canvas.height - h - 2 * u, v));
    const hits = ([bx, by]) => taken.some((t) => bx < t.x + t.w && t.x < bx + w && by < t.y + t.h && t.y < by + h);
    const slots = [[x - w / 2, y - h - gap], [x - w / 2, y + gap], [x + gap, y - h / 2], [x - w - gap, y - h / 2]]
      .map(([bx, by]) => [cx(bx), cy(by)]);
    let spot = slots.find((s) => !hits(s));
    if (!spot) {
      spot = slots[0];
      for (let k = 1; k < 8 && hits(spot); k++) spot = [spot[0], cy(y - h - gap - k * (h + 3 * u))];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(spot[0] + w / 2, spot[1] + h);
      ctx.lineWidth = 1.5 * u;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
    }
    const [bx, by] = spot;
    taken.push({ x: bx, y: by, w, h });
    ctx.fillStyle = C.surface;
    ctx.fillRect(bx, by, w, h);
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = C.ink;
    ctx.strokeRect(bx, by, w, h);
    ctx.fillStyle = C.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + 6 * u, by + h / 2 + 0.5 * u);
    ctx.textBaseline = "alphabetic";
  }

  // Labels that land on the same spot become one tag ("x、p、g 都在這") instead of a stack of tags.
  // `taken` holds tags already drawn on this map, so the new ones step around them.
  function labelAll(ctx, labels, P, u, C, taken = []) {
    const spots = [];
    for (const l of labels) {
      const [x, y] = P(l.at);
      const same = spots.find((s) => s.x === x && s.y === y);
      if (same) same.texts.push(l.text);
      else spots.push({ x, y, texts: [l.text] });
    }
    for (const s of spots) label(ctx, s.x, s.y, s.texts.length > 1 ? s.texts.join("、") + " 都在這" : s.texts[0], u, C, taken);
  }

  // A small ink-on-yellow box with its top-left corner at (x, y): the number of a TSP panel.
  function tag(ctx, x, y, text, u, C) {
    ctx.font = `900 ${13 * u}px Outfit, "Noto Sans TC", sans-serif`;
    const w = ctx.measureText(text).width + 12 * u, h = 21 * u;
    ctx.fillStyle = C.yellow;
    ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = C.ink;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = C.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 6 * u, y + h / 2 + 0.5 * u);
    ctx.textBaseline = "alphabetic";
  }

  // pulse: 0..1 wave used for the highlighted solution; 0 when motion is reduced.
  const pulseOf = (phase) => (phase == null ? 0 : 0.5 + 0.5 * Math.sin(phase / 260));

  // Magnifier: when what a single-solution line marks sits within a few pixels of the current point (eight
  // neighbours one grid step away, or a move of one step), a corner inset shows that spot enlarged: the
  // current point in the middle, the candidates around it, the pick circled. A small square marks the spot
  // and a line ties it to the inset. The inset goes to the corner farthest from the spot and the flag.
  const INSET = 0.36;                    // side of the inset, as a share of the map
  const CROWD = 24;                      // marks closer than this (times u) to the current point count as crowded
  function magnifier(ctx, W, problem, center, mark, P, inner, off, u, C, opts) {
    const marked = [...(mark.cands || []), ...(mark.pick ? [mark.pick] : [])];
    if (marked.length < 2 && !(mark.from && mark.pick)) return;
    const [cx, cy] = P(center);
    const reach = Math.max(...marked.map((p) => { const [x, y] = P(p); return Math.hypot(x - cx, y - cy); }));
    if (!(reach > 0) || reach > CROWD * u) return;
    const S = Math.round(W * INSET), half = Math.max(reach * 1.8, 8 * u), z = S / 2 / half;
    const lo = off + 6 * u, hi = W - off - 6 * u - S, keep = [[cx, cy], P(problem.peak)];
    const room = ([x, y]) => Math.min(...keep.map(([kx, ky]) => Math.hypot(x + S / 2 - kx, y + S / 2 - ky)));
    const [bx, by] = [[lo, lo], [hi, lo], [lo, hi], [hi, hi]].sort((a, b) => room(b) - room(a))[0];
    // the spot on the map, and the line to the inset
    const sx = bx + S / 2 > cx ? 1 : -1, sy = by + S / 2 > cy ? 1 : -1;
    ctx.lineWidth = 1.5 * u;
    ctx.strokeStyle = C.ink;
    ctx.strokeRect(cx - half, cy - half, 2 * half, 2 * half);
    ctx.beginPath();
    ctx.moveTo(cx + sx * half, cy + sy * half);
    ctx.lineTo(sx > 0 ? bx : bx + S, sy > 0 ? by : by + S);
    ctx.stroke();
    // the inset: the same terrain, z times larger, around the current point
    const Q = ([x, y]) => [bx + S / 2 + (x - cx) * z, by + S / 2 + (y - cy) * z];
    ctx.save();
    ctx.fillStyle = C.surface;
    ctx.fillRect(bx, by, S, S);
    ctx.beginPath();
    ctx.rect(bx, by, S, S);
    ctx.clip();
    const x0 = cx - off - half, y0 = cy - off - half;
    const a0 = Math.max(0, x0), b0 = Math.max(0, y0), a1 = Math.min(inner, x0 + 2 * half), b1 = Math.min(inner, y0 + 2 * half);
    if (a1 > a0 && b1 > b0) {
      ctx.drawImage(terrainBackground(problem, inner, C), a0, b0, a1 - a0, b1 - b0,
        bx + (a0 - x0) * z, by + (b0 - y0) * z, (a1 - a0) * z, (b1 - b0) * z);
    }
    const [e0, f0] = Q([off, off]), [e1, f1] = Q([off + inner, off + inner]);
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = C.ink;
    ctx.strokeRect(e0, f0, e1 - e0, f1 - f0);   // the map edge, when the spot is next to it
    for (const p of mark.cands || []) {
      ctx.beginPath();
      ctx.arc(...Q(P(p)), 7 * u, 0, Math.PI * 2);
      ctx.fillStyle = C.surface;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.setLineDash([3 * u, 3 * u]);
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = C.trace;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    crosshair(ctx, ...Q(P(center)), u, C);
    if (mark.from && mark.pick) arrow(ctx, Q(P(mark.from)), Q(P(mark.pick)), u, C.ink);
    if (mark.pick) {
      ctx.beginPath();
      ctx.arc(...Q(P(mark.pick)), (10 + 3 * pulseOf(opts.phase)) * u, 0, Math.PI * 2);
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = C.trace;
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = C.ink;
    ctx.strokeRect(bx, by, S, S);
    tag(ctx, bx, by, "放大", u, C);
  }

  function drawTerrain(ctx, W, problem, state, mark, u, C, opts) {
    const inner = Math.round(W * (1 - 2 * PAD)), off = Math.round((W - inner) / 2);
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, W, W);
    ctx.drawImage(terrainBackground(problem, inner, C), off, off);
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = C.ink;
    ctx.strokeRect(off, off, inner, inner);
    const P = (p) => [off + p.x * inner, off + p.y * inner];
    if (state.trail && state.trail.length > 1) penLine(ctx, state.trail.slice(-TRAIL_MAX).map(P), u, C);
    flag(ctx, ...P(problem.peak), u, C);
    const points = opts.points || state.points;
    const single = points.length <= 2;
    // While a line points at something, the other points step back so the marked ones stand out.
    const focus = mark && (mark.pick || (mark.cands && mark.cands.length));
    if (single) {
      diamond(ctx, ...P(state.best), 7 * u, u, C);
      for (const p of points) crosshair(ctx, ...P(p), u, C);
    } else {
      ctx.globalAlpha = focus ? DIM : 1;
      for (const p of points) ring(ctx, ...P(p), 4.5 * u, u, C);
      ctx.globalAlpha = 1;
      diamond(ctx, ...P(state.best), 7 * u, u, C);
    }
    if (!mark) return;
    const cands = mark.cands || [];
    const small = cands.length > 40;
    for (const p of cands) {
      ctx.beginPath();
      ctx.arc(...P(p), (small ? 4 : 8) * u, 0, Math.PI * 2);
      ctx.fillStyle = C.surface;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.setLineDash(small ? [] : [3 * u, 3 * u]);
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = C.trace;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (mark.from && mark.pick) arrow(ctx, P(mark.from), P(mark.pick), u, C.ink);
    if (mark.pick) {
      const r = (11 + 3 * pulseOf(opts.phase)) * u;
      ctx.beginPath();
      ctx.arc(...P(mark.pick), r, 0, Math.PI * 2);
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = C.trace;
      ctx.stroke();
    }
    labelAll(ctx, mark.labels || [], P, u, C);
    if (single) magnifier(ctx, W, problem, mark.from || points[0], mark, P, inner, off, u, C, opts);
  }

  // Where a terrain point lands on a map canvas, in canvas pixels (demo.js aims its burst with this).
  HFG.mapPoint = function (canvas, p) {
    const W = canvas.width, inner = Math.round(W * (1 - 2 * PAD)), off = Math.round((W - inner) / 2);
    return [off + p.x * inner, off + p.y * inner];
  };

  // The candidate tours shown for a mark (computed once per mark). A few candidates are all shown. Of many,
  // a line that is still looking (cands without pick) shows a few spread over the list, whatever their
  // score: choosing the best is a later line's job, and showing the best few here would give it away.
  // A line that picks from many shows only its pick.
  function shownTours(mark) {
    if (!mark.cands || !mark.cands.length) return [];
    if (candCache.has(mark)) return candCache.get(mark);
    const n = mark.cands.length, k = TSP_CANDIDATES_SHOWN;
    const list = n <= k ? mark.cands
      : !mark.pick ? [...Array(k)].map((_, i) => mark.cands[Math.floor(((i + 0.5) * n) / k)])
      : [];
    candCache.set(mark, list);
    return list;
  }
  const manyCands = (mark) => mark && !mark.pick && mark.cands && mark.cands.length > TSP_CANDIDATES_SHOWN;

  // A looking line with many candidates turns the map into four panels: three candidates, each a whole
  // tour on its own small map with the edges it changes (against mark.from or the current tour) in the
  // trace colour (dashed), and a fourth panel saying how many more there are. A neighbour is a whole tour, so
  // each one gets its own map instead of a few dashes on the current one.
  function drawTspPanels(ctx, W, problem, state, mark, u, C) {
    const tours = shownTours(mark), ref = mark.from || state.current;
    const g = 8 * u, s = (W - 3 * g) / 2;
    const corner = (i) => [g + (i % 2) * (s + g), g + Math.floor(i / 2) * (s + g)];
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, W, W);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    tours.forEach((t, i) => {
      const [x0, y0] = corner(i);
      const P = (c) => [x0 + (PAD + (1 - 2 * PAD) * problem.cities[c].x / 100) * s,
        y0 + (PAD + (1 - 2 * PAD) * problem.cities[c].y / 100) * s];
      ctx.beginPath();
      ctx.moveTo(...P(t[0]));
      for (const c of t.slice(1)) ctx.lineTo(...P(c));
      ctx.closePath();
      ctx.lineWidth = 1.5 * u;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      const d = tourDiff(t, ref);
      for (const k of d ? d.added : []) {
        const [a, b] = k.split("-").map(Number);
        ctx.beginPath();
        ctx.moveTo(...P(a));
        ctx.lineTo(...P(b));
        ctx.lineWidth = 3.5 * u;
        ctx.strokeStyle = C.trace;
        ctx.setLineDash([6 * u, 4 * u]);          // dashed like every candidate in the legend ("正在比較的")
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 1.2 * u;
      ctx.strokeStyle = C.ink;
      ctx.fillStyle = C.teal;
      for (let c = 0; c < problem.n; c++) {
        const [x, y] = P(c), r = 2.5 * u;
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
        ctx.strokeRect(x - r, y - r, 2 * r, 2 * r);
      }
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(x0, y0, s, s);
      tag(ctx, x0, y0, String(i + 1), u, C);
    });
    const [x0, y0] = corner(3);
    ctx.setLineDash([6 * u, 5 * u]);
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = C.ink;
    ctx.strokeRect(x0, y0, s, s);
    ctx.setLineDash([]);
    ctx.fillStyle = C.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${15 * u}px Outfit, "Noto Sans TC", sans-serif`;
    ctx.fillText("以及其他", x0 + s / 2, y0 + s / 2 - 12 * u);
    ctx.fillText(`${mark.cands.length - tours.length} 條路線…`, x0 + s / 2, y0 + s / 2 + 12 * u);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // Edges of a tour as "i-j" keys (smaller city first), and the edges of t that ref does not have.
  const edgeKeys = (t) => t.map((a, i) => { const b = t[(i + 1) % t.length]; return a < b ? a + "-" + b : b + "-" + a; });
  function tourDiff(t, ref) {
    if (!ref) return null;
    const kt = edgeKeys(t), kr = edgeKeys(ref), st = new Set(kt), sr = new Set(kr);
    const added = kt.filter((k) => !sr.has(k)), removed = kr.filter((k) => !st.has(k));
    return added.length <= DIFF_MAX ? { added, removed } : null;
  }

  function drawTsp(ctx, W, problem, state, mark, u, C, opts) {
    if (manyCands(mark)) return drawTspPanels(ctx, W, problem, state, mark, u, C);
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, W, W);
    const P = (i) => [(PAD + (1 - 2 * PAD) * problem.cities[i].x / 100) * W, (PAD + (1 - 2 * PAD) * problem.cities[i].y / 100) * W];
    const path = (t, width, color, alpha = 1, dash = null, closed = true) => {
      ctx.beginPath();
      ctx.moveTo(...P(t[0]));
      for (const i of t.slice(1)) ctx.lineTo(...P(i));
      if (closed) ctx.closePath();
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineJoin = "round";
      ctx.setLineDash(dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };
    for (const e of state.edges || []) {
      ctx.beginPath();
      ctx.moveTo(...P(e.a));
      ctx.lineTo(...P(e.b));
      ctx.lineWidth = (1 + 7 * e.w) * u;
      ctx.strokeStyle = C.lilac;
      ctx.globalAlpha = 0.35 + 0.55 * e.w;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // The best tour is a yellow road with ink edges. While a line marks something it steps back to a pale
    // road; the fill stays opaque so the two strokes don't blend into a muddy tone.
    const focus = mark && (mark.pick || mark.path || (mark.cands && mark.cands.length));
    path(state.best, 9 * u, C.ink, focus ? 0.25 : 1);
    path(state.best, 5.5 * u, focus ? C.mapLo : C.yellow);
    if (state.current) path(state.current, 2 * u, C.ink);
    const edge = (key, width, color, alpha, dash) => {
      const [a, b] = key.split("-").map(Number);
      ctx.beginPath();
      ctx.moveTo(...P(a));
      ctx.lineTo(...P(b));
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      ctx.setLineDash(dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };
    const tours = mark ? shownTours(mark) : [];
    if (mark) {
      // A tour that differs from the reference (mark.from, else the current tour) in only a few edges is
      // drawn as that difference: removed edges dashed, new edges solid. Otherwise the whole tour.
      const ref = mark.from || state.current;
      if (mark.from && state.current && !tourDiff(mark.from, state.current)) path(mark.from, 2 * u, C.muted, 0.8, [6 * u, 5 * u]);
      for (const t of tours) {
        const d = tourDiff(t, ref);
        if (d) d.added.forEach((k) => edge(k, 2.5 * u, C.trace, 0.85, [5 * u, 4 * u]));
        else path(t, 2 * u, C.trace, 0.7, [5 * u, 4 * u]);
      }
      if (mark.pick) {
        const d = tourDiff(mark.pick, ref), w = (3.5 + 1.5 * pulseOf(opts.phase)) * u;
        if (d) {
          d.removed.forEach((k) => edge(k, 4 * u, C.surface, 1));
          d.removed.forEach((k) => edge(k, 2 * u, C.ink, 0.8, [3 * u, 5 * u]));
          d.added.forEach((k) => edge(k, w, C.trace, 1));
        } else path(mark.pick, w * 0.8, C.trace);
      }
      if (mark.path && mark.path.length > 1) path(mark.path, 3.5 * u, C.trace, 1, null, false);
    }
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = C.ink;
    ctx.fillStyle = C.teal;
    for (let i = 0; i < problem.n; i++) {
      const [x, y] = P(i), r = 4.5 * u;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      ctx.strokeRect(x - r, y - r, 2 * r, 2 * r);
    }
    if (mark) labelAll(ctx, (mark.labels || []).filter((l) => typeof l.at === "number"), P, u, C);
  }

  // Draw the map. `canvas` should be square; its pixel width sets the scale.
  // mark (optional) is what the current pseudocode line points at: { cands, pick, from, labels, path }.
  // opts.phase (ms) animates the highlight; opts.points overrides state.points (used for gliding).
  HFG.draw = function (canvas, problem, state, mark = null, opts = {}) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const dpr = canvas.clientWidth ? W / canvas.clientWidth : 1;
    const u = Math.max(W / 360, MIN_U * dpr);
    const C = opts.palette || HFG.palette();
    ctx.clearRect(0, 0, W, W);
    if (problem.kind === "terrain") drawTerrain(ctx, W, problem, state, mark, u, C, opts);
    else drawTsp(ctx, W, problem, state, mark, u, C, opts);
  };

  // Convergence chart of bestScore over steps (TSP shown as tour length, so lower is better).
  HFG.drawChart = function (canvas, history, kind, maxSteps) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height, u = W / 300;
    const C = HFG.palette();
    const vals = kind === "tsp" ? history.map((v) => -v) : history;
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, W, H);
    const left = 44 * u, right = W - 10 * u, top = 12 * u, bottom = H - 22 * u;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1e-9) { hi += 0.5; lo -= 0.5; }
    const X = (i) => left + (right - left) * (i / Math.max(1, maxSteps));
    const Y = (v) => bottom - (bottom - top) * ((v - lo) / (hi - lo));
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.font = `700 ${11 * u}px Outfit, "Noto Sans TC", sans-serif`;
    ctx.textAlign = "right";
    const fmt = (v) => (kind === "tsp" ? v.toFixed(0) : v.toFixed(2));
    ctx.fillText(fmt(hi), left - 6 * u, top + 8 * u);
    ctx.fillText(fmt(lo), left - 6 * u, bottom);
    ctx.textAlign = "left";
    ctx.fillText(kind === "tsp" ? "最短路線長（越低越好）" : "最高高度（越高越好）", left + 6 * u, H - 6 * u);
    ctx.beginPath();
    vals.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.lineWidth = 2.5 * u;
    ctx.lineJoin = "round";
    ctx.strokeStyle = C.trace;
    ctx.stroke();
    const last = vals.length - 1;
    diamond(ctx, X(last), Y(vals[last]), 6 * u, u, C);
  };

  // Size a canvas for crisp drawing: CSS size stays as laid out, pixels follow devicePixelRatio.
  HFG.fitCanvas = function (canvas, ratio = 1) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    if (canvas.width !== w) canvas.width = w;
    const h = Math.round(w * ratio);
    if (canvas.height !== h) canvas.height = h;
  };

})();
