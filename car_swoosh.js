/**
 * 🌊 car_swoosh.js — Dedicated Car Swoosh ("Cool Brush") Placement & Calibration Engine
 * 1:1 port of test_car_swoosh.py + swoosh_calibration.json using largebrush.png
 */
(function () {
  "use strict";

  const SWOOSH_MODEL = {
    size_a: 0.691,
    size_b: 1.312,
    asp_min: 0.39,
    asp_max: 0.52,
    top_gap: 0.1235,
    dx: 0.0825,
    rot_extra_ccw: 0.40,
    ref_w: 1740.0,
    ref_tip_dy: 588.0,
    paper_bg: [250, 248, 244],
  };

  const SWOOSH_REF_ENV = [
    [-846, -272], [-806, -304], [-766, -322], [-726, -343], [-686, -359], [-646, -373], [-606, -398], [-566, -412],
    [-526, -420], [-486, -433], [-446, -443], [-406, -455], [-366, -469], [-326, -481], [-286, -501], [-246, -501],
    [-206, -482], [-166, -486], [-126, -501], [-86, -526], [-46, -541], [-6, -546], [34, -549], [74, -553],
    [114, -558], [154, -559], [194, -562], [234, -567], [274, -568], [314, -575], [354, -577], [394, -571],
    [434, -564], [474, -560], [514, -568], [554, -569],
  ];

  const SWOOSH_CALIBRATION = {
    global: {},
    per_file: {
      "A.jpeg": { size_trim: 0.9709, dx_trim: 0.0024, gap_trim: -0.0216, ang_trim: 0.25 },
      "B.jpg":  { size_trim: 0.9709, dx_trim: 0.0084, gap_trim: -0.0312, ang_trim: 0.0 },
      "C.jpg":  { size_trim: 1.0,    dx_trim: -0.0036, gap_trim: -0.0072, ang_trim: 0.0 },
      "D.jpg":  { size_trim: 1.0,    dx_trim: -0.0036, gap_trim: -0.0348, ang_trim: 0.25 },
      "F.jpg":  { size_trim: 1.0,    dx_trim: -0.0012, gap_trim: -0.0012, ang_trim: 0.0 },
      "H.jpg":  { size_trim: 1.0,    dx_trim: 0.0,     gap_trim: 0.0,     ang_trim: 0.0 },
      "J.jpg":  { size_trim: 1.0,    dx_trim: 0.0048,  gap_trim: -0.0024, ang_trim: 0.75 },
      "K.jpg":  { size_trim: 1.0,    dx_trim: -0.0012, gap_trim: -0.0072, ang_trim: 0.0 },
      "L.jpg":  { size_trim: 0.9709, dx_trim: 0.0048,  gap_trim: -0.0312, ang_trim: 0.75 },
      "M.jpg":  { size_trim: 0.9709, dx_trim: -0.0012, gap_trim: -0.0096, ang_trim: -1.0 },
      "O.jpg":  { size_trim: 0.9709, dx_trim: 0.0096,  gap_trim: -0.0108, ang_trim: -0.25 },
      "T.jpg":  { size_trim: 0.9709, dx_trim: -0.0084, gap_trim: -0.0096, ang_trim: -1.75 },
      "V.jpg":  { size_trim: 0.9426, dx_trim: 0.0156,  gap_trim: -0.0216, ang_trim: 2.25 },
      "iniput.jpg": { size_trim: 1.0,    dx_trim: 0.0,     gap_trim: 0.0,     ang_trim: 0.0 },
      "inprut.jpg": { size_trim: 0.9426, dx_trim: 0.0096,  gap_trim: -0.0492, ang_trim: -0.25 },
      "inpuht.jpg": { size_trim: 0.9151, dx_trim: -0.0072, gap_trim: -0.0132, ang_trim: -0.75 },
      "iut.jpg":    { size_trim: 0.9709, dx_trim: -0.0108, gap_trim: -0.0216, ang_trim: -2.25 },
      "watercolor-1775089941900.jpg": { size_trim: 0.9151, dx_trim: 0.0048, gap_trim: -0.0024, ang_trim: 0.0 },
    },
  };

  let _cachedLargeBrushGeom = null;

  function getCalibrationForCurrentFile() {
    const fname = (STATE.uploadedFile && STATE.uploadedFile.name) || "";
    return (SWOOSH_CALIBRATION.per_file && SWOOSH_CALIBRATION.per_file[fname]) || {};
  }

  function buildInitialCoolSwooshParams(cfg) {
    const cal = getCalibrationForCurrentFile();
    return {
      opacity: cfg.COOL_BRUSH_OPACITY ?? 0.92,
      baseOpacity: 1.0,
      sizeTrim: Math.round((cal.size_trim ?? 1.0) * 100),
      dxTrim: Math.round((cal.dx_trim ?? 0.0) * 1000) / 10,
      gapTrim: Math.round((cal.gap_trim ?? 0.0) * 1000) / 10,
      angTrim: cal.ang_trim ?? 0.0,
      facingOverride: cal.facing || "auto",
      customColorMode: false,
      customColorHex: "#4a525a",
      brightness: 100,
      contrast: 100,
      saturation: 100,
    };
  }

  function getLargeBrushGeometry(brushImg) {
    if (_cachedLargeBrushGeom) return _cachedLargeBrushGeom;
    const w = brushImg.naturalWidth || brushImg.width;
    const h = brushImg.naturalHeight || brushImg.height;
    const c = createCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.drawImage(brushImg, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h).data;
    c.width = 1; c.height = 1;

    const alpha = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = imgData[i * 4 + 3] / 255.0;

    const k0 = w / SWOOSH_MODEL.ref_w;
    const rOpen = Math.max(1, Math.round(2.5 * k0));

    const extractTopPts = (flip) => {
      const pts = [];
      for (let x = rOpen; x < w - rOpen; x += 2) {
        let topY = -1;
        for (let y = rOpen; y < h - rOpen; y++) {
          const sx = flip ? w - 1 - x : x;
          if (
            alpha[y * w + sx] > 0.10 &&
            alpha[(y - rOpen) * w + sx] > 0.10 &&
            alpha[(y + rOpen) * w + sx] > 0.10 &&
            alpha[y * w + Math.max(0, sx - rOpen)] > 0.10 &&
            alpha[y * w + Math.min(w - 1, sx + rOpen)] > 0.10
          ) {
            topY = y;
            break;
          }
        }
        if (topY >= 0) pts.push([x - w / 2.0, topY - h / 2.0]);
      }
      return pts;
    };

    const envScore = (pts, kappa, phiDeg) => {
      if (pts.length < 10) return 1e9;
      const ph = (phiDeg * Math.PI) / 180.0;
      const cs = Math.cos(ph), sn = Math.sin(ph);
      const nBins = SWOOSH_REF_ENV.length;
      const x0Ref = SWOOSH_REF_ENV[0][0] - 20.0;
      const best = new Float64Array(nBins).fill(Infinity);

      for (let i = 0; i < pts.length; i++) {
        const px = pts[i][0], py = pts[i][1];
        const X = (px * cs + py * sn) / kappa;
        const Y = (-px * sn + py * cs) / kappa;
        const b = Math.floor((X - x0Ref) / 40.0);
        if (b >= 0 && b < nBins && Y < best[b]) best[b] = Y;
      }
      let sumSq = 0, cnt = 0;
      for (let b = 0; b < nBins; b++) {
        if (Number.isFinite(best[b])) {
          const d = best[b] - SWOOSH_REF_ENV[b][1];
          sumSq += d * d;
          cnt++;
        }
      }
      if (cnt < 8) return 1e9;
      const cov = cnt / nBins;
      return Math.sqrt(sumSq / cnt) + 60.0 * (1.0 - cov);
    };

    let best = { score: 1e9, flip: false, kappa: k0, phi: 0 };
    for (const flip of [false, true]) {
      const pts = extractTopPts(flip);
      for (let ki = 0; ki < 48; ki++) {
        const kappa = 0.30 * k0 * Math.pow(10.0, ki / 47.0);
        for (let phi = -45; phi <= 45; phi += 3) {
          const sc = envScore(pts, kappa, phi);
          if (sc < best.score) best = { score: sc, flip, kappa, phi, pts };
        }
      }
    }

    let { flip, kappa, phi, score, pts } = best;
    for (const [stepK, stepP] of [[0.04, 1.0], [0.015, 0.4], [0.006, 0.15]]) {
      let improved = true;
      while (improved) {
        improved = false;
        for (const dk of [-stepK, 0, stepK]) {
          for (const dp of [-stepP, 0, stepP]) {
            if (dk === 0 && dp === 0) continue;
            const k2 = kappa * (1 + dk), p2 = phi + dp;
            const sc = envScore(pts, k2, p2);
            if (sc < score - 1e-6) { kappa = k2; phi = p2; score = sc; improved = true; }
          }
        }
      }
    }

    _cachedLargeBrushGeom = { flip, kappa, phi_ccw: phi, rms: score };
    console.log(`🌊 Cool Brush calibrated: mirrored=${flip}, kappa=${kappa.toFixed(3)}, phi=${phi.toFixed(1)}°, RMS=${score.toFixed(1)}px`);
    return _cachedLargeBrushGeom;
  }

  function rgbToHsv01(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h * 360.0, s, v];
  }

  function hsvToRgb255(hDeg, s, v) {
    const h = (((hDeg % 360) + 360) % 360) / 60;
    const i = Math.floor(h);
    const f = h - i;
    const p = v * (1 - s);
    const q = v * (1 - s * f);
    const t = v * (1 - s * (1 - f));
    let r = 0, g = 0, b = 0;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function analyzeCarSilhouetteAndColorForSwoosh() {
    if (STATE.swooshCarAnalysis) return STATE.swooshCarAnalysis;
    const subImg = STATE.serverImages && (STATE.serverImages.subject_raw || STATE.serverImages.subject_cc);
    if (!subImg || !STATE.payload) return null;

    const [bx, by, bw, bh] = STATE.payload.full_subject_box || [
      Math.max(0, STATE.payload.offset[0]),
      Math.max(0, STATE.payload.offset[1]),
      STATE.payload.subject_size[0],
      STATE.payload.subject_size[1],
    ];

    const sw = Math.min(360, Math.max(64, bw >> 2));
    const sh = Math.max(32, Math.round(bh * (sw / Math.max(1, bw))));
    const c = createCanvas(sw, sh);
    c.getContext("2d").drawImage(subImg, bx, by, bw, bh, 0, 0, sw, sh);
    const d = c.getContext("2d").getImageData(0, 0, sw, sh).data;
    c.width = 1; c.height = 1;

    let minX = sw, maxX = -1, minY = sh, maxY = -1;
    const topCol = new Float32Array(sw).fill(NaN);
    const botCol = new Float32Array(sw).fill(NaN);

    for (let x = 0; x < sw; x++) {
      let yFirst = -1, yLast = -1;
      for (let y = 0; y < sh; y++) {
        if (d[(y * sw + x) * 4 + 3] > 127) {
          if (yFirst < 0) yFirst = y;
          yLast = y;
        }
      }
      if (yFirst >= 0) {
        topCol[x] = yFirst;
        botCol[x] = yLast;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (yFirst < minY) minY = yFirst;
        if (yLast > maxY) maxY = yLast;
      }
    }
    if (maxX <= minX || maxY <= minY) return null;

    const wSpan = maxX - minX + 1;
    const hSpan = maxY - minY + 1;
    const kSmooth = Math.max(3, Math.floor(wSpan / 20));
    let bestRoofY = 1e9, roofX = 0.5;
    for (let x = minX; x <= maxX; x++) {
      let sum = 0, cnt = 0;
      for (let j = -kSmooth; j <= kSmooth; j++) {
        const xi = Math.max(minX, Math.min(maxX, x + j));
        if (!Number.isNaN(topCol[xi])) { sum += topCol[xi]; cnt++; }
      }
      const avg = cnt > 0 ? sum / cnt : 1e9;
      if (avg < bestRoofY) {
        bestRoofY = avg;
        roofX = (x - minX) / Math.max(1, wSpan);
      }
    }

    let sx = 0, sy = 0, sxx = 0, sxy = 0, nPts = 0;
    let lhSum = 0, lhCnt = 0, rhSum = 0, rhCnt = 0;
    for (let x = minX; x <= maxX; x++) {
      const t = (x - minX) / Math.max(1, wSpan);
      const hCol = !Number.isNaN(botCol[x]) && !Number.isNaN(topCol[x]) ? botCol[x] - topCol[x] : 0;
      if (t < 0.25) { lhSum += hCol; lhCnt++; }
      if (t > 0.75) { rhSum += hCol; rhCnt++; }
      if (t > 0.12 && t < 0.88 && !Number.isNaN(botCol[x])) {
        sx += x; sy += botCol[x]; sxx += x * x; sxy += x * botCol[x]; nPts++;
      }
    }
    const slope = nPts > 5 ? (nPts * sxy - sx * sy) / Math.max(1e-5, nPts * sxx - sx * sx) : 0;
    const slopeDeg = (Math.atan(slope) * 180) / Math.PI;
    const lh = (lhCnt ? lhSum / lhCnt : 0) / Math.max(1, hSpan);
    const rh = (rhCnt ? rhSum / rhCnt : 0) / Math.max(1, hSpan);
    const z = 2.0 * (roofX - 0.5) / 0.15 + (-slopeDeg) / 6.0 + (rh - lh) / 0.10;
    const facingAuto = (STATE.wheelTurnData && STATE.wheelTurnData.facing) || (z > 0 ? "LEFT" : "RIGHT");

    const yZone0 = Math.floor(minY + 0.25 * hSpan);
    const yZone1 = Math.ceil(minY + 0.80 * hSpan);
    const zoneR = [], zoneG = [], zoneB = [], zoneSat = [];
    const chromR = [], chromG = [], chromB = [];

    for (let y = yZone0; y <= yZone1; y++) {
      for (let x = minX; x <= maxX; x++) {
        const p = (y * sw + x) * 4;
        if (d[p + 3] < 230) continue;
        const r = d[p], g = d[p + 1], b = d[p + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum <= 40 || lum >= 230) continue;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = (mx - mn) / (mx + 1.0);
        zoneR.push(r); zoneG.push(g); zoneB.push(b); zoneSat.push(sat);
        if (sat > 0.25) { chromR.push(r); chromG.push(g); chromB.push(b); }
      }
    }

    const median = (arr) => {
      if (!arr.length) return 128;
      const s = [...arr].sort((a, b) => a - b);
      return s[s.length >> 1];
    };
    const useChrom = chromR.length > 0.10 * zoneR.length;
    const medR = median(useChrom ? chromR : zoneR);
    const medG = median(useChrom ? chromG : zoneG);
    const medB = median(useChrom ? chromB : zoneB);
    const medSat = zoneSat.length ? median(zoneSat) : 0;
    const [hue, sat, val] = rgbToHsv01(medR, medG, medB);

    // Exact swoosh_target_appearance rules from test_car_swoosh.py
    let tH = hue, tS = sat, tV = val;
    if (medSat < 0.30) {
      if (hue >= 100.0 && hue <= 300.0 && sat > 0.15) {
        tH = hue; tS = 0.30; tV = 0.32;
      } else {
        tH = hue; tS = 0.03; tV = 0.32;
      }
    } else if (hue >= 35.0 && hue <= 75.0) {
      tH = hue + 20.0; tS = 0.12; tV = 0.29;
    } else if (hue >= 345.0 || hue < 35.0) {
      tH = (hue + 16.0) % 360.0; tS = Math.min(0.85, 0.77 * sat); tV = 0.46;
    } else {
      tH = hue; tS = Math.min(0.55, 0.80 * sat); tV = 0.36;
    }

    const appearanceRgb = hsvToRgb255(tH, Math.max(0, Math.min(1, tS)), Math.max(0, Math.min(1, tV)));
    const op = 0.92;
    const pigmentRgb = appearanceRgb.map((cVal, i) =>
      Math.max(0, Math.min(255, Math.round((cVal - (1.0 - op) * SWOOSH_MODEL.paper_bg[i]) / op)))
    );

    const scX = bw / sw, scY = bh / sh;
    const carBbox = [
      Math.round(bx + minX * scX),
      Math.round(by + minY * scY),
      Math.round(bx + (maxX + 1) * scX),
      Math.round(by + (maxY + 1) * scY),
    ];

    STATE.swooshCarAnalysis = {
      carBbox,
      facingAuto,
      appearanceRgb,
      pigmentRgb,
    };
    return STATE.swooshCarAnalysis;
  }

  function rerenderCoolSwooshLayer(skipComposite = false) {
    const lyr = STATE.layers && STATE.layers.cool_brush;
    if (!lyr || !STATE.payload) return;
    if (typeof isCarPresetActive === "function" && !isCarPresetActive()) {
      if (lyr.baseCanvas) {
        lyr.baseCanvas.width = 1;
        lyr.baseCanvas.height = 1;
        lyr.baseCanvas = null;
      }
      return;
    }
    const brushImg = STATE.brushImages["largebrush.png"] || STATE.brushImages["bgbrush.png"];
    if (!brushImg) return;

    const [overW, overH] = STATE.payload.canvas_size;
    if (!lyr.baseCanvas || lyr.baseCanvas.width !== overW || lyr.baseCanvas.height !== overH) {
      lyr.baseCanvas = createCanvas(overW, overH);
    }
    const ctx = lyr.baseCanvas.getContext("2d");
    ctx.clearRect(0, 0, overW, overH);

    const an = analyzeCarSilhouetteAndColorForSwoosh();
    if (!an) return;

    const geom = getLargeBrushGeometry(brushImg);
    const p = lyr.params;
    const facing = p.facingOverride === "LEFT" || p.facingOverride === "RIGHT" ? p.facingOverride : an.facingAuto;
    const [x0, y0, x1, y1] = an.carBbox;
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const carCenterX = 0.5 * (x0 + x1);

    const sizeTrim = (p.sizeTrim ?? 100) / 100.0;
    const dxTrim = (p.dxTrim ?? 0.0) / 100.0;
    const gapTrim = (p.gapTrim ?? 0.0) / 100.0;
    const angTrim = p.angTrim ?? 0.0;

    const asp = Math.max(SWOOSH_MODEL.asp_min, Math.min(SWOOSH_MODEL.asp_max, h / w));
    const nu = (SWOOSH_MODEL.size_a + SWOOSH_MODEL.size_b * asp) * sizeTrim;
    const sRef = (nu * w) / SWOOSH_MODEL.ref_w;
    const sigma = sRef / geom.kappa;
    const tipY = y0 - (SWOOSH_MODEL.top_gap + gapTrim) * w;
    const cy = tipY + SWOOSH_MODEL.ref_tip_dy * sRef;
    const sign = facing === "LEFT" ? 1.0 : -1.0;
    const cx = carCenterX + sign * (SWOOSH_MODEL.dx + dxTrim) * w;
    const angleCcw = geom.phi_ccw + SWOOSH_MODEL.rot_extra_ccw + angTrim;
    const mirrorX = facing === "RIGHT";

    const bw = brushImg.naturalWidth || brushImg.width;
    const bh = brushImg.naturalHeight || brushImg.height;
    if (!STATE._colorizedSwooshCache) STATE._colorizedSwooshCache = {};
    const targetRgb = p.customColorMode ? hexToRgb(p.customColorHex || "#4a525a") : an.pigmentRgb;
    const colKey = `${targetRgb.join(",")}_${geom.flip}`;

    let coloredCanvas = STATE._colorizedSwooshCache[colKey];
    if (!coloredCanvas) {
      coloredCanvas = createCanvas(bw, bh);
      const cCtx = coloredCanvas.getContext("2d");
      if (geom.flip) {
        cCtx.translate(bw, 0);
        cCtx.scale(-1, 1);
      }
      cCtx.drawImage(brushImg, 0, 0);
      cCtx.setTransform(1, 0, 0, 1, 0, 0);
      const imgD = cCtx.getImageData(0, 0, bw, bh);
      const data = imgD.data;

      // Stretch alpha so 98th percentile of visible stroke is 255 (exact match to colorize_swoosh_rgba)
      const hist = new Uint32Array(256);
      let visCnt = 0;
      for (let i = 3; i < data.length; i += 4) {
        const a = data[i];
        if (a > 20) { hist[a]++; visCnt++; }
      }
      let aRef = 255;
      if (visCnt > 0) {
        let acc = 0;
        const targetCnt = visCnt * 0.98;
        for (let v = 0; v < 256; v++) {
          acc += hist[v];
          if (acc >= targetCnt) { aRef = Math.max(8, v); break; }
        }
      }
      const aScale = 255.0 / aRef;
      const [cr, cg, cb] = targetRgb;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;
        data[i] = cr;
        data[i + 1] = cg;
        data[i + 2] = cb;
        data[i + 3] = Math.min(255, Math.round(a * aScale));
      }
      cCtx.putImageData(imgD, 0, 0);
      STATE._colorizedSwooshCache = { [colKey]: coloredCanvas };
    }

    // Apply exact 2x3 affine matrix M from placement_matrix() in test_car_swoosh.py
    const ph = (angleCcw * Math.PI) / 180.0;
    const cs = Math.cos(ph), sn = Math.sin(ph);
    let m00 = sigma * cs, m01 = sigma * sn;
    let m10 = -sigma * sn, m11 = sigma * cs;
    if (mirrorX) {
      m00 = -m00;
      m01 = -m01;
    }
    const tx = cx - (m00 * (bw * 0.5) + m01 * (bh * 0.5));
    const ty = cy - (m10 * (bw * 0.5) + m11 * (bh * 0.5));

    ctx.save();
    ctx.setTransform(m00, m10, m01, m11, tx, ty);
    ctx.drawImage(coloredCanvas, 0, 0);
    ctx.restore();

    if (typeof invalidateMoveFastStack === "function") invalidateMoveFastStack();
    if (_stack.id !== "cool_brush") invalidateStack();
    if (!skipComposite) compositeAllLayers();
  }

  window.SWOOSH_CALIBRATION = SWOOSH_CALIBRATION;
  window.buildInitialCoolSwooshParams = buildInitialCoolSwooshParams;
  window.analyzeCarSilhouetteAndColorForSwoosh = analyzeCarSilhouetteAndColorForSwoosh;
  window.rerenderCoolSwooshLayer = rerenderCoolSwooshLayer;
})();