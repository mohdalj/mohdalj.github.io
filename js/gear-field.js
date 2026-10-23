/* ==========================================================================
   Gear outline: the SVG path for the slowly turning gear behind the contact
   section (12 trapezoidal teeth on a unit circle).
   ========================================================================== */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var TEETH = 12, R_TIP = 1, R_ROOT = 0.84;

  // Radius of the outline at angle theta: flat root, ramped flank, flat tip.
  function contour(theta) {
    var t = (((theta / TAU) * TEETH) % 1 + 1) % 1;
    var rise = R_TIP - R_ROOT;
    if (t < 0.18 || t > 0.67) return R_ROOT;
    if (t < 0.3) return R_ROOT + rise * ((t - 0.18) / 0.12);
    if (t <= 0.55) return R_TIP;
    return R_TIP - rise * ((t - 0.55) / 0.12);
  }

  function svgPath(scale) {
    scale = scale || 100;
    var d = [];
    for (var i = 0; i <= 720; i++) {
      var th = (i / 720) * TAU, r = contour(th) * scale;
      d.push((i ? "L" : "M") + (Math.cos(th) * r).toFixed(2) + " " + (Math.sin(th) * r).toFixed(2));
    }
    return d.join("") + "Z";
  }

  window.GearField = { svgPath: svgPath };
})();
