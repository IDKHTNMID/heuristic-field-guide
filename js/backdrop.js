// backdrop.js — site-wide decoration, loaded right after core.js on every page:
//   1. scroll reveal for blocks below the first screen (they pop in, a few at a time, 45 ms apart);
//   2. page switch: the card (or tile) that was clicked gets the view-transition name "algo", so it grows
//      into the next page's header (css/site.css). The name is cleared when the page is shown again.
// The dotted page background is plain CSS. Nothing here is needed to read the page: with JavaScript off
// the page is complete, just without motion.
(function () {
  "use strict";
  const HFG = window.HFG;

  // ---------- scroll reveal ----------
  // Only blocks that start below the first screen are hidden, so nothing visible ever flickers.
  HFG.reveal = function (elements) {
    if (HFG.reducedMotion() || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.filter((en) => en.isIntersecting).forEach((en, k) => {
        en.target.style.setProperty("--i", k);
        en.target.classList.add("in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    for (const el of elements) {
      if (el.getBoundingClientRect().top < window.innerHeight) continue;
      el.classList.add("reveal");
      io.observe(el);
    }
  };

  // ---------- page switch ----------
  const named = new Set();
  HFG.morphFrom = function (el) {
    named.forEach((n) => { n.style.viewTransitionName = ""; });
    named.clear();
    el.style.viewTransitionName = "algo";
    named.add(el);
  };
  window.addEventListener("pageshow", () => {
    named.forEach((n) => { n.style.viewTransitionName = ""; });
    named.clear();
  });

  document.addEventListener("DOMContentLoaded", () => {
    HFG.reveal(document.querySelectorAll("main section, .how > .tile, .t-problem, .t-count"));
  });
})();
