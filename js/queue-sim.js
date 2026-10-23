/* ==========================================================================
   QueueSim — a toy multi-server queue (cars at car-park gates) on canvas.

   Poisson arrivals, Erlang-2 service times, first-come-first-served across
   the open gates. Physics runs on a fixed timestep with an accumulator; the
   loop only runs while the canvas is on screen and the tab is visible.
   Numbers are illustrative, not data from any real project.
   ========================================================================== */
(function () {
  "use strict";

  var STEP = 1 / 60;          // real seconds per physics step
  var SPEED = 6;              // simulated seconds per real second
  var MAX_GATES = 4;
  var CAR_W = 30, CAR_H = 15, GAP = 8;

  function expSample(mean) { return -Math.log(1 - Math.random()) * mean; }

  function init(canvas, ui) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;

    var reduced = window.Motion ? !window.Motion.on : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var params = { rate: 12, gates: 2, service: 8 };
    var size = { w: 0, h: 0, dpr: 1 };
    var sim, raf = 0, last = 0, acc = 0, visible = false, pageVisible = !document.hidden, armed = !reduced;
    var colors = {
      ink: "#ecebe4", muted: "#5c5c54", line: "rgba(236,235,228,0.12)",
      accent: "#ffc21a", road: "#161712", bg: "#10110e"
    };

    function reset() {
      sim = {
        t: 0, nextArrival: expSample(60 / params.rate), cars: [], queue: [],
        gates: Array.from({ length: MAX_GATES }, function () { return { car: null, arm: 0 }; }),
        waits: [], served: 0, util: 0, id: 0
      };
    }

    function geometry() {
      var w = size.w, h = size.h;
      var gateX = w * 0.74;
      var laneGap = Math.min(52, (h - 70) / MAX_GATES);
      var top = h / 2 - (laneGap * (MAX_GATES - 1)) / 2;
      return {
        gateX: gateX,
        queueY: h / 2,
        headX: gateX - 90,
        laneY: function (i) { return top + i * laneGap; },
        exitX: w + 60
      };
    }

    function arrive() {
      var g = geometry();
      var car = { id: sim.id++, x: -40, y: g.queueY, tx: -40, ty: g.queueY, state: "queue", arrived: sim.t, gate: -1, done: 0 };
      sim.cars.push(car);
      sim.queue.push(car);
    }

    function step(dt) {
      var g = geometry();
      sim.t += dt;

      while (sim.t >= sim.nextArrival) {
        arrive();
        sim.nextArrival += expSample(60 / params.rate);
      }

      // Free gates take the head of the queue.
      for (var i = 0; i < params.gates; i++) {
        var gate = sim.gates[i];
        if (!gate.car && sim.queue.length) {
          var car = sim.queue.shift();
          car.state = "service"; car.gate = i;
          car.done = sim.t + expSample(params.service / 2) + expSample(params.service / 2);
          gate.car = car;
          sim.waits.push(sim.t - car.arrived);
          if (sim.waits.length > 80) sim.waits.shift();
        }
      }

      var busy = 0;
      sim.gates.forEach(function (gate, i) {
        var c = gate.car;
        if (c) {
          busy++;
          if (sim.t >= c.done) { c.state = "exit"; gate.car = null; sim.served++; }
        }
        var open = c && c.state === "service" && sim.t > c.done - 1.2 ? 1 : 0;
        gate.arm += (open - gate.arm) * Math.min(1, dt * 1.2);
      });

      // Exponential moving average of utilization over roughly a minute.
      var k = Math.min(1, dt / 60);
      sim.util += ((params.gates ? busy / params.gates : 0) - sim.util) * k;

      // Targets for drawing.
      sim.queue.forEach(function (c, idx) { c.tx = g.headX - idx * (CAR_W + GAP); c.ty = g.queueY; });
      sim.cars.forEach(function (c) {
        if (c.state === "service") { c.tx = g.gateX - CAR_W - 6; c.ty = g.laneY(c.gate); }
        else if (c.state === "exit") { c.tx = g.exitX; c.ty = g.laneY(c.gate); }
        var ease = Math.min(1, dt * (c.state === "exit" ? 0.7 : 1.4));
        c.x += (c.tx - c.x) * ease;
        c.y += (c.ty - c.y) * ease;
      });
      sim.cars = sim.cars.filter(function (c) { return !(c.state === "exit" && c.x > size.w + 20); });
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function draw() {
      var g = geometry(), w = size.w, h = size.h;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, w, h);

      // Approach road and dashed centre line.
      ctx.fillStyle = colors.road;
      ctx.fillRect(0, g.queueY - 22, g.headX + CAR_W + 10, 44);
      ctx.strokeStyle = colors.line; ctx.setLineDash([10, 10]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, g.queueY - 22); ctx.lineTo(g.headX + CAR_W, g.queueY - 22);
      ctx.moveTo(0, g.queueY + 22); ctx.lineTo(g.headX + CAR_W, g.queueY + 22); ctx.stroke();
      ctx.setLineDash([]);

      // Gate lanes.
      ctx.font = "500 10px 'JetBrains Mono', monospace";
      ctx.textBaseline = "middle";
      for (var i = 0; i < MAX_GATES; i++) {
        var y = g.laneY(i), open = i < params.gates, gate = sim.gates[i];
        ctx.fillStyle = colors.road;
        ctx.fillRect(g.gateX - 60, y - 16, w - g.gateX + 60, 32);
        ctx.fillStyle = open ? colors.ink : colors.muted;
        ctx.textAlign = "right";
        ctx.fillText(open ? "GATE " + (i + 1) : "CLOSED", w - 12, y - 1);
        ctx.textAlign = "left";
        // Barrier arm across the lane swings flat as a car finishes paying.
        ctx.save();
        ctx.translate(g.gateX, y + 14);
        ctx.rotate(gate.arm * Math.PI / 2);
        ctx.fillStyle = open ? colors.accent : colors.muted;
        ctx.fillRect(-1.5, 0, 3, -28);
        ctx.restore();
        ctx.fillStyle = open ? colors.accent : colors.muted;
        ctx.fillRect(g.gateX - 4, y + 12, 8, 8);
      }

      // Cars.
      sim.cars.forEach(function (c) {
        ctx.fillStyle = c.state === "service" ? colors.accent : c.state === "exit" ? colors.muted : colors.ink;
        roundRect(c.x, c.y - CAR_H / 2, CAR_W, CAR_H, 4);
        ctx.fill();
      });

      // Overflow marker when the queue runs off screen.
      var hidden = sim.queue.filter(function (c) { return c.tx < -CAR_W; }).length;
      if (hidden) {
        ctx.fillStyle = colors.accent;
        ctx.fillText("+" + hidden + " off screen", 12, g.queueY - 34);
      }
      var mins = Math.floor(sim.t / 60), secs = Math.floor(sim.t % 60);
      ctx.fillStyle = colors.muted;
      ctx.fillText("SIM CLOCK " + String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0") + "  ·  6× SPEED", 12, 18);
    }

    function report() {
      var avg = sim.waits.length ? sim.waits.reduce(function (a, b) { return a + b; }, 0) / sim.waits.length : 0;
      ui.stat.wait.textContent = avg.toFixed(1) + " s";
      ui.stat.queue.textContent = sim.queue.length;
      ui.stat.util.textContent = Math.round(sim.util * 100) + "%";
      ui.stat.served.textContent = sim.served;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      var real = last ? Math.min((now - last) / 1000, 4 * STEP) : 0;
      last = now;
      acc += real;
      var n = 0;
      while (acc >= STEP && n < 4) { step(STEP * SPEED); acc -= STEP; n++; }
      if (n === 4) acc = 0;
      draw();
      if ((now | 0) % 6 === 0 || n) report();
    }

    function shouldRun() { return armed && visible && pageVisible; }
    function sync() {
      if (shouldRun()) { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
      else { cancelAnimationFrame(raf); raf = 0; draw(); report(); }
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      size.w = Math.max(1, r.width); size.h = Math.max(1, r.height);
      size.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(size.w * size.dpr);
      canvas.height = Math.round(size.h * size.dpr);
      draw();
    }

    var resizeTimer = 0;
    new ResizeObserver(function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); }).observe(canvas);
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; sync(); }, { threshold: 0.01 }).observe(canvas);
    document.addEventListener("visibilitychange", function () { pageVisible = !document.hidden; sync(); });

    // Controls. Under reduced motion the model waits for the first interaction.
    Object.keys(ui.inputs).forEach(function (key) {
      ui.inputs[key].addEventListener("input", function (e) {
        params[key] = Number(e.target.value);
        ui.outputs[key].textContent = e.target.value;
        if (key === "rate") sim.nextArrival = sim.t + expSample(60 / params.rate);
        armed = true; sync();
      });
    });
    ui.reset.addEventListener("click", function () { reset(); armed = true; sync(); draw(); report(); });

    reset();
    resize();
    report();
    return { reset: reset };
  }

  window.QueueSim = { init: init };
})();
