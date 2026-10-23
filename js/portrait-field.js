/* ==========================================================================
   PortraitField: the hero image as a small assembly line (WebGL2).
   (Named for its first use, a portrait; it works with any cut-out image.
   The hero now uses assets/hero-production-line.png.)

   The model is a production line, not a cloud of particles:
   - The cut-out image is split into a grid. Every grid square is a "part"
     with a colour (the average of the image under it) and a final ASME
     flow-process-chart symbol.
   - Parts are dispatched from a focus point outwards onto inbound belts that
     run in from the left edge. Each part rides the belt lane nearest its row,
     then turns off into its slot. Every station it passes changes its symbol;
     it docks showing its final one.
   - A docked part is a solid plate in the image's colour with its symbol
     pressed into it. The few "unit" parts carry the safety-yellow brand colour.
   - Quality control: tiles near the cursor, and a slow scan line that sweeps
     the finished image, switch to the inspection symbol in safety yellow.
   - Scrolling ships finished rows out to the right, each row pulling away a
     moment after the one above it.
   - Docked plates sit on whole device pixels, so every gap between plates is
     exactly one pixel wide (up to 2x screens; denser screens are drawn at 2x
     and scaled, which keeps the fill rate down).
   ========================================================================== */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var SAMPLE_WIDTH = 320;            // the photo is read once at this width
  var BELT_PX_PER_S = 950;           // inbound belt speed
  var INSPECTION = 2;                // index of the inspection square in the sheet
  var UNIT = 7;                      // index of the unit dot: brand-coloured parts
  // How often each symbol ends up as a part's final symbol (cumulative).
  var SYMBOL_MIX = [0.30, 0.50, 0.65, 0.75, 0.85, 0.93, 0.98, 1.0];
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  var LINE_VS = [
    "#version 300 es",
    "in ivec4 aCell;      // column, row, stations on the route, final symbol",
    "in vec4 aTint;       // the photo's colour under this square",
    "in vec2 aSchedule;   // dispatch time and belt time, in seconds",
    "",
    "uniform vec2 uCanvasPx;  uniform vec2 uBufferPx;  uniform vec2 uGridOrigin;  uniform float uPitch;",
    "uniform float uPixelRatio;  uniform float uRunTime;  uniform float uShipOut;",
    "uniform float uRowLag;  uniform vec2 uAimCell;  uniform float uScanRow;",
    "uniform vec3 uSafety;",
    "",
    "out vec3 vTint; out vec2 vSheet; out float vDocked; out float vAlpha; out float vSidePx;",
    "",
    "const float LANES = 9.0;",
    "",
    "void main() {",
    "  vec2 cell = vec2(aCell.xy);",
    "  vec2 slot = uGridOrigin + (cell + 0.5) * uPitch;",
    "",
    "  // Route: along the lane closest to the slot's height, then an elbow",
    "  // (a quadratic curve through the lane/column corner) into the slot.",
    "  float laneGap = uCanvasPx.y / LANES;",
    "  float laneY = (floor(slot.y / laneGap) + 0.5) * laneGap;",
    "  float elbowR = min(abs(slot.y - laneY) + 2.0 * uPitch, 180.0);",
    "  vec2 entry = vec2(-2.0 * uPitch, laneY);",
    "  vec2 turnOff = vec2(slot.x - elbowR, laneY);",
    "  float straight = max(turnOff.x - entry.x, 1.0);",
    "  float split = straight / (straight + 1.4 * elbowR);",
    "",
    "  float u = clamp((uRunTime - aSchedule.x) / aSchedule.y, 0.0, 1.0);",
    "  vec2 at;",
    "  if (u < split) {",
    "    at = mix(entry, turnOff, u / split);",
    "  } else {",
    "    float w = (u - split) / (1.0 - split);",
    "    w = 1.0 - (1.0 - w) * (1.0 - w);",
    "    vec2 corner = vec2(slot.x, laneY);",
    "    at = mix(mix(turnOff, corner, w), mix(corner, slot, w), w);",
    "  }",
    "  float docked = smoothstep(0.985, 1.0, u);",
    "",
    "  // Shipping: each row pulls away to the right, a moment after the row above.",
    "  float shipped = max(0.0, uShipOut * 1.4 - cell.y * uRowLag);",
    "  float shiftPx = shipped * shipped * uCanvasPx.x;",
    "  at.x += shiftPx;",
    "",
    "  // Symbol: count down one step per station passed; dock on the final one.",
    "  int stations = aCell.z;",
    "  int passed = min(int(u * float(stations)), stations);",
    "  int mark = (aCell.w + stations - passed) % 8;",
    "",
    "  // Quality control: cursor probe and the scan line flag tiles as inspected.",
    "  // (the probe follows a shipped row: its shift is converted to cells)",
    "  float probe = 1.0 - smoothstep(2.0, 5.0, distance(cell + 0.5 + vec2(shiftPx / uPitch, 0.0), uAimCell));",
    "  float scan = 1.0 - smoothstep(0.0, 2.5, abs(cell.y - uScanRow));",
    "  if (docked > 0.5 && max(probe, scan) > 0.5) mark = " + INSPECTION + ";",
    "",
    "  vec3 tint = aTint.rgb;",
    "  if (aCell.w == " + UNIT + ") tint = mix(tint, uSafety, 0.8);",
    "  // The cursor marks strongly; the passing scan only warms the row slightly.",
    "  vTint = mix(tint, uSafety, clamp(0.85 * probe + 0.35 * scan, 0.0, 0.85) * docked);",
    "  vSheet = vec2(float(mark % 4) * 0.25, float(mark / 4) * 0.5);",
    "  vDocked = docked;",
    "  float riding = smoothstep(0.0, 0.05, u) * (1.0 - docked);",
    "  vAlpha = (docked + 0.6 * riding) * (1.0 - smoothstep(0.55, 1.0, shipped));",
    "",
    "  // A docked sprite is exactly one pitch of device pixels; the fragment",
    "  // stage leaves its last pixel row and column empty as the gutter.",
    "  float sidePx = uPitch * uPixelRatio * mix(0.5, 1.0, docked);",
    "  vec2 dev = at * uPixelRatio;",
    "  gl_Position = vec4(dev.x / uBufferPx.x * 2.0 - 1.0, 1.0 - dev.y / uBufferPx.y * 2.0, 0.0, 1.0);",
    "  gl_PointSize = max(sidePx, 1.0);",
    "  vSidePx = sidePx;",
    "}"
  ].join("\n");

  var LINE_FS = [
    "#version 300 es",
    "precision highp float;",
    "uniform sampler2D uSheet;",
    "uniform vec3 uPaper;",
    "in vec3 vTint; in vec2 vSheet; in float vDocked; in float vAlpha; in float vSidePx;",
    "out vec4 fragColor;",
    "void main() {",
    "  vec2 uv = gl_PointCoord;",
    "  float mark = texture(uSheet, vSheet + uv * vec2(0.25, 0.5)).r;",
    "  // Docked: a square plate in the photo colour, the symbol pressed in darker.",
    "  // Measured in pixels, the plate stops one pixel short of the sprite's",
    "  // right and bottom edge, which gives an even one-pixel gutter.",
    "  vec2 px = uv * vSidePx;",
    "  float solid = (px.x < vSidePx - 1.0 && px.y < vSidePx - 1.0) ? 1.0 : 0.0;",
    "  vec3 plate = vTint * (1.0 - 0.5 * mark);",
    "  // On the belt: only the symbol's outline, in paper white.",
    "  vec3 rgb = mix(uPaper, plate, vDocked);",
    "  float a = mix(mark, solid, vDocked) * vAlpha;",
    "  fragColor = vec4(rgb * a, a);",
    "}"
  ].join("\n");

  // Sprite sheet with the eight ASME flow-process-chart symbols, 4 x 2.
  function symbolSheet() {
    var cellPx = 64, sheet = document.createElement("canvas");
    sheet.width = cellPx * 4; sheet.height = cellPx * 2;
    var g = sheet.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, sheet.width, sheet.height);
    g.strokeStyle = g.fillStyle = "#fff"; g.lineWidth = 7; g.lineJoin = g.lineCap = "round";
    var painters = [
      function () { g.beginPath(); g.arc(32, 32, 19, 0, TAU); g.stroke(); },                                   // operation
      function () { g.beginPath(); g.moveTo(12, 32); g.lineTo(48, 32); g.moveTo(36, 19); g.lineTo(50, 32); g.lineTo(36, 45); g.stroke(); }, // transport
      function () { g.strokeRect(14, 14, 36, 36); },                                                            // inspection
      function () { g.beginPath(); g.moveTo(16, 13); g.lineTo(30, 13); g.arc(30, 32, 19, -Math.PI / 2, Math.PI / 2); g.lineTo(16, 51); g.closePath(); g.stroke(); }, // delay
      function () { g.beginPath(); g.moveTo(12, 16); g.lineTo(52, 16); g.lineTo(32, 50); g.closePath(); g.stroke(); }, // storage
      function () { g.strokeRect(12, 12, 40, 40); g.beginPath(); g.arc(32, 32, 11, 0, TAU); g.stroke(); },     // combined activity
      function () { g.beginPath(); g.moveTo(32, 10); g.lineTo(54, 32); g.lineTo(32, 54); g.lineTo(10, 32); g.closePath(); g.stroke(); }, // decision
      function () { g.beginPath(); g.arc(32, 32, 7, 0, TAU); g.fill(); }                                        // unit
    ];
    painters.forEach(function (paint, i) {
      g.save(); g.translate((i % 4) * cellPx, Math.floor(i / 4) * cellPx); paint(); g.restore();
    });
    return sheet;
  }

  // Deterministic value in [0, 1) for a pair of integers.
  function hash01(a, b) {
    var h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  }

  function readPhoto(img) {
    var w = SAMPLE_WIDTH, h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
    var board = document.createElement("canvas");
    board.width = w; board.height = h;
    var g = board.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    return { w: w, h: h, rgba: g.getImageData(0, 0, w, h).data };
  }

  // Columns for a box `deviceWidth` device pixels wide, aiming at ~7.5 CSS px tiles.
  function columnsFor(deviceWidth, ratio) {
    var target = Math.max(4, Math.round(7.5 * ratio));
    return Math.min(110, Math.max(36, Math.floor(deviceWidth / target)));
  }

  /* Build the parts list for a grid of `cols` columns.
     beltStartX: the slot grid's left edge in canvas px, used for belt times. */
  function buildLine(photo, cols, pitch, beltStartX, focus) {
    var rows = Math.max(1, Math.round(cols * photo.h / photo.w));
    var parts = [];
    for (var r = 0; r < rows; r++) {
      var y0 = Math.floor(r * photo.h / rows), y1 = Math.max(y0 + 1, Math.floor((r + 1) * photo.h / rows));
      for (var c = 0; c < cols; c++) {
        var x0 = Math.floor(c * photo.w / cols), x1 = Math.max(x0 + 1, Math.floor((c + 1) * photo.w / cols));
        var red = 0, green = 0, blue = 0, opacity = 0, px = 0;
        for (var y = y0; y < y1; y++) {
          for (var x = x0; x < x1; x++) {
            var i = (y * photo.w + x) * 4, a = photo.rgba[i + 3] / 255;
            red += photo.rgba[i] * a; green += photo.rgba[i + 1] * a; blue += photo.rgba[i + 2] * a;
            opacity += a; px++;
          }
        }
        var cover = opacity / px;
        // Soft edges: keep a square only when its coverage beats a threshold
        // that mixes a 4x4 Bayer matrix with per-square noise.
        var bar = 0.3 * (BAYER[(r & 3) * 4 + (c & 3)] + 0.5) / 16 + 0.3 * hash01(c * 7 + 3, r * 13 + 1);
        if (cover < 0.12 || cover < bar) continue;
        var pick = hash01(r + 101, c + 57), symbol = 0;
        while (pick > SYMBOL_MIX[symbol]) symbol++;
        parts.push({
          col: c, row: r, symbol: symbol,
          stations: 3 + Math.floor(hash01(c + 19, r + 23) * 7),
          rgb: [red, green, blue].map(function (v) { return Math.round(255 * Math.pow(v / opacity / 255, 1.1)); }),
          reach: Math.hypot((c + 0.5) / cols - focus[0], ((r + 0.5) / rows - focus[1]) * 0.8)
        });
      }
    }

    // Dispatch from the focus point outwards: order by distance, front-loaded.
    parts.sort(function (p, q) { return p.reach - q.reach; });
    var n = parts.length;
    var cells = new Int16Array(n * 4), tints = new Uint8Array(n * 4), schedule = new Float32Array(n * 2);
    var lastDock = 0;
    parts.forEach(function (p, k) {
      var dispatch = 2.6 * Math.pow(k / Math.max(1, n), 0.85) + 0.12 * hash01(p.col, p.row);
      var route = beltStartX + (p.col + 0.5) * pitch + 2 * pitch;
      var belt = Math.min(2.4, Math.max(0.7, route / BELT_PX_PER_S));
      lastDock = Math.max(lastDock, dispatch + belt);
      cells.set([p.col, p.row, p.stations, p.symbol], k * 4);
      tints.set([p.rgb[0], p.rgb[1], p.rgb[2], 255], k * 4);
      schedule.set([dispatch, belt], k * 2);
    });
    return { cols: cols, rows: rows, count: n, cells: cells, tints: tints, schedule: schedule, assembledAt: lastDock };
  }

  function compileStage(gl, type, source) {
    var s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader compile failed");
    return s;
  }

  function hexColour(hex) {
    var v = parseInt(hex.replace("#", ""), 16);
    return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
  }

  /* init(canvas, { anchor, src, still, focus, accent, ink, onError })
       -> { ready, start(), setShipOut(v) }, or null without WebGL2.
     anchor: the element whose box the finished portrait fills; the stylesheet
     decides that box at each breakpoint. */
  function init(canvas, opts) {
    var gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return null;

    var program = gl.createProgram();
    try {
      gl.attachShader(program, compileStage(gl, gl.VERTEX_SHADER, LINE_VS));
      gl.attachShader(program, compileStage(gl, gl.FRAGMENT_SHADER, LINE_FS));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "link failed");
    } catch (err) {
      console.warn("PortraitField disabled:", err);
      return null;
    }
    gl.useProgram(program);

    var u = {};
    ["uSheet", "uPaper", "uSafety", "uCanvasPx", "uBufferPx", "uPixelRatio", "uGridOrigin", "uPitch", "uRowLag",
      "uRunTime", "uShipOut", "uAimCell", "uScanRow"].forEach(function (name) { u[name] = gl.getUniformLocation(program, name); });
    gl.uniform3fv(u.uSafety, hexColour(opts.accent || "#ffc21a"));
    gl.uniform3fv(u.uPaper, hexColour(opts.ink || "#ecebe4"));

    // Three buffers, one per data type: integer cell data, byte colours, float timings.
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var cellBuffer = gl.createBuffer(), tintBuffer = gl.createBuffer(), timeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cellBuffer);
    var loc = gl.getAttribLocation(program, "aCell");
    gl.enableVertexAttribArray(loc); gl.vertexAttribIPointer(loc, 4, gl.SHORT, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, tintBuffer);
    loc = gl.getAttribLocation(program, "aTint");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, timeBuffer);
    loc = gl.getAttribLocation(program, "aSchedule");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    var anchor = opts.anchor, focus = opts.focus || [0.5, 0.3];
    // opts.still: the page's decided motion state. Without it, follow the system
    // setting live.
    var calmQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    var calm = typeof opts.still === "boolean" ? opts.still : calmQuery.matches;
    var photo = null, line = null, stopped = false;
    var stage = { w: 1, h: 1, ratio: 1, originX: 0, originY: 0, pitch: 8 };
    var asked = false, runFrom = null, shipOut = 0, pointerAt = null;
    var loopId = 0, inView = true, tabShown = !document.hidden;

    function halt(reason) {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(loopId); loopId = 0;
      console.warn("PortraitField stopped:", reason);
      if (opts.onError) opts.onError();
    }

    // Recompute geometry; rebuild the line only when the column count changes.
    function relayout() {
      if (stopped) return;
      var frameRect = canvas.getBoundingClientRect(), photoRect = anchor.getBoundingClientRect();
      stage.ratio = Math.min(window.devicePixelRatio || 1, 2);
      stage.w = Math.max(1, frameRect.width); stage.h = Math.max(1, frameRect.height);
      var wantW = Math.round(stage.w * stage.ratio), wantH = Math.round(stage.h * stage.ratio);
      if (canvas.width !== wantW) canvas.width = wantW;
      if (canvas.height !== wantH) canvas.height = wantH;
      // Lay the grid on whole device pixels: an integer pitch, a snapped corner,
      // and the leftover (less than one tile) split evenly on both sides.
      var deviceW = photoRect.width * stage.ratio;
      var cols = columnsFor(deviceW, stage.ratio);
      var devicePitch = Math.max(3, Math.floor(deviceW / cols));
      stage.pitch = devicePitch / stage.ratio;
      stage.originX = Math.round((photoRect.left - frameRect.left) * stage.ratio + (deviceW - devicePitch * cols) / 2) / stage.ratio;
      stage.originY = Math.round((photoRect.top - frameRect.top) * stage.ratio) / stage.ratio;
      if (photo && photoRect.width > 0) {
        if (!line || line.cols !== cols) {
          try {
            line = buildLine(photo, cols, stage.pitch, stage.originX, focus);
            canvas.dataset.parts = String(line.count);
            gl.bindBuffer(gl.ARRAY_BUFFER, cellBuffer); gl.bufferData(gl.ARRAY_BUFFER, line.cells, gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, tintBuffer); gl.bufferData(gl.ARRAY_BUFFER, line.tints, gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, timeBuffer); gl.bufferData(gl.ARRAY_BUFFER, line.schedule, gl.STATIC_DRAW);
          } catch (err) { halt(err); return; }
        }
      }
      beginIfReady();
      paint(performance.now());   // a buffer resize clears the canvas, so repaint now
    }

    function paint(now) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (stopped || !line || !line.count || runFrom === null) return;
      var t = calm ? 1e4 : (now - runFrom) / 1000;
      // The inspection scan starts a second after the last part docks and
      // sweeps top to bottom every seven seconds.
      var sinceDone = t - line.assembledAt - 1;
      var scanRow = calm || sinceDone < 0 ? -100 : ((sinceDone % 7) / 7) * (line.rows + 16) - 8;
      // The cursor is converted to grid cells every frame, so the probe stays
      // under it while the page scrolls even if the mouse does not move.
      var aimCol = -1000, aimRow = -1000;
      if (pointerAt && !calm) {
        var frame = canvas.getBoundingClientRect();
        var col = (pointerAt.x - frame.left - stage.originX) / stage.pitch;
        var row = (pointerAt.y - frame.top - stage.originY) / stage.pitch;
        if (col > -6 && row > -6 && col < line.cols + 6 && row < line.rows + 6) { aimCol = col; aimRow = row; }
      }
      gl.uniform2f(u.uCanvasPx, stage.w, stage.h);
      gl.uniform2f(u.uBufferPx, canvas.width, canvas.height);
      gl.uniform1f(u.uPixelRatio, stage.ratio);
      gl.uniform2f(u.uGridOrigin, stage.originX, stage.originY);
      gl.uniform1f(u.uPitch, stage.pitch);
      gl.uniform1f(u.uRowLag, 0.5 / line.rows);
      gl.uniform1f(u.uRunTime, t);
      gl.uniform1f(u.uShipOut, calm ? 0 : shipOut);
      gl.uniform1f(u.uScanRow, scanRow);
      gl.uniform2f(u.uAimCell, aimCol, aimRow);
      gl.drawArrays(gl.POINTS, 0, line.count);
    }

    function step(now) { loopId = requestAnimationFrame(step); paint(now); }
    function reconcile() {
      var run = !stopped && !calm && inView && tabShown && line !== null;
      if (run && !loopId) loopId = requestAnimationFrame(step);
      if (!run && loopId) { cancelAnimationFrame(loopId); loopId = 0; }
      if (!run && line && !stopped) paint(performance.now());
    }
    function beginIfReady() {
      // The line starts once the intro has asked for it and the parts exist.
      if (asked && line && line.count && runFrom === null) { runFrom = performance.now(); reconcile(); }
    }

    new IntersectionObserver(function (entries) { inView = entries[entries.length - 1].isIntersecting; reconcile(); }, { threshold: 0.01 }).observe(canvas);
    document.addEventListener("visibilitychange", function () { tabShown = !document.hidden; reconcile(); });
    var queued = 0;
    function queueRelayout() { cancelAnimationFrame(queued); queued = requestAnimationFrame(relayout); }
    var sizes = new ResizeObserver(queueRelayout);
    sizes.observe(canvas);
    sizes.observe(anchor);

    // A pixel-density change (e.g. dragging the window to another monitor)
    // keeps the CSS size, so ResizeObserver stays silent; watch it directly.
    (function watchDensity() {
      window.matchMedia("(resolution: " + (window.devicePixelRatio || 1) + "dppx)")
        .addEventListener("change", function () { queueRelayout(); watchDensity(); }, { once: true });
    })();

    // Reduced motion can be switched on or off while the page is open.
    calmQuery.addEventListener("change", function (e) {
      if (typeof opts.still === "boolean") return;   // the page decides motion itself
      calm = e.matches;
      if (calm) { shipOut = 0; pointerAt = null; }
      reconcile();
    });

    // Only the last client position is stored; paint() turns it into cells.
    if (window.matchMedia("(pointer: fine)").matches) {
      window.addEventListener("pointermove", function (e) {
        if (!calm) pointerAt = { x: e.clientX, y: e.clientY };
      }, { passive: true });
      document.documentElement.addEventListener("mouseleave", function () { pointerAt = null; });
    }

    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); halt("WebGL context lost"); });

    var ready = new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = "async";
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Could not load " + opts.src)); };
      img.src = opts.src;
    }).then(function (img) {
      photo = readPhoto(img);
      var tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, symbolSheet());
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(u.uSheet, 0);
      relayout();
      reconcile();
    }).catch(halt);

    return {
      ready: ready,
      start: function () { asked = true; beginIfReady(); },
      setShipOut: function (v) { shipOut = calm ? 0 : v; }
    };
  }

  window.PortraitField = { init: init };
})();
