/* ==========================================================================
   Page orchestration: preloader, scroll-reveal system, nav, work track,
   experience rows, magnetic buttons and contact.

   Motion is declared in the markup with data attributes and wired up once
   here, inside gsap.matchMedia() so reduced-motion visitors get a fully
   static page and everything reverts cleanly when conditions change.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.remove("no-js");
  // Motion is decided once in <head> (window.Motion): saved choice, else system setting.
  var reduced = window.Motion ? !window.Motion.on : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) root.classList.add("reduced");

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------- Gear outline for the contact backdrop ---------------------- */
  if (window.GearField) $$(".gear-path").forEach(function (p) { p.setAttribute("d", window.GearField.svgPath(100)); });

  /* ---------- Hero: the production-line illustration, assembled in WebGL2 */
  var hero = $(".hero");
  var noGl = function () { hero.classList.add("no-gl"); };
  var field = window.PortraitField ? window.PortraitField.init($(".hero__gl"), {
    anchor: $(".hero__portrait"),
    // The embedded copy (js/hero-image-data.js) can be read even when the page is
    // opened straight from disk, where browsers block reading a file:// image.
    src: window.HERO_IMAGE_DATA || $(".hero__portrait").getAttribute("src"),
    still: reduced,
    focus: [0.33, 0.63],            // the gear's centre (x, y fractions of the image): it assembles first
    accent: "#ffc21a", ink: "#ecebe4",
    onError: noGl
  }) : null;
  if (!field) noGl();

  /* ---------- Motion switches (nav, mobile menu, hero prompt) ----------- */
  $$("[data-motion-toggle]").forEach(function (btn) {
    btn.setAttribute("aria-pressed", String(!reduced));
    var state = $("[data-motion-state]", btn);
    if (state) state.textContent = reduced ? "off" : "on";
    var reason = btn.classList.contains("motion-play") && $("span", btn);
    if (reason && window.Motion && window.Motion.chosen) reason.textContent = "· you turned animations off";
    btn.addEventListener("click", function () { if (window.Motion) window.Motion.set(reduced); });
  });

  /* ---------- Mobile menu ------------------------------------------------ */
  var menu = $("[data-menu]"), toggle = $("[data-menu-toggle]");
  // While open, everything except the brand, the toggle and the menu is inert,
  // so Tab and screen-reader swipes stay inside the menu.
  var behind = [$("main"), $(".nav nav"), $(".skip")];
  function setMenu(open) {
    document.body.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    $(".sr-only", toggle).textContent = open ? "Close menu" : "Open menu";
    menu.inert = !open;
    behind.forEach(function (el) { el.inert = open; });
    if (open) requestAnimationFrame(function () { $("a", menu).focus({ preventScroll: true }); });
  }
  toggle.addEventListener("click", function () { setMenu(!document.body.classList.contains("menu-open")); });
  $$("a", menu).concat($$('a[href^="#"]', $("[data-nav]"))).forEach(function (a) {
    a.addEventListener("click", function () { if (document.body.classList.contains("menu-open")) setMenu(false); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.body.classList.contains("menu-open")) { setMenu(false); toggle.focus(); }
  });
  window.matchMedia("(min-width: 861px)").addEventListener("change", function (e) { if (e.matches) setMenu(false); });

  /* ---------- Marquees: duplicate items so translateX(-50%) loops seamlessly */
  $$("[data-items]").forEach(function (el) {
    var items = el.dataset.items.split("|");
    var label = el.dataset.label;
    var sr = document.createElement("p");
    sr.className = "sr-only";
    sr.textContent = label + ": " + items.join(", ");
    el.appendChild(sr);
    var track = document.createElement("div");
    track.className = "marquee__track";
    track.setAttribute("aria-hidden", "true");
    track.style.setProperty("--duration", (el.dataset.duration || 48) + "s");
    if (el.hasAttribute("data-reverse")) track.style.setProperty("--direction", "reverse");
    var run = [label].concat(items, items);       // one run is wider than the viewport
    for (var half = 0; half < 2; half++) {        // two identical halves
      run.forEach(function (t, i) {
        var s = document.createElement("span");
        s.className = "marquee__item" + (i === 0 ? " marquee__item--label" : "");
        s.textContent = t;
        track.appendChild(s);
      });
    }
    el.appendChild(track);
  });

  /* ---------- About: split the paragraph into words, keeping <strong> ---- */
  $$("[data-scrub-words]").forEach(function (el) {
    (function split(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var s = document.createElement("span");
            s.className = "word";
            s.textContent = part;
            frag.appendChild(s);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          split(child);
        }
      });
    })(el);
  });

  /* ---------- Experience rows: accordion -------------------------------- */
  $$("[data-row]").forEach(function (row) {
    var btn = $(".row__head", row);
    btn.addEventListener("click", function () {
      var open = !row.classList.contains("is-open");
      row.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
      if (window.ScrollTrigger) setTimeout(function () { window.ScrollTrigger.refresh(); }, 600);
    });
  });

  /* ---------- Nav: rAF-throttled scroll state + active section ---------- */
  var nav = $("[data-nav]");
  var ticking = false;
  function onScroll() {
    var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
    nav.classList.toggle("is-scrolled", y > 24);
    nav.style.setProperty("--progress", max > 0 ? Math.min(y / max, 1).toFixed(4) : 0);
    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  var links = {};
  $$("[data-link]").forEach(function (a) { links[a.dataset.link] = a; });
  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      Object.keys(links).forEach(function (k) { links[k].removeAttribute("aria-current"); });
      if (links[e.target.id]) links[e.target.id].setAttribute("aria-current", "true");
    });
  }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
  $$("[data-section]").forEach(function (s) { spy.observe(s); });

  /* ---------- Work track: active card, drag, keyboard -------------------- */
  var track = $("[data-work-track]");
  var cards = $$("[data-card]", track);
  var counter = $("[data-work-index]");
  var progressBar = $("[data-work-progress]").parentNode;
  $("[data-work-total]").textContent = String(cards.length).padStart(2, "0");
  var active = -1;
  var drawn = new Set();
  var trackSeen = false;
  new IntersectionObserver(function (entries, io) {
    if (!entries[0].isIntersecting) return;
    trackSeen = true;
    io.disconnect();
    if (active >= 0) drawDiagram(cards[active]);
  }, { threshold: 0.25 }).observe(track);

  function drawDiagram(card) {
    if (drawn.has(card)) return;
    drawn.add(card);
    var shapes = $$(".draw > *", card), labels = $$(".labels text", card);
    if (!window.gsap || reduced || !shapes.length) return;
    shapes.forEach(function (s) {
      var len = s.getTotalLength ? s.getTotalLength() : 300;
      window.gsap.fromTo(s, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", delay: 0.15 });
    });
    if (labels.length) window.gsap.fromTo(labels, { opacity: 0, y: 6 }, { opacity: 1, y: 0, stagger: 0.08, duration: 0.5, delay: 0.5 });
  }

  function measureActive() {
    var max = track.scrollWidth - track.clientWidth;
    var left = track.scrollLeft, best = 0, bestD = Infinity;
    cards.forEach(function (c, i) {
      var d = Math.abs(c.offsetLeft - track.offsetLeft - left - parseFloat(getComputedStyle(track).paddingLeft || 0));
      if (d < bestD) { bestD = d; best = i; }
    });
    // At the very end, the last card wins even if it can't reach the left edge.
    if (max > 0 && left >= max - 4) best = cards.length - 1;
    progressBar.style.setProperty("--p", max > 0 ? (left / max).toFixed(4) : 0);
    if (best === active) return;
    active = best;
    counter.textContent = String(best + 1).padStart(2, "0");
    cards.forEach(function (c, i) {
      c.dataset.rack = String(Math.min(2, Math.abs(i - best)));
      c.classList.toggle("is-active", i === best);
    });
    if (trackSeen) drawDiagram(cards[best]);
  }
  var trackTick = 0;
  track.addEventListener("scroll", function () {
    cancelAnimationFrame(trackTick);
    trackTick = requestAnimationFrame(measureActive);
  }, { passive: true });

  // Mouse drag to scroll (touch already scrolls natively).
  var drag = { on: false, x: 0, start: 0, moved: 0 };
  track.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch" || track.classList.contains("is-pinned")) return;
    drag = { on: true, x: e.clientX, start: track.scrollLeft, moved: 0 };
    track.setPointerCapture(e.pointerId);
    track.classList.add("is-dragging");
  });
  track.addEventListener("pointermove", function (e) {
    if (!drag.on) return;
    var dx = e.clientX - drag.x;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    track.scrollLeft = drag.start - dx;
  });
  function endDrag() { drag.on = false; track.classList.remove("is-dragging"); }
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);
  track.addEventListener("click", function (e) { if (drag.moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);

  var pinTrigger = null;
  function goToCard(i) {
    i = Math.max(0, Math.min(cards.length - 1, i));
    var max = track.scrollWidth - track.clientWidth;
    var target = Math.min(max, cards[i].offsetLeft - cards[0].offsetLeft);
    if (pinTrigger) {
      var y = pinTrigger.start + (max > 0 ? target / max : 0) * (pinTrigger.end - pinTrigger.start);
      window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
    } else {
      track.scrollTo({ left: target, behavior: reduced ? "auto" : "smooth" });
    }
  }
  track.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); goToCard(active + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); goToCard(active - 1); }
  });
  measureActive();

  /* ---------- Simulation ------------------------------------------------- */
  var simCanvas = $("[data-sim]");
  if (simCanvas && window.QueueSim) {
    window.QueueSim.init(simCanvas, {
      inputs: { rate: $('[data-in="rate"]'), gates: $('[data-in="gates"]'), service: $('[data-in="service"]') },
      outputs: { rate: $('[data-out="rate"]'), gates: $('[data-out="gates"]'), service: $('[data-out="service"]') },
      stat: { wait: $('[data-stat="wait"]'), queue: $('[data-stat="queue"]'), util: $('[data-stat="util"]'), served: $('[data-stat="served"]') },
      reset: $("[data-sim-reset]")
    });
  }

  /* ---------- Without GSAP (CDN blocked) the page is simply static -------- */
  var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) {
    finishLoading();
    nav.style.transform = "none";
    if (field) field.start();
    cards.forEach(drawDiagram);
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  var EASE = "power3.out", DUR = 0.9, START = "top 86%";
  var PRESETS = { up: { y: 44 }, down: { y: -44 }, left: { x: -52 }, right: { x: 52 }, scale: { scale: 0.92 }, fade: {} };

  function finishLoading() {
    document.body.classList.remove("is-loading");
    var loader = $(".loader");
    if (loader) loader.remove();
  }

  /* ---------- Preloader → hero hand-off --------------------------------- */
  function scramble(el, duration) {
    var target = el.dataset.scramble, glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&+=/<>";
    var state = { p: 0 };
    return gsap.to(state, {
      p: 1, duration: duration, ease: "none",
      onUpdate: function () {
        var solved = Math.floor(state.p * target.length);
        el.textContent = target.split("").map(function (ch, i) {
          return i < solved ? ch : glyphs[(Math.random() * glyphs.length) | 0];
        }).join("");
      },
      onComplete: function () { el.textContent = target; }
    });
  }

  function intro() {
    if (reduced) {
      finishLoading();
      gsap.set(nav, { yPercent: 0 });
      if (field) field.start();
      return;
    }
    window.scrollTo(0, 0);
    gsap.set(".hero__line", { yPercent: 110 });
    gsap.set(".hero__intro", { y: 28, opacity: 0 });
    gsap.set(nav, { yPercent: -100 });

    var counter = { n: 0 }, num = $(".loader__num");
    var tl = gsap.timeline({ onComplete: function () { finishLoading(); ScrollTrigger.refresh(); } });
    tl.add(scramble($(".loader__kicker"), 0.9), 0)
      .add(scramble($(".loader__name"), 1.3), 0.15)
      .to(counter, { n: 100, duration: 1.6, ease: "power2.inOut", onUpdate: function () { num.textContent = String(Math.round(counter.n)).padStart(3, "0"); } }, 0)
      .to(".loader__bar", { scaleX: 1, duration: 1.6, ease: "power2.inOut" }, 0)
      .to(".loader__inner", { y: -40, opacity: 0, duration: 0.6, ease: "power2.in" }, "+=0.15")
      .to(".loader", { clipPath: "inset(0% 0% 100% 0%)", duration: 1.0, ease: "power4.inOut" }, "-=0.2")
      .call(function () { if (field) field.start(); }, null, "<0.1")
      .to(".hero__line", { yPercent: 0, duration: 1.1, ease: "power4.out", stagger: 0.12 }, "<0.35")
      .to(nav, { yPercent: 0, duration: 0.9, ease: EASE }, "<0.2")
      .to(".hero__intro", { y: 0, opacity: 1, duration: 0.9, ease: EASE, stagger: 0.09 }, "<0.1");
  }

  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 2500); })]).then(intro);

  /* ---------- Declarative scroll reveals (all inside matchMedia) -------- */
  var mm = gsap.matchMedia();
  mm.add({
    motion: reduced ? "not all" : "all",       // the decided motion state, not the raw system query
    desktop: "(min-width: 861px)",
    wide: "(min-width: 1024px)",
    fine: "(pointer: fine)"
  }, function (ctx) {
    var c = ctx.conditions;
    var cleanups = [];
    if (!c.motion) { cards.forEach(drawDiagram); return; }

    // Diagrams start undrawn; drawDiagram() traces them when their card is active.
    cards.forEach(function (card) {
      if (drawn.has(card)) return;
      $$(".draw > *", card).forEach(function (s) {
        var len = s.getTotalLength ? s.getTotalLength() : 300;
        gsap.set(s, { strokeDasharray: len, strokeDashoffset: len });
      });
      var labels = $$(".labels text", card);
      if (labels.length) gsap.set(labels, { opacity: 0 });
    });

    $$("[data-reveal]").forEach(function (el) {
      var preset = PRESETS[el.dataset.reveal] || PRESETS.up;
      gsap.from(el, Object.assign({}, preset, {
        opacity: 0, duration: DUR, ease: EASE, delay: parseFloat(el.dataset.revealDelay) || 0,
        scrollTrigger: { trigger: el, start: START, once: true }
      }));
    });

    $$("[data-reveal-group]").forEach(function (group) {
      gsap.from(group.children, {
        y: 30, opacity: 0, duration: DUR, ease: EASE,
        stagger: parseFloat(group.dataset.revealGroup) || 0.08,
        scrollTrigger: { trigger: group, start: START, once: true }
      });
    });

    $$("[data-reveal-lines]").forEach(function (el) {
      gsap.from($$(".line", el), {
        yPercent: 110, duration: 1.1, ease: "power4.out", stagger: 0.12,
        scrollTrigger: { trigger: el, start: "top 90%", once: true }
      });
    });

    $$("[data-parallax]").forEach(function (el) {
      var amt = parseFloat(el.dataset.parallax) || 30;
      gsap.fromTo(el, { yPercent: amt / 10 }, {
        yPercent: -amt / 10, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true }
      });
    });

    // About paragraph: words light up as you read down the page.
    $$("[data-scrub-words]").forEach(function (el) {
      var words = $$(".word", el);
      if (c.desktop) {
        gsap.fromTo(words, { color: "#4a4a43" }, {
          color: "#ecebe4", stagger: 0.1, ease: "none",
          scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 45%", scrub: true }
        });
      } else {
        gsap.from(el, { y: 24, opacity: 0, duration: DUR, ease: EASE, scrollTrigger: { trigger: el, start: START, once: true } });
      }
    });

    // Count-up stats.
    $$("[data-count]").forEach(function (el) {
      var end = parseFloat(el.dataset.count), dec = parseInt(el.dataset.decimals || "0", 10), suffix = el.dataset.suffix || "";
      var o = { v: 0 };
      el.setAttribute("aria-label", end.toFixed(dec) + suffix);   // screen readers get the real value
      el.textContent = (0).toFixed(dec) + suffix;
      gsap.to(o, {
        v: end, duration: 1.6, ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 92%", once: true },
        onUpdate: function () { el.textContent = o.v.toFixed(dec) + suffix; }
      });
    });

    // Experience rows: staggered entrance while each hairline draws itself.
    var rows = $$("[data-row]");
    if (rows.length) {
      gsap.timeline({ scrollTrigger: { trigger: rows[0], start: START, once: true } })
        .from(rows, { yPercent: 14, opacity: 0, duration: 0.75, ease: EASE, stagger: 0.08 })
        .from(rows, { "--rule": 0, duration: 0.8, ease: "power2.out", stagger: 0.08 }, 0);
    }

    // Scrolling past the hero ships the finished portrait out, row by row.
    if (field) {
      ScrollTrigger.create({
        trigger: hero, start: "top top", end: "bottom top", scrub: true,
        onUpdate: function (self) { field.setShipOut(self.progress); }
      });
      // If this media context is reverted (e.g. reduced motion switched on),
      // bring every row back into the portrait.
      cleanups.push(function () { field.setShipOut(0); });
    }

    // Work: pin the section and turn vertical scroll into horizontal travel.
    if (c.wide) {
      var maxScroll = function () { return track.scrollWidth - track.clientWidth; };
      track.classList.add("is-pinned");
      var tween = gsap.to(track, {
        scrollLeft: maxScroll, ease: "none",
        scrollTrigger: {
          trigger: ".work", start: "top top", end: function () { return "+=" + maxScroll(); },
          pin: true, scrub: 1, anticipatePin: 1, invalidateOnRefresh: true
        }
      });
      pinTrigger = tween.scrollTrigger;
      cleanups.push(function () { pinTrigger = null; track.classList.remove("is-pinned"); gsap.set(track, { clearProps: "scrollLeft" }); });
    }

    // Contact: panel rises, rows follow, and the panel drifts against the scroll.
    var panel = $("[data-contact-panel]");
    gsap.timeline({ scrollTrigger: { trigger: panel, start: "top 85%", once: true } })
      .from(panel, { y: 56, opacity: 0, duration: 1.1, ease: EASE })
      .from($$(".contact__line", panel), { yPercent: 110, duration: 1, ease: "power4.out", stagger: 0.1 }, "-=0.8")
      .from($$(".contact__row", panel), { y: 24, opacity: 0, duration: 0.8, ease: EASE, stagger: 0.08 }, "-=0.7");
    if (c.desktop) {
      gsap.fromTo(panel, { yPercent: 4 }, { yPercent: -4, ease: "none", scrollTrigger: { trigger: ".contact", start: "top bottom", end: "bottom top", scrub: 1 } });
    }

    // Magnetic buttons: quickTo keeps one tween per axis and retargets it.
    if (c.fine) {
      $$("[data-magnetic]").forEach(function (el) {
        var strength = parseFloat(el.dataset.magnetic) || 0.3;
        var toX = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
        var toY = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });
        var move = function (e) {
          var r = el.getBoundingClientRect();
          toX((e.clientX - (r.left + r.width / 2)) * strength);
          toY((e.clientY - (r.top + r.height / 2)) * strength);
        };
        var reset = function () { toX(0); toY(0); };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", reset);
        el.addEventListener("blur", reset);
        cleanups.push(function () {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerleave", reset);
          el.removeEventListener("blur", reset);
          gsap.set(el, { clearProps: "x,y" });
        });
      });
    }

    return function () { cleanups.forEach(function (fn) { fn(); }); };
  });

  // Layout shifts after fonts and images load; re-measure every trigger.
  window.addEventListener("load", function () { ScrollTrigger.refresh(); }, { once: true });
  fontsReady.then(function () { ScrollTrigger.refresh(); });
})();
