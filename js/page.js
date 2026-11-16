// page.js — fills the header (#page-header) and prev/next links (#page-nav) of an algorithm page
// from js/registry.js, using <body data-slug="...">. Pages never hand-write these parts.
// It runs as soon as it loads (the script tags sit at the end of <body>, so both parts are already
// there) rather than on DOMContentLoaded: the page's <link rel="expect" href="#top-bar" blocking="render">
// holds the first paint until the bar below exists, so the page switch (css/site.css) can grow the
// clicked card into a header that is already on screen.
(function () {
  "use strict";
  const HFG = window.HFG;
  const esc = HFG.esc;

  (function build() {
    const slug = document.body.dataset.slug;
    const ready = HFG.registry.filter((e) => e.status === "ready");
    const i = ready.findIndex((e) => e.slug === slug);
    const header = document.getElementById("page-header");
    if (i < 0) {
      if (header) header.innerHTML = `<p class="demo-error">registry.js 裡找不到 slug「${esc(slug)}」（或它還是 planned）。</p>`;
      throw new Error("page: slug not in registry as ready: " + slug);
    }
    const e = ready[i];
    document.title = `${e.no} ${e.name}｜啟發式演算法圖鑑`;
    if (header) {
      // The top bar sits outside the header so it can stay at the top while the page scrolls.
      const bar = document.createElement("nav");
      bar.className = "bar";
      bar.id = "top-bar";
      bar.setAttribute("aria-label", "回首頁");
      bar.innerHTML = `<a class="chip" href="../index.html">← 回圖鑑</a><b>${e.no} ${esc(e.name)}</b>`;
      header.before(bar);
      // .lv-head carries the view-transition name, so the card clicked on the homepage grows into it.
      header.innerHTML = `
        <div class="lv-head ${e.family}">
          <span class="no">${e.no}</span>
          <div>
            <h1>${esc(e.name)}</h1>
            <div class="en">${esc(e.en)}</div>
            <p class="lead">${esc(e.line)}</p>
            <div class="tags">${HFG.tagsHtml(e)}</div>
          </div>
        </div>`;
    }
    const nav = document.getElementById("page-nav");
    if (nav) {
      const cell = (x, dir) => x
        ? `<a class="pn ${dir}" href="${x.slug}.html"><span class="pn-dir">${dir === "prev" ? "← 上一個" : "下一個 →"}</span><span class="no">${x.no}</span><b>${esc(x.name)}</b></a>`
        : `<span class="pn ${dir} empty"></span>`;
      nav.innerHTML = cell(ready[i - 1], "prev") + cell(ready[i + 1], "next");
    }
  })();
})();
