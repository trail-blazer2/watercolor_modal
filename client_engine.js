/**
 * ⚡ client_engine.js — Production WebGL2 GPU Client Engine + Multi-Eye Beautifier (v8 Port) + Memory/Speed Profiler
 */
(function () {
  "use strict";

  // ==========================================================================
  // 0. STUDIO SPEED & MEMORY PROFILER (Verify Local GPU Execution & RAM Budget)
  // ==========================================================================
  const StudioProfiler = {
    lastReport: null,
    measureCanvasMB() {
      let bytes = 0;
      let count = 0;
      const seen = new Set();
      const addC = (c) => {
        if (!c || seen.has(c) || !c.width || !c.height) return;
        if (c.width <= 2 && c.height <= 2) return;
        seen.add(c);
        count++;
        bytes += c.width * c.height * 4;
      };
      addC(displayCanvas);
      addC(_tempLayerCanvas);
      if (typeof _stack !== "undefined") { addC(_stack.below); addC(_stack.above); }
      if (typeof _moveFastStack !== "undefined") {
        addC(_moveFastStack.movableUnder);
        addC(_moveFastStack.subjectGroup);
        addC(_moveFastStack.fixedOvals);
        addC(_moveFastStack.movableOver);
      }
      if (STATE.maskCanvas) addC(STATE.maskCanvas);
      if (STATE.serverImages) {
        for (const v of Object.values(STATE.serverImages)) addC(v);
      }
      if (STATE.layers) {
        for (const lyr of Object.values(STATE.layers)) {
          addC(lyr.baseCanvas);
          addC(lyr.paintCanvas);
          addC(lyr.eraseCanvas);
        }
      }
      const mb = Number((bytes / (1024 * 1024)).toFixed(1));
      const heapMB =
        performance && performance.memory
          ? Number((performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1))
          : null;
      return { activeCanvases: count, canvasMB: mb, iosSafeBudgetPct: Math.round((mb / 256) * 100), jsHeapMB: heapMB };
    },
    report() {
      const mem = this.measureCanvasMB();
      console.log(
        `%c⚡ Studio Memory & Engine Status: ${mem.activeCanvases} active canvases = ${mem.canvasMB} MB (${mem.iosSafeBudgetPct}% of 256 MB mobile limit)` +
          (mem.jsHeapMB !== null ? ` | JS Heap: ${mem.jsHeapMB} MB` : ""),
        "color:#10b981;font-weight:bold;"
      );
      return mem;
    },
  };
  window.StudioProfiler = StudioProfiler;

  // ==========================================================================
  // 1. SINGLE-SOURCE PRESET LOADER (Reads from Python /health or /cutout)
  // ==========================================================================
  async function getPresetFromServerSingleSource(presetKey) {
    if (!STATE.serverPresets) {
      try {
        const cached = localStorage.getItem("wc_cached_presets_v2");
        if (cached) STATE.serverPresets = JSON.parse(cached);
      } catch (_) {}
    }
    if (!STATE.serverPresets) {
      try {
        const res = await fetch(`${STATE.apiUrl}/health`, { mode: "cors" });
        if (res.ok) {
          const data = await res.json();
          if (data && data.presets && data.presets.animals && data.presets.animals.OUTPUT_WIDTH) {
            STATE.serverPresets = data.presets;
            try { localStorage.setItem("wc_cached_presets_v2", JSON.stringify(data.presets)); } catch (_) {}
          }
        }
      } catch (_) {}
    }
    const dict = STATE.serverPresets || {};
    const key = dict[presetKey] ? presetKey : (presetKey && presetKey.startsWith("cars") ? "cars_black" : "animals");
    const cfg = dict[key] ? { ...dict[key], _preset_name: key } : {
      OUTPUT_WIDTH: key.startsWith("cars") ? 1782 : 1260,
      OUTPUT_HEIGHT: key.startsWith("cars") ? 1260 : 1782,
      RANDOM_SEED: 42,
      SUBJECT_EDGE_TRIM: 6,
      EDGE_SAMPLE_WIDTH: 20,
      COLOR_CORRECTION_ENABLED: true,
      OIL_PAINT_ENABLED: true,
      MASK_BRUSH_ENABLED: true,
      _preset_name: key,
    };
    return { key, cfg };
  }

  function erodeMaskFastUint8(src, w, h, radius) {
    if (radius <= 0) return new Uint8Array(src);
    const tmp = new Uint8Array(w * h);
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = x > radius ? x - radius : 0;
        const x1 = x + radius < w - 1 ? x + radius : w - 1;
        let mn = 255;
        for (let xi = x0; xi <= x1; xi++) {
          const v = src[row + xi];
          if (v < mn) mn = v;
        }
        tmp[row + x] = mn;
      }
    }
    for (let y = 0; y < h; y++) {
      const y0 = y > radius ? y - radius : 0;
      const y1 = y + radius < h - 1 ? y + radius : h - 1;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let mn = 255;
        for (let yi = y0; yi <= y1; yi++) {
          const v = tmp[yi * w + x];
          if (v < mn) mn = v;
        }
        dst[row + x] = mn;
      }
    }
    return dst;
  }

  // ==========================================================================
  // 2.🐾 MULTI-EYE BEAUTIFIER (100% Port of eye.py v8 — Supports 1, 2, 3, 4, 6+ Eyes!)
  // ==========================================================================
  const EYE_CFG = {
    reflection_boost_strength: 1.52,
    reflection_max_white: 248.0,
    secondary_eye_balance_pow: 0.75,
    env_reconstruct_max_opacity: 0.40,
    iris_exposure_lift: 1.24,
    iris_chroma_boost: 1.38,
    iris_fiber_clarity: 1.36,
    dark_eye_lower_crescent_op: 0.32,
    bottom_circular_fade_base: 0.44,
    bottom_circular_fade_bright: 0.48,
    dark_pupil_toe_strength: 0.36,
  };

  function gaussianBlurFloat32(src, w, h, sigma) {
    if (sigma <= 0.2) return new Float32Array(src);
    const r = Math.max(1, Math.round(sigma * 1.1));
    let out = boxBlurFloat32(src, w, h, r);
    out = boxBlurFloat32(out, w, h, Math.max(1, Math.round(sigma * 0.85)));
    return out;
  }

  function computeChamferEDT(maskBool, w, h) {
    const n = w * h;
    const d = new Float32Array(n);
    const INF = 1e6;
    for (let i = 0; i < n; i++) d[i] = maskBool[i] ? INF : 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        let v = d[i];
        if (v === 0) continue;
        if (x > 0) v = Math.min(v, d[i - 1] + 1);
        if (y > 0) {
          v = Math.min(v, d[i - w] + 1);
          if (x > 0) v = Math.min(v, d[i - w - 1] + 1.414);
          if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1.414);
        }
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w;
      for (let x = w - 1; x >= 0; x--) {
        const i = row + x;
        let v = d[i];
        if (v === 0) continue;
        if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
        if (y < h - 1) {
          v = Math.min(v, d[i + w] + 1);
          if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1.414);
          if (x > 0) v = Math.min(v, d[i + w - 1] + 1.414);
        }
        d[i] = v;
      }
    }
    return d;
  }

  function percentileFloat(arr, mask, pct) {
    const vals = [];
    for (let i = 0; i < arr.length; i++) {
      if (!mask || mask[i]) vals.push(arr[i]);
    }
    if (!vals.length) return 0;
    vals.sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(vals.length - 1, Math.floor((pct / 100) * (vals.length - 1))));
    return vals[idx];
  }

  function analyzeSceneEnvironmentJS(origCanvas, maskClean, w, h) {
    const sw = 64, sh = 36;
    const c = createCanvas(sw, sh);
    c.getContext("2d").drawImage(origCanvas, 0, 0, w, Math.max(1, Math.round(h * 0.55)), 0, 0, sw, sh);
    const d = c.getContext("2d").getImageData(0, 0, sw, sh).data;
    c.width = 1; c.height = 1;

    let sumR = 0, sumG = 0, sumB = 0, sumX = 0, cnt = 0;
    const env32 = new Float32Array(32 * 32);
    for (let y = 0; y < sh; y++) {
      const my = Math.min(h - 1, Math.floor((y / sh) * h * 0.55));
      for (let x = 0; x < sw; x++) {
        const mx = Math.min(w - 1, Math.floor((x / sw) * w));
        const p = (y * sw + x) * 4;
        const r = d[p], g = d[p + 1], b = d[p + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (y < 32 && x < 32) env32[y * 32 + x] = lum;
        if (maskClean[my * w + mx] < 64 && lum > 140) {
          sumR += r; sumG += g; sumB += b; sumX += x / sw; cnt++;
        }
      }
    }
    let skyTint = [228, 240, 255];
    let lightAngleDeg = -98.0;
    if (cnt > 10) {
      const rm = sumR / cnt, gm = sumG / cnt, bm = sumB / cnt;
      const mx = Math.max(1, rm, gm, bm);
      skyTint = [
        0.65 * (rm / mx * 246) + 0.35 * 225,
        0.65 * (gm / mx * 246) + 0.35 * 238,
        0.65 * (bm / mx * 246) + 0.35 * 255,
      ];
      lightAngleDeg = -90.0 + Math.max(-22, Math.min(22, (sumX / cnt - 0.5) * 45.0));
    }
    const smEnv = gaussianBlurFloat32(env32, 32, 32, 2.0);
    let dMin = 1e9, dMax = -1e9;
    for (let i = 0; i < 1024; i++) {
      if (smEnv[i] < dMin) dMin = smEnv[i];
      if (smEnv[i] > dMax) dMax = smEnv[i];
    }
    const envNorm = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      envNorm[i] = dMax > dMin + 5 ? (smEnv[i] - dMin) / (dMax - dMin) : 0.5;
    }
    return { skyTint, lightAngleDeg, envNorm };
  }

  // Segments the exact almond eyeball + iris + pupil around each detected eye keypoint (kpX, kpY, initR)
  function segmentEyeballAtKeypointJS(origCtx, maskClean, W, H, kpX, kpY, initR) {
    const estR = Math.max(6, Math.min(Math.min(W, H) * 0.09, initR));
    const winHalf = Math.max(24, Math.round(estR * 2.4));
    const wx0 = Math.max(0, Math.round(kpX - winHalf));
    const wy0 = Math.max(0, Math.round(kpY - winHalf));
    const wx1 = Math.min(W, Math.round(kpX + winHalf));
    const wy1 = Math.min(H, Math.round(kpY + winHalf));
    const cw = wx1 - wx0, ch = wy1 - wy0;
    if (cw < 12 || ch < 12) return null;

    // Verify keypoint is inside the subject cutout mask
    let fgSum = 0;
    for (let y = wy0; y < wy1; y++) {
      const rOff = y * W;
      for (let x = wx0; x < wx1; x++) if (maskClean[rOff + x] > 128) fgSum++;
    }
    if (fgSum / (cw * ch) < 0.55) return null;

    const imgData = origCtx.getImageData(wx0, wy0, cw, ch).data;
    const n = cw * ch;
    const lum = new Float32Array(n);
    const chroma = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const r = imgData[p], g = imgData[p + 1], b = imgData[p + 2];
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      chroma[i] = Math.max(r, g, b) - Math.min(r, g, b);
    }

    const locKx = kpX - wx0, locKy = kpY - wy0;
    const smLum = gaussianBlurFloat32(lum, cw, ch, Math.max(1.0, estR * 0.20));
    const lumNoGlint = new Float32Array(n);
    for (let i = 0; i < n; i++) lumNoGlint[i] = Math.min(lum[i], smLum[i] + 6.0);

    // 1. Locate dark pupil core near (locKx, locKy)
    const coreZone = new Uint8Array(n);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (Math.hypot(x - locKx, y - locKy) <= estR * 0.72) coreZone[y * cw + x] = 1;
      }
    }
    const p20 = percentileFloat(lumNoGlint, coreZone, 20);
    let sumPx = 0, sumPy = 0, pCnt = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = y * cw + x;
        if (coreZone[i] && lumNoGlint[i] <= p20 + 7.0) {
          sumPx += x; sumPy += y; pCnt++;
        }
      }
    }
    const pcx = pCnt >= 3 ? sumPx / pCnt : locKx;
    const pcy = pCnt >= 3 ? sumPy / pCnt : locKy;

    // 2. Measure outer fur ring luminance (1.25*estR .. 1.85*estR) vs inner eye
    const outerRing = new Uint8Array(n);
    const innerDisk = new Uint8Array(n);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const d = Math.hypot((x - pcx) * 0.92, (y - pcy) * 1.08);
        if (d <= estR * 1.05) innerDisk[y * cw + x] = 1;
        else if (d >= estR * 1.25 && d <= estR * 1.85) outerRing[y * cw + x] = 1;
      }
    }
    const furMedLum = percentileFloat(lumNoGlint, outerRing, 55);
    const inMedLum = percentileFloat(lumNoGlint, innerDisk, 45);
    const inP75Chroma = percentileFloat(chroma, innerDisk, 75);
    const furMedChroma = percentileFloat(chroma, outerRing, 50);

    // 3. Build adaptive almond eyeball mask around (pcx, pcy)
    //    Includes dark pupil/limbal ring + chromatic iris (amber/yellow/green/blue) while excluding bright eyebrow fur
    const rawMask = new Uint8Array(n);
    let maskCnt = 0;
    const lumThresh = furMedLum > inMedLum + 18 ? (inMedLum * 0.45 + furMedLum * 0.55) : (p20 + 48);
    const isBrightColoredIris = inP75Chroma > furMedChroma + 16 && inP75Chroma > 22;

    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = y * cw + x;
        const dx = (x - pcx) / (estR * 1.12);
        const dy = (y - pcy) / (estR * 0.96);
        const rEllip = Math.hypot(dx, dy);
        if (rEllip > 1.18) continue;

        const isCore = rEllip <= 0.58;
        const isDarkEye = lumNoGlint[i] <= lumThresh;
        const isColoredIris = isBrightColoredIris && chroma[i] >= Math.max(14, inP75Chroma * 0.48);
        // Strip upper eyebrow fur leak (y < pcy - 0.15*estR) if pixel matches bright low-chroma fur
        const isUpperFurLeak =
          y < pcy - estR * 0.15 &&
          furMedLum > inMedLum + 20 &&
          lumNoGlint[i] > (inMedLum + furMedLum) * 0.52 &&
          chroma[i] < 22;

        if ((isCore || isDarkEye || isColoredIris) && !isUpperFurLeak) {
          rawMask[i] = 1;
          maskCnt++;
        }
      }
    }

    if (maskCnt < 12) return null;

    // Fit smooth moment ellipse envelope (just like _clean_almond_mask in eye.py)
    let mCx = 0, mCy = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (rawMask[y * cw + x]) { mCx += x; mCy += y; }
      }
    }
    mCx /= maskCnt; mCy /= maskCnt;
    let cxx = 1e-3, cyy = 1e-3, cxy = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (!rawMask[y * cw + x]) continue;
        const dx = x - mCx, dy = y - mCy;
        cxx += dx * dx; cyy += dy * dy; cxy += dx * dy;
      }
    }
    cxx /= maskCnt; cyy /= maskCnt; cxy /= maskCnt;
    const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const cosT = Math.cos(-theta), sinT = Math.sin(-theta);
    let varRx = 0, varRy = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (!rawMask[y * cw + x]) continue;
        const dx = x - mCx, dy = y - mCy;
        const rx = dx * cosT - dy * sinT;
        const ry = dx * sinT + dy * cosT;
        varRx += rx * rx; varRy += ry * ry;
      }
    }
    const a = Math.max(3.5, Math.min(estR * 1.28, Math.sqrt(varRx / maskCnt) * 2.04));
    const b = Math.max(3.5, Math.min(estR * 1.15, Math.sqrt(varRy / maskCnt) * 2.04));

    const finalMask = new Uint8Array(n);
    let finalArea = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const dx = x - mCx, dy = y - mCy;
        const rx = dx * cosT - dy * sinT;
        const ry = dx * sinT + dy * cosT;
        const d2 = (rx / a) * (rx / a) + (ry / b) * (ry / b);
        if ((rawMask[y * cw + x] && d2 <= 1.04) || d2 <= 0.85) {
          finalMask[y * cw + x] = 1;
          finalArea++;
        }
      }
    }
    if (finalArea < 12) return null;

    const rIris = Math.max(4.0, Math.sqrt(finalArea / Math.PI));
    // Measure pupil aspect ratio (cat vertical slit vs round dog pupil)
    let stdX = 0, stdY = 0, dkCnt = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = y * cw + x;
        if (finalMask[i] && Math.hypot(x - pcx, y - pcy) <= rIris * 0.68 && lumNoGlint[i] <= p20 + 5.0) {
          stdX += (x - pcx) * (x - pcx);
          stdY += (y - pcy) * (y - pcy);
          dkCnt++;
        }
      }
    }
    const pupilAspect =
      dkCnt >= 6
        ? Math.max(0.32, Math.min(1.25, Math.sqrt(stdX / dkCnt + 1) / Math.sqrt(stdY / dkCnt + 1)))
        : 1.0;

    return {
      cx: wx0 + mCx,
      cy: wy0 + mCy,
      px: wx0 + (0.6 * pcx + 0.4 * mCx),
      py: wy0 + (0.6 * pcy + 0.4 * mCy),
      r_iris: rIris,
      pupil_aspect: pupilAspect,
      win_offset: [wx0, wy0],
      cw,
      ch,
      sam_mask_local: finalMask,
    };
  }

  function extractCornealReflectionMapSmoothJS(patchRgb, samSoft, upW, upH, cx, cy, rIris) {
    const n = upW * upH;
    const samBool = new Uint8Array(n);
    for (let i = 0; i < n; i++) samBool[i] = samSoft[i] >= 0.5 ? 1 : 0;

    const edt = computeChamferEDT(samBool, upW, upH);
    let maxEdt = 1.0;
    for (let i = 0; i < n; i++) if (edt[i] > maxEdt) maxEdt = edt[i];

    const edgeDistNorm = new Float32Array(n);
    const cornealDomeGate = new Float32Array(n);
    const lum = new Float32Array(n);
    const colorReflGate = new Float32Array(n);

    for (let y = 0; y < upH; y++) {
      const dy = (y - cy) / rIris;
      const upGate = Math.max(0, Math.min(1, (0.12 - dy) / 0.28));
      const row = y * upW;
      for (let x = 0; x < upW; x++) {
        const i = row + x;
        const edn = edt[i] / maxEdt;
        edgeDistNorm[i] = edn;
        const mGate = Math.max(0, Math.min(1, (edn - 0.25) / 0.18));
        cornealDomeGate[i] = mGate * upGate * samSoft[i];

        const p = i * 3;
        const r = patchRgb[p], g = patchRgb[p + 1], b = patchRgb[p + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        lum[i] = l;
        const warmth = Math.max(0, (r - b) / Math.max(25, l));
        const achrom = Math.max(0, Math.min(1, 1.25 - warmth * 1.85));
        const specOv = Math.max(0, Math.min(1, (l - 175) / 35));
        colorReflGate[i] = Math.max(achrom, specOv);
      }
    }

    // Two-stage smooth glint-free Gaussian baseline (eye.py compute_smooth_glint_free_baseline)
    const s1 = Math.max(1.0, rIris * 0.16);
    const s2 = Math.max(1.8, rIris * 0.34);
    const g1 = gaussianBlurFloat32(lum, upW, upH, s1);
    const noSpikes = new Float32Array(n);
    for (let i = 0; i < n; i++) noSpikes[i] = Math.min(lum[i], g1[i] + 4.0);
    const baseSmall = gaussianBlurFloat32(noSpikes, upW, upH, s1 * 1.15);

    const g2 = gaussianBlurFloat32(baseSmall, upW, upH, s2);
    const noWide = new Float32Array(n);
    for (let i = 0; i < n; i++) noWide[i] = Math.min(baseSmall[i], g2[i] + 3.0);
    const baseLarge = gaussianBlurFloat32(noWide, upW, upH, s2 * 1.15);

    const gatedRefl = new Float32Array(n);
    const validDome = new Uint8Array(n);
    let hasDome = false;
    for (let i = 0; i < n; i++) {
      const rawElev = 0.45 * (lum[i] - baseSmall[i]) + 0.55 * (lum[i] - baseLarge[i]);
      gatedRefl[i] = Math.max(0, rawElev) * cornealDomeGate[i] * colorReflGate[i];
      if (cornealDomeGate[i] > 0.25) {
        validDome[i] = 1;
        hasDome = true;
      }
    }

    let reflStrength = 0;
    let p50 = 0, p98 = 0;
    if (hasDome) {
      p98 = percentileFloat(gatedRefl, validDome, 98.5);
      p50 = percentileFloat(gatedRefl, validDome, 50.0);
      reflStrength = Math.max(0, p98 - p50);
    }

    const reflNorm = new Float32Array(n);
    if (reflStrength >= 7.0) {
      const denom = Math.max(8.0, p98 - p50);
      for (let i = 0; i < n; i++) {
        reflNorm[i] = Math.max(0, Math.min(1, (gatedRefl[i] - p50) / denom));
      }
      const smRefl = gaussianBlurFloat32(reflNorm, upW, upH, Math.max(0.7, rIris * 0.04));
      for (let i = 0; i < n; i++) reflNorm[i] = smRefl[i] * cornealDomeGate[i];
    }

    return { reflNorm, reflStrength, baseLumLarge: baseLarge, edgeDistNorm };
  }

  function buildEnvironmentReconstructedReflectionJS(samSoft, edgeDistNorm, upW, upH, cx, cy, rIris, envInfo) {
    const n = upW * upH;
    const rec = new Float32Array(n);
    const targetAng = envInfo.lightAngleDeg;
    const envDome = envInfo.envNorm;

    for (let y = 0; y < upH; y++) {
      const dy = (y - cy) / rIris;
      const hCut = Math.max(0, Math.min(1, (-dy - 0.08) / 0.16));
      if (hCut <= 0) continue;
      const vEnv = Math.max(0, Math.min(31, Math.floor(((dy + 0.75) / 1.5) * 31)));
      const row = y * upW;
      for (let x = 0; x < upW; x++) {
        const i = row + x;
        const clear = Math.max(0, Math.min(1, (edgeDistNorm[i] - 0.26) / 0.18));
        if (clear <= 0) continue;
        const dx = (x - cx) / rIris;
        const rNorm = Math.hypot(dx, dy);
        const radW = Math.exp(-((rNorm - 0.34) * (rNorm - 0.34)) / (2.0 * 0.11 * 0.11));
        if (radW < 0.01) continue;
        const angDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const angDiff = ((angDeg - targetAng + 180) % 360 + 360) % 360 - 180;
        const angW = Math.max(0, Math.min(1, 1.0 - Math.pow(Math.abs(angDiff) / 42.0, 1.8)));
        const uEnv = Math.max(0, Math.min(31, Math.floor(((dx + 0.75) / 1.5) * 31)));
        const skyTex = envDome[vEnv * 32 + uEnv];
        rec[i] = angW * radW * hCut * (0.65 + 0.35 * skyTex) * clear * samSoft[i];
      }
    }
    const sm = gaussianBlurFloat32(rec, upW, upH, Math.max(0.8, rIris * 0.055));
    let mx = 0;
    for (let i = 0; i < n; i++) if (sm[i] > mx) mx = sm[i];
    if (mx > 1e-4) {
      for (let i = 0; i < n; i++) sm[i] /= mx;
    }
    return sm;
  }

  /**
   * Runs the full v8 Eye Beautifier across all detected eyes (1, 2, 3, 4, 6+ eyes)
   * and returns an array of supersampled-then-downsampled RGBA eye patch canvases.
   */
  function runMultiEyeBeautifierClient(origCanvas, maskClean, w, h, detectedEyes, offset) {
    if (!detectedEyes || !detectedEyes.length) return [];
    const origCtx = origCanvas.getContext("2d");

    // 1. Segment each detected eye (supports 1, 2, 3, 4, 6+ eyes, deduplicating overlapping detections)
    const eyes = [];
    for (const e of detectedEyes) {
      const ex = e.x, ey = e.y;
      const initR = Math.max(8, e.r || Math.min(w, h) * 0.025);
      if (ex < 0 || ex >= w || ey < 0 || ey >= h) continue;
      if (eyes.some((o) => Math.hypot(ex - o.cx, ey - o.cy) < Math.min(initR, o.r_iris) * 1.6)) continue;
      const seg = segmentEyeballAtKeypointJS(origCtx, maskClean, w, h, ex, ey, initR);
      if (seg) eyes.push(seg);
    }
    if (!eyes.length) return [];

    const envInfo = analyzeSceneEnvironmentJS(origCanvas, maskClean, w, h);
    const envTint = envInfo.skyTint;

    // 2. Supersample each eye patch so small eyes are processed at r_up >= 42px (zero blocky pixels)
    const prepared = [];
    for (const eye of eyes) {
      const [wx0, wy0] = eye.win_offset;
      const { cw, ch, sam_mask_local } = eye;
      const rOrig = Math.max(4.0, eye.r_iris);
      const upFactor = Math.max(1, Math.min(4, Math.ceil(42.0 / rOrig)));
      const upW = cw * upFactor, upH = ch * upFactor;

      const upC = createCanvas(upW, upH);
      const uCtx = upC.getContext("2d");
      uCtx.imageSmoothingEnabled = true;
      uCtx.imageSmoothingQuality = "high";
      uCtx.drawImage(origCanvas, wx0, wy0, cw, ch, 0, 0, upW, upH);
      const upData = uCtx.getImageData(0, 0, upW, upH).data;
      upC.width = 1; upC.height = 1;

      const nUp = upW * upH;
      const patchUp = new Float32Array(nUp * 3);
      const samSoftRaw = new Float32Array(nUp);
      for (let y = 0; y < upH; y++) {
        const sy = Math.min(ch - 1, (y / upFactor) | 0) * cw;
        for (let x = 0; x < upW; x++) {
          const i = y * upW + x;
          const p = i * 4;
          patchUp[i * 3] = upData[p];
          patchUp[i * 3 + 1] = upData[p + 1];
          patchUp[i * 3 + 2] = upData[p + 2];
          samSoftRaw[i] = sam_mask_local[sy + Math.min(cw - 1, (x / upFactor) | 0)];
        }
      }
      const samSoft = gaussianBlurFloat32(samSoftRaw, upW, upH, upFactor * 0.85);
      const cxUp = (eye.cx - wx0) * upFactor;
      const cyUp = (eye.cy - wy0) * upFactor;
      const pxUp = (eye.px - wx0) * upFactor;
      const pyUp = (eye.py - wy0) * upFactor;
      const rUp = rOrig * upFactor;

      const rdata = extractCornealReflectionMapSmoothJS(patchUp, samSoft, upW, upH, cxUp, cyUp, rUp);
      prepared.push({
        eye, wx0, wy0, cw, ch, upFactor, upW, upH,
        patchUp, samSoft, cxUp, cyUp, pxUp, pyUp, rUp, rOrig, rdata,
      });
    }

    // Multi-eye bilateral/group reflection balance across all N eyes (1, 2, 3, 4, 6+ eyes)
    let maxStrength = 0;
    for (const p of prepared) if (p.rdata.reflStrength > maxStrength) maxStrength = p.rdata.reflStrength;
    const sceneReflScale = maxStrength >= 7.0 ? Math.max(0.42, Math.min(1.0, maxStrength / 28.0)) : 0.45;

    const outPatches = [];
    for (const item of prepared) {
      const { eye, wx0, wy0, cw, ch, upFactor, upW, upH, patchUp, samSoft, cxUp, cyUp, pxUp, pyUp, rUp, rOrig, rdata } = item;
      const n = upW * upH;
      const samBool = new Uint8Array(n);
      for (let i = 0; i < n; i++) if (samSoft[i] >= 0.45) samBool[i] = 1;

      const edgeDistNorm = rdata.edgeDistNorm;
      const innerFeatherRaw = new Float32Array(n);
      for (let i = 0; i < n; i++) innerFeatherRaw[i] = Math.max(0, Math.min(1, (edgeDistNorm[i] - 0.08) / 0.28));
      const innerFeather = gaussianBlurFloat32(innerFeatherRaw, upW, upH, Math.max(1.0, rUp * 0.06));
      for (let i = 0; i < n; i++) innerFeather[i] *= samSoft[i];

      let reflNorm = rdata.reflNorm;
      const reflStrength = rdata.reflStrength;
      const baseLumLarge = rdata.baseLumLarge;

      let effBoost, eyeBalance, isReconstructed;
      if (reflStrength >= 7.0) {
        const relRatio = reflStrength / Math.max(1.0, maxStrength);
        eyeBalance = Math.pow(relRatio, EYE_CFG.secondary_eye_balance_pow) * sceneReflScale;
        effBoost = EYE_CFG.reflection_boost_strength * eyeBalance;
        isReconstructed = false;
      } else {
        reflNorm = buildEnvironmentReconstructedReflectionJS(samSoft, edgeDistNorm, upW, upH, cxUp, cyUp, rUp, envInfo);
        const shadeFactor = maxStrength >= 18.0 ? 0.55 : 0.85;
        effBoost = EYE_CFG.env_reconstruct_max_opacity * shadeFactor;
        eyeBalance = shadeFactor;
        isReconstructed = true;
      }

      // Pupil & Iris separation
      const pupilAspect = Math.max(0.35, eye.pupil_aspect || 1.0);
      const p20Dark = percentileFloat(baseLumLarge, samBool, 20);
      const p55Mid = percentileFloat(baseLumLarge, samBool, 55);
      const denomDark = Math.max(10.0, p55Mid - p20Dark + 6.0);

      const darkStructRaw = new Float32Array(n);
      for (let y = 0; y < upH; y++) {
        const pdy = (y - pyUp) / rUp;
        const row = y * upW;
        for (let x = 0; x < upW; x++) {
          const i = row + x;
          const pdx = (x - pxUp) / rUp;
          const pEllip = Math.hypot(pdx / pupilAspect, pdy);
          const pGate = Math.max(0, Math.min(1, (0.54 - pEllip) / 0.18));
          const lGate = Math.max(0, Math.min(1, (p55Mid - baseLumLarge[i]) / denomDark));
          darkStructRaw[i] = lGate * pGate * (1.0 - Math.min(1.0, reflNorm[i] * 2.0)) * innerFeather[i];
        }
      }
      const darkStructMask = gaussianBlurFloat32(darkStructRaw, upW, upH, Math.max(1.0, rUp * 0.06));

      const irisPigmentRaw = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const limbalTaper = Math.max(0, Math.min(1, (edgeDistNorm[i] - 0.14) / 0.22));
        const nonPupil = Math.max(0, Math.min(1, 1.0 - darkStructMask[i] * 1.35));
        irisPigmentRaw[i] = nonPupil * (1.0 - Math.min(1.0, reflNorm[i] * 1.8)) * limbalTaper * innerFeather[i];
      }
      const irisPigmentMask = gaussianBlurFloat32(irisPigmentRaw, upW, upH, Math.max(1.0, rUp * 0.07));

      // Intrinsic Iris Color & Resolution-Adaptive Fiber Clarity
      const resQuality = Math.max(0, Math.min(1, (rOrig - 10.0) / 14.0));
      const effFibGain = 1.0 + (EYE_CFG.iris_fiber_clarity - 1.0) * resQuality;
      const fSig = Math.max(1.0, rUp * 0.07);

      const chR = new Float32Array(n), chG = new Float32Array(n), chB = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        chR[i] = patchUp[i * 3]; chG[i] = patchUp[i * 3 + 1]; chB[i] = patchUp[i * 3 + 2];
      }
      const smR = gaussianBlurFloat32(chR, upW, upH, fSig);
      const smG = gaussianBlurFloat32(chG, upW, upH, fSig);
      const smB = gaussianBlurFloat32(chB, upW, upH, fSig);

      const patch = new Float32Array(patchUp);
      const sat = EYE_CFG.iris_chroma_boost;
      const lift = EYE_CFG.iris_exposure_lift;

      for (let i = 0; i < n; i++) {
        const wIris = irisPigmentMask[i] * 0.80;
        if (wIris <= 0.001) continue;
        const dr = smR[i] + (chR[i] - smR[i]) * effFibGain;
        const dg = smG[i] + (chG[i] - smG[i]) * effFibGain;
        const db = smB[i] + (chB[i] - smB[i]) * effFibGain;
        const gr = 0.299 * dr + 0.587 * dg + 0.114 * db;
        const cr = (gr + (dr - gr) * sat) * lift;
        const cg = (gr + (dg - gr) * sat) * lift;
        const cb = (gr + (db - gr) * sat) * lift;
        const p = i * 3;
        patch[p] = patch[p] * (1 - wIris) + cr * wIris;
        patch[p + 1] = patch[p + 1] * (1 - wIris) + cg * wIris;
        patch[p + 2] = patch[p + 2] * (1 - wIris) + cb * wIris;
      }

      // D. Subtle Lower Crescent Reflection for Dark Eyes
      const lowerZone = new Uint8Array(n);
      let hasLowerZone = false;
      for (let y = 0; y < upH; y++) {
        const dy = (y - cyUp) / rUp;
        if (dy < 0.15) continue;
        const row = y * upW;
        for (let x = 0; x < upW; x++) {
          const i = row + x;
          if (!samBool[i] || edgeDistNorm[i] < 0.20) continue;
          const rNorm = Math.hypot((x - cxUp) / rUp, dy);
          if (rNorm >= 0.38 && rNorm <= 0.74) {
            lowerZone[i] = 1;
            hasLowerZone = true;
          }
        }
      }
      const lowerLum = hasLowerZone ? percentileFloat(baseLumLarge, lowerZone, 50) : 65.0;
      const darkLowerNeed = Math.max(0, Math.min(1, (52.0 - lowerLum) / 36.0));

      if (darkLowerNeed > 0.02) {
        const lowerCresRaw = new Float32Array(n);
        for (let y = 0; y < upH; y++) {
          const dy = (y - cyUp) / rUp;
          const pdy = (y - pyUp) / rUp;
          const row = y * upW;
          for (let x = 0; x < upW; x++) {
            const i = row + x;
            const dx = (x - cxUp) / rUp;
            const rNorm = Math.hypot(dx, dy);
            const pNorm = Math.hypot((x - pxUp) / rUp, pdy);
            const angDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
            const botDiff = ((angDeg - 88.0 + 180) % 360 + 360) % 360 - 180;
            const cAngW = Math.max(0, Math.min(1, 1.0 - Math.pow(Math.abs(botDiff) / 54.0, 1.8)));
            const cRadW = Math.exp(-((rNorm - 0.54) * (rNorm - 0.54)) / (2.0 * 0.115 * 0.115));
            const pClear = Math.max(0, Math.min(1, (pNorm - 0.34) / 0.12));
            const rClear = Math.max(0, Math.min(1, (edgeDistNorm[i] - 0.20) / 0.18));
            lowerCresRaw[i] = cAngW * cRadW * pClear * rClear * innerFeather[i];
          }
        }
        const lowerCres = gaussianBlurFloat32(lowerCresRaw, upW, upH, Math.max(1.2, rUp * 0.08));
        let mxC = 0;
        for (let i = 0; i < n; i++) if (lowerCres[i] > mxC) mxC = lowerCres[i];
        if (mxC > 1e-4) {
          const lTint = [
            (0.55 * envTint[0] + 0.45 * 175) / 255.0,
            (0.55 * envTint[1] + 0.45 * 170) / 255.0,
            (0.55 * envTint[2] + 0.45 * 160) / 255.0,
          ];
          const cresOp = EYE_CFG.dark_eye_lower_crescent_op * darkLowerNeed * Math.max(0.55, Math.min(1.0, eyeBalance * 1.15));
          for (let i = 0; i < n; i++) {
            const wc = (lowerCres[i] / mxC) * cresOp;
            if (wc <= 0.001) continue;
            const p = i * 3;
            patch[p] = 255 - (255 - patch[p]) * (1 - wc * lTint[0]);
            patch[p + 1] = 255 - (255 - patch[p + 1]) * (1 - wc * lTint[1]);
            patch[p + 2] = 255 - (255 - patch[p + 2]) * (1 - wc * lTint[2]);
          }
        }
      }

      // E. Deepen Dark Pupil Core + F. Circular Bottom Limbal Fade into Black + G. Upper Corneal Reflection
      const postLum = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const wDark = darkStructMask[i] * EYE_CFG.dark_pupil_toe_strength;
        const p = i * 3;
        patch[p] *= 1 - wDark;
        patch[p + 1] *= 1 - wDark;
        patch[p + 2] *= 1 - wDark;
        postLum[i] = 0.299 * patch[p] + 0.587 * patch[p + 1] + 0.114 * patch[p + 2];
      }

      const lowerBright = hasLowerZone ? percentileFloat(postLum, lowerZone, 75) : 45.0;
      const brightLowerExtra = Math.max(0, Math.min(1, (lowerBright - 55.0) / 85.0));
      const fadeStrength = EYE_CFG.bottom_circular_fade_base + EYE_CFG.bottom_circular_fade_bright * brightLowerExtra;

      const circBotRaw = new Float32Array(n);
      for (let y = 0; y < upH; y++) {
        const dy = (y - cyUp) / rUp;
        const botHem = Math.max(0, Math.min(1, (dy - 0.08) / 0.42));
        if (botHem <= 0) continue;
        const row = y * upW;
        for (let x = 0; x < upW; x++) {
          const i = row + x;
          const rNorm = Math.hypot((x - cxUp) / rUp, dy);
          const rimProg = Math.max(0, Math.min(1, (0.34 - edgeDistNorm[i]) / 0.28));
          const radProg = Math.max(0, Math.min(1, (rNorm - 0.62) / 0.32));
          circBotRaw[i] =
            (0.55 * rimProg + 0.45 * radProg) *
            botHem *
            (1.0 - Math.min(1.0, reflNorm[i] * 2.0)) *
            innerFeather[i];
        }
      }
      const circBotMask = gaussianBlurFloat32(circBotRaw, upW, upH, Math.max(1.2, rUp * 0.08));

      const outUpC = createCanvas(upW, upH);
      const outUpCtx = outUpC.getContext("2d");
      const outUpImg = outUpCtx.createImageData(upW, upH);
      const dst = outUpImg.data;

      for (let i = 0; i < n; i++) {
        const p3 = i * 3;
        const p4 = i * 4;
        const wBot = Math.max(0, Math.min(0.68, circBotMask[i] * fadeStrength));
        let r = patch[p3] * (1 - wBot);
        let g = patch[p3 + 1] * (1 - wBot);
        let b = patch[p3 + 2] * (1 - wBot);

        const rn = reflNorm[i];
        const inf = innerFeather[i];
        if (rn > 0.001 && inf > 0.001) {
          if (isReconstructed) {
            const wEnv = Math.pow(rn, 1.3) * effBoost * inf;
            r = 255 - (255 - r) * (1 - wEnv * (envTint[0] / 255.0));
            g = 255 - (255 - g) * (1 - wEnv * (envTint[1] / 255.0));
            b = 255 - (255 - b) * (1 - wEnv * (envTint[2] / 255.0));
          } else {
            const wRefl = Math.pow(rn, 1.35) * Math.min(0.92, effBoost * 0.52) * inf;
            const pkW = Math.pow(rn, 2.2) * Math.min(0.88, effBoost * 0.58) * inf;
            const tr = 0.40 * patchUp[p3] + 0.60 * envTint[0];
            const tg = 0.40 * patchUp[p3 + 1] + 0.60 * envTint[1];
            const tb = 0.40 * patchUp[p3 + 2] + 0.60 * envTint[2];
            r = 255 - (255 - r) * (1 - wRefl * (tr / 255.0));
            g = 255 - (255 - g) * (1 - wRefl * (tg / 255.0));
            b = 255 - (255 - b) * (1 - wRefl * (tb / 255.0));
            r = r * (1 - pkW) + EYE_CFG.reflection_max_white * pkW;
            g = g * (1 - pkW) + EYE_CFG.reflection_max_white * pkW;
            b = b * (1 - pkW) + EYE_CFG.reflection_max_white * pkW;
          }
        }

        dst[p4] = Math.max(0, Math.min(255, Math.round(r)));
        dst[p4 + 1] = Math.max(0, Math.min(255, Math.round(g)));
        dst[p4 + 2] = Math.max(0, Math.min(255, Math.round(b)));
        dst[p4 + 3] = Math.max(0, Math.min(255, Math.round(inf * 255)));
      }
      outUpCtx.putImageData(outUpImg, 0, 0);

      // Downsample smoothly back to native eye crop size (cw x ch)
      const nativePatchC = createCanvas(cw, ch);
      const npCtx = nativePatchC.getContext("2d");
      npCtx.imageSmoothingEnabled = true;
      npCtx.imageSmoothingQuality = "high";
      npCtx.drawImage(outUpC, 0, 0, cw, ch);
      outUpC.width = 1; outUpC.height = 1;

      outPatches.push({
        baseX: wx0 + offset[0],
        baseY: wy0 + offset[1],
        w: cw,
        h: ch,
        canvas: nativePatchC,
      });
    }

    return outPatches;
  }

  // ==========================================================================
  // 3. WEBGL2 GPU ENGINE FOR COLOR CORRECTION & LIC OIL PAINT
  // ==========================================================================
  let _glgpu = null;

  function getGPUFilterEngine() {
    if (_glgpu && _glgpu.gl && !_glgpu.gl.isContextLost()) return _glgpu;
    if (_glgpu === false) return null;

    const canvas = createCanvas(64, 64);
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      _glgpu = false;
      return null;
    }

    const vsSrc = `#version 300 es
      layout(location = 0) in vec2 a_pos;
      out vec2 v_uv;
      void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
        v_uv = a_pos * 0.5 + 0.5;
      }
    `;

    const fsCC = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_orig;
      uniform sampler2D u_lumBlur;
      uniform sampler2D u_mask;
      uniform sampler2D u_wcTex;
      uniform float u_shLift;
      uniform float u_hiReduce;
      uniform float u_vibrance;
      uniform float u_sat;
      uniform float u_bright;
      uniform float u_contrast;
      uniform float u_meanL;
      uniform float u_warmFilter;
      uniform float u_warmBoost;
      uniform float u_wcOp;
      uniform vec2 u_wcScale;
      uniform int u_flipY;
      out vec4 outColor;
      void main() {
        vec2 uv = u_flipY == 1 ? vec2(v_uv.x, 1.0 - v_uv.y) : v_uv;
        float a = texture(u_mask, uv).r;
        if (a <= 0.001) {
          outColor = vec4(0.0);
          return;
        }
        vec3 orig = texture(u_orig, uv).rgb;
        float bLum = dot(texture(u_lumBlur, uv).rgb, vec3(0.299, 0.587, 0.114));
        float shMask = pow(max(0.0, 1.0 - bLum), 0.7);
        float hiMask = clamp((pow(max(0.0, bLum), 0.7) - 0.5) * 2.0, 0.0, 1.0);
        float delta = (shMask * u_shLift - hiMask * u_hiReduce) / 255.0;

        vec3 c = clamp(orig + vec3(delta), 0.0, 1.0);
        float mx = max(c.r, max(c.g, c.b));
        float mn = min(c.r, min(c.g, c.b));
        float curSat = mx > 0.0 ? (mx - mn) / mx : 0.0;
        float vibBoost = 1.0 + (u_vibrance - 1.0) * sqrt(max(0.0, 1.0 - curSat));
        float gray = (c.r + c.g + c.b) / 3.0;
        c = clamp(gray + (c - gray) * vibBoost, 0.0, 1.0);

        float l601 = dot(c, vec3(0.299, 0.587, 0.114));
        c = clamp((l601 + (c - l601) * u_sat) * u_bright, 0.0, 1.0);
        c = clamp(u_meanL + (c - u_meanL) * u_contrast, 0.0, 1.0);

        if (u_warmFilter > 0.0) {
          c = mix(c, vec3(1.0, 197.0 / 255.0, 143.0 / 255.0), u_warmFilter);
        }
        if (u_warmBoost > 1.0) {
          float bAmt = u_warmBoost - 1.0;
          float w = clamp(c.r - c.b, 0.0, 1.0) * (1.0 - clamp(c.g - c.r, 0.0, 1.0));
          c.r = clamp(c.r + w * bAmt * (20.0 / 255.0), 0.0, 1.0);
          c.b = clamp(c.b - w * bAmt * (10.0 / 255.0), 0.0, 1.0);
        }
        if (u_wcOp > 0.0) {
          float tv = texture(u_wcTex, fract(uv * u_wcScale)).r;
          vec3 ov = mix(2.0 * c * tv, 1.0 - 2.0 * (1.0 - c) * (1.0 - tv), step(vec3(0.5), c));
          c = clamp(mix(c, ov, u_wcOp), 0.0, 1.0);
        }
        outColor = vec4(c, a);
      }
    `;

    const fsOilTone = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_cc;
      uniform sampler2D u_lumBlur;
      uniform float u_shAmt;
      uniform float u_hiAmt;
      uniform float u_black;
      uniform float u_invRange;
      uniform float u_invGamma;
      out vec4 outColor;
      void main() {
        vec4 s = texture(u_cc, v_uv);
        float bL = dot(texture(u_lumBlur, v_uv).rgb, vec3(0.299, 0.587, 0.114));
        float shM = sqrt(max(0.0, 1.0 - bL));
        float hiM = clamp((bL - 0.5) * 2.0, 0.0, 1.0);
        float delta = (shM * u_shAmt - hiM * u_hiAmt) / 255.0;
        vec3 c = clamp(s.rgb + vec3(delta), 0.0, 1.0);
        c = clamp((c * 255.0 - u_black) * u_invRange, 0.0, 1.0);
        c = pow(c, vec3(u_invGamma));
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        outColor = vec4(c, l);
      }
    `;

    const fsOilLIC = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_toned;
      uniform sampler2D u_origCc;
      uniform vec2 u_step;
      uniform float u_hpStrength;
      uniform float u_unsharp;
      uniform float u_finalCon;
      out vec4 outColor;

      vec2 getFlow(vec2 uv) {
        float ixx = 0.0, iyy = 0.0, ixy = 0.0;
        for (int dy = -1; dy <= 1; dy++) {
          for (int dx = -1; dx <= 1; dx++) {
            vec2 p = uv + vec2(float(dx), float(dy)) * u_step;
            float gx = (texture(u_toned, p + vec2(u_step.x, 0.0)).a - texture(u_toned, p - vec2(u_step.x, 0.0)).a) * 0.5;
            float gy = (texture(u_toned, p + vec2(0.0, u_step.y)).a - texture(u_toned, p - vec2(0.0, u_step.y)).a) * 0.5;
            ixx += gx * gx;
            iyy += gy * gy;
            ixy += gx * gy;
          }
        }
        float theta = 0.5 * atan(2.0 * ixy, ixx - iyy + 1e-7);
        return vec2(-sin(theta), cos(theta));
      }

      vec3 sampleLIC(vec2 uv0) {
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        float stepPx = 4.2;
        for (int dir = -1; dir <= 1; dir += 2) {
          vec2 p = uv0;
          float fdir = float(dir) * stepPx;
          for (int s = 0; s < 4; s++) {
            float wt = 1.0 - float(s) * 0.125;
            acc += texture(u_toned, clamp(p, vec2(0.0), vec2(1.0))).rgb * wt;
            wsum += wt;
            vec2 fl = getFlow(p);
            p += fl * u_step * fdir;
          }
        }
        return acc / wsum;
      }

      void main() {
        vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
        vec4 orig = texture(u_origCc, uv);
        if (orig.a <= 0.001) {
          outColor = vec4(0.0);
          return;
        }
        float minA = orig.a;
        minA = min(minA, texture(u_origCc, uv + vec2(4.0 * u_step.x, 0.0)).a);
        minA = min(minA, texture(u_origCc, uv - vec2(4.0 * u_step.x, 0.0)).a);
        minA = min(minA, texture(u_origCc, uv + vec2(0.0, 4.0 * u_step.y)).a);
        minA = min(minA, texture(u_origCc, uv - vec2(0.0, 4.0 * u_step.y)).a);
        float rimBlend = smoothstep(0.1, 0.95, minA);

        vec3 centerLic = sampleLIC(uv);
        vec3 blurLic = (
          centerLic * 2.0 +
          texture(u_toned, uv + vec2(2.5 * u_step.x, 0.0)).rgb +
          texture(u_toned, uv - vec2(2.5 * u_step.x, 0.0)).rgb +
          texture(u_toned, uv + vec2(0.0, 2.5 * u_step.y)).rgb +
          texture(u_toned, uv - vec2(0.0, 2.5 * u_step.y)).rgb
        ) / 6.0;

        vec3 hp = clamp(centerLic - blurLic + 0.5, 0.0, 1.0);
        vec3 ov = mix(2.0 * centerLic * hp, 1.0 - 2.0 * (1.0 - centerLic) * (1.0 - hp), step(vec3(0.5), centerLic));
        vec3 res = mix(centerLic, ov, u_hpStrength);
        res = res + (res - blurLic) * (u_unsharp * 0.55);
        if (u_finalCon > 1.0) {
          res = 0.5 + (res - 0.5) * u_finalCon;
        }
        res = clamp(mix(orig.rgb, res, rimBlend), 0.0, 1.0);
        outColor = vec4(res, orig.a);
      }
    `;

    const compile = (type, src) => {
      if (gl.isContextLost()) return null;
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };
    const link = (vs, fs) => {
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    };

    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fCC = compile(gl.FRAGMENT_SHADER, fsCC);
    const fOT = compile(gl.FRAGMENT_SHADER, fsOilTone);
    const fOL = compile(gl.FRAGMENT_SHADER, fsOilLIC);
    if (!vs || !fCC || !fOT || !fOL) { _glgpu = false; return null; }

    const progCC = link(vs, fCC);
    const progOilTone = link(vs, fOT);
    const progOilLIC = link(vs, fOL);
    if (!progCC || !progOilTone || !progOilLIC) { _glgpu = false; return null; }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    _glgpu = { canvas, gl, vao, progCC, progOilTone, progOilLIC };
    return _glgpu;
  }

  function uploadTex2D(gl, imgOrCanvas, wrapRepeat = false) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgOrCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    return tex;
  }

  function renderSubjectAndOilGPU(origC, maskCleanCanvas, w, h, cw, ch, offset, cfg) {
    const eng = getGPUFilterEngine();
    const [offX, offY] = offset;
    if (!eng) return null;
    const { gl, canvas, vao, progCC, progOilTone, progOilLIC } = eng;

    const sw4 = Math.max(1, w >> 2), sh4 = Math.max(1, h >> 2);
    const lumSmallC = createCanvas(sw4, sh4);
    const lsCtx = lumSmallC.getContext("2d");
    lsCtx.filter = "blur(6px)";
    lsCtx.drawImage(origC, 0, 0, sw4, sh4);
    lsCtx.filter = "none";

    const thumbC = createCanvas(64, 64);
    thumbC.getContext("2d").drawImage(lumSmallC, 0, 0, 64, 64);
    const tData = thumbC.getContext("2d").getImageData(0, 0, 64, 64).data;
    thumbC.width = 1; thumbC.height = 1;
    let sumL = 0;
    for (let i = 0; i < tData.length; i += 4) {
      sumL += 0.299 * tData[i] + 0.587 * tData[i + 1] + 0.114 * tData[i + 2];
    }
    const meanL = (sumL / (64 * 64)) / 255.0;

    const texOrig = uploadTex2D(gl, origC, false);
    const texLumBlur = uploadTex2D(gl, lumSmallC, false);
    const texMask = uploadTex2D(gl, maskCleanCanvas, false);
    const wcImg = STATE.brushImages["watercolortexture.png"];
    const texWc = wcImg ? uploadTex2D(gl, wcImg, true) : texOrig;

    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);

    const runCCPass = (useWcTex) => {
      canvas.width = w;
      canvas.height = h;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(progCC);

      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texOrig);
      gl.uniform1i(gl.getUniformLocation(progCC, "u_orig"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texLumBlur);
      gl.uniform1i(gl.getUniformLocation(progCC, "u_lumBlur"), 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texMask);
      gl.uniform1i(gl.getUniformLocation(progCC, "u_mask"), 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, texWc);
      gl.uniform1i(gl.getUniformLocation(progCC, "u_wcTex"), 3);

      const ccOn = cfg.COLOR_CORRECTION_ENABLED !== false;
      gl.uniform1f(gl.getUniformLocation(progCC, "u_shLift"), ccOn ? (cfg.CC_SHADOW_LIFT ?? 10) : 0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_hiReduce"), ccOn ? (cfg.CC_HIGHLIGHT_REDUCE ?? 30) : 0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_vibrance"), ccOn ? (cfg.CC_VIBRANCE ?? 1.25) : 1.0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_sat"), ccOn ? (cfg.CC_SATURATION ?? 1.10) : 1.0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_bright"), ccOn ? (cfg.CC_BRIGHTNESS ?? 1.08) : 1.0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_contrast"), ccOn ? (cfg.CC_CONTRAST ?? 1.02) : 1.0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_meanL"), meanL * (ccOn ? (cfg.CC_BRIGHTNESS ?? 1.08) : 1.0));
      gl.uniform1f(gl.getUniformLocation(progCC, "u_warmFilter"), ccOn ? (cfg.CC_WARM_FILTER ?? 0.02) : 0.0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_warmBoost"), ccOn ? (cfg.CC_WARM_BOOST ?? 2.6) : 1.0);

      const wcMult = cfg.WATERCOLOR_TEXTURE_SIZE ?? 1.0;
      const tw = wcImg ? Math.max(1, (wcImg.naturalWidth || wcImg.width) * wcMult) : 512;
      const th = wcImg ? Math.max(1, (wcImg.naturalHeight || wcImg.height) * wcMult) : 512;
      gl.uniform1f(gl.getUniformLocation(progCC, "u_wcOp"), useWcTex && wcImg ? (cfg.WATERCOLOR_TEXTURE_OPACITY ?? 0.6) : 0.0);
      gl.uniform2f(gl.getUniformLocation(progCC, "u_wcScale"), w / tw, h / th);
      gl.uniform1i(gl.getUniformLocation(progCC, "u_flipY"), 1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    // Always produce clean untextured subject_cc AND (when WATERCOLOR_TEXTURE_ENABLED) separate subject_tex!
    runCCPass(false);
    const cleanCcCrop = createCanvas(w, h);
    cleanCcCrop.getContext("2d").drawImage(canvas, 0, 0);

    const subCcFull = createCanvas(cw, ch);
    subCcFull.getContext("2d").drawImage(cleanCcCrop, offX, offY);

    let subTexFull = null;
    if (cfg.WATERCOLOR_TEXTURE_ENABLED && wcImg) {
      runCCPass(true);
      subTexFull = createCanvas(cw, ch);
      subTexFull.getContext("2d").drawImage(canvas, offX, offY);
    }

    let oilFull = null;
    if (cfg.OIL_PAINT_ENABLED !== false) {
      const texCc = uploadTex2D(gl, cleanCcCrop, false);
      const texToned = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texToned);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texToned, 0);
      gl.viewport(0, 0, w, h);

      gl.useProgram(progOilTone);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texCc);
      gl.uniform1i(gl.getUniformLocation(progOilTone, "u_cc"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texLumBlur);
      gl.uniform1i(gl.getUniformLocation(progOilTone, "u_lumBlur"), 1);

      const shAmt = ((cfg.OIL_SHADOW_AMOUNT ?? 30) / 100.0) * 100.0;
      const hiAmt = ((cfg.OIL_HIGHLIGHT_AMOUNT ?? 90) / 100.0) * 80.0;
      const black = cfg.OIL_LEVELS_BLACK ?? 30;
      const white = cfg.OIL_LEVELS_WHITE ?? 220;
      gl.uniform1f(gl.getUniformLocation(progOilTone, "u_shAmt"), shAmt);
      gl.uniform1f(gl.getUniformLocation(progOilTone, "u_hiAmt"), hiAmt);
      gl.uniform1f(gl.getUniformLocation(progOilTone, "u_black"), black);
      gl.uniform1f(gl.getUniformLocation(progOilTone, "u_invRange"), 1.0 / Math.max(1.0, white - black));
      gl.uniform1f(gl.getUniformLocation(progOilTone, "u_invGamma"), 1.0 / (cfg.OIL_LEVELS_GAMMA ?? 0.95));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(progOilLIC);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texToned);
      gl.uniform1i(gl.getUniformLocation(progOilLIC, "u_toned"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texCc);
      gl.uniform1i(gl.getUniformLocation(progOilLIC, "u_origCc"), 1);
      gl.uniform2f(gl.getUniformLocation(progOilLIC, "u_step"), 1.0 / w, 1.0 / h);
      gl.uniform1f(gl.getUniformLocation(progOilLIC, "u_hpStrength"), cfg.OIL_HIGH_PASS_STRENGTH ?? 0.5);
      gl.uniform1f(gl.getUniformLocation(progOilLIC, "u_unsharp"), cfg.OIL_UNSHARP_AMOUNT ?? 1.1);
      gl.uniform1f(gl.getUniformLocation(progOilLIC, "u_finalCon"), cfg.OIL_FINAL_CONTRAST ?? 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      oilFull = createCanvas(cw, ch);
      oilFull.getContext("2d").drawImage(canvas, offX, offY);

      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(texToned);
      gl.deleteTexture(texCc);
    }

    gl.deleteTexture(texOrig);
    gl.deleteTexture(texLumBlur);
    gl.deleteTexture(texMask);
    if (texWc !== texOrig) gl.deleteTexture(texWc);
    canvas.width = 1; canvas.height = 1;
    lumSmallC.width = 1; lumSmallC.height = 1;

    return { cleanCcCrop, subCcFull, subTexFull, oilFull };
  }

  // ==========================================================================
  // 4. HALF-SCALE PYRAMID FOR 21x21 NORMALS & ACCENTS + FULL-RES EDGE SAMPLING
  // ==========================================================================
  function computeEdgesPaletteAndAccentsFast(cleanCcCrop, maskClean, w, h, offset, cfg) {
    const subjectData = cleanCcCrop.getContext("2d").getImageData(0, 0, w, h).data;
    const n = w * h;

    let sumR = 0, sumG = 0, sumB = 0, visCount = 0;
    const counts = new Int32Array(1331);
    for (let i = 0; i < n; i += 2) {
      if (maskClean[i] <= 128) continue;
      const p = i * 4;
      const r = subjectData[p], g = subjectData[p + 1], b = subjectData[p + 2];
      sumR += r; sumG += g; sumB += b; visCount++;
      counts[((r / 24) | 0) * 121 + ((g / 24) | 0) * 11 + ((b / 24) | 0)]++;
    }
    const averageColor = visCount > 0
      ? [Math.trunc(sumR / visCount), Math.trunc(sumG / visCount), Math.trunc(sumB / visCount)]
      : [128, 128, 128];

    let dominantColor = null, bestCount = -1;
    for (let idx = 0; idx < 1331; idx++) {
      const cnt = counts[idx];
      if (cnt <= bestCount) continue;
      const r = ((idx / 121) | 0) * 24 + 12;
      const g = (((idx % 121) / 11) | 0) * 24 + 12;
      const b = (idx % 11) * 24 + 12;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 40 || lum > 220) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 0 && (mx - mn) / (mx + 1) > 0.20) {
        bestCount = cnt;
        dominantColor = [r, g, b];
      }
    }

    const edgePixelsX = [];
    const edgePixelsY = [];
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        if (maskClean[i] <= 20) continue;
        if (
          maskClean[i - 1] <= 20 || maskClean[i + 1] <= 20 ||
          maskClean[i - w] <= 20 || maskClean[i + w] <= 20 ||
          maskClean[i - w - 1] <= 20 || maskClean[i - w + 1] <= 20 ||
          maskClean[i + w - 1] <= 20 || maskClean[i + w + 1] <= 20
        ) {
          edgePixelsX.push(x);
          edgePixelsY.push(y);
        }
      }
    }

    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    const hn = hw * hh;
    const binHalf = new Float32Array(hn);
    const bxX = new Float32Array(hn);
    const bxY = new Float32Array(hn);
    for (let hy = 0; hy < hh; hy++) {
      const sy = Math.min(h - 1, hy << 1) * w;
      const hRow = hy * hw;
      for (let hx = 0; hx < hw; hx++) {
        if (maskClean[sy + (hx << 1)] > 128) {
          const hi = hRow + hx;
          binHalf[hi] = 1.0;
          bxX[hi] = hx;
          bxY[hi] = hy;
        }
      }
    }
    const countBlur = boxBlurFloat32(binHalf, hw, hh, 5);
    const avgX = boxBlurFloat32(bxX, hw, hh, 5);
    const avgY = boxBlurFloat32(bxY, hw, hh, 5);
    const normXHalf = new Float32Array(hn);
    const normYHalf = new Float32Array(hn);
    for (let hy = 0; hy < hh; hy++) {
      const hRow = hy * hw;
      for (let hx = 0; hx < hw; hx++) {
        const hi = hRow + hx;
        const sc = Math.max(countBlur[hi], 1e-10);
        const nx = -(avgX[hi] / sc - hx);
        const ny = -(avgY[hi] / sc - hy);
        const mag = Math.hypot(nx, ny) + 1e-10;
        normXHalf[hi] = nx / mag;
        normYHalf[hi] = ny / mag;
      }
    }

    const edgeWidth = cfg.EDGE_SAMPLE_WIDTH ?? 20;
    const halfEw = edgeWidth >> 1;
    const edges = new Array(edgePixelsX.length);

    for (let k = 0; k < edgePixelsX.length; k++) {
      const ex = edgePixelsX[k], ey = edgePixelsY[k];
      const hi = Math.min(hh - 1, ey >> 1) * hw + Math.min(hw - 1, ex >> 1);
      const nx = normXHalf[hi], ny = normYHalf[hi];
      const sx = Math.max(0, Math.min(w - 1, Math.trunc(ex - nx * halfEw)));
      const sy = Math.max(0, Math.min(h - 1, Math.trunc(ey - ny * halfEw)));
      const sp = (sy * w + sx) * 4;
      let r = subjectData[sp], g = subjectData[sp + 1], b = subjectData[sp + 2];
      const valid = maskClean[sy * w + sx] >= 50 ? 1 : 0;

      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = Math.max(0, Math.min(255, Math.round(128 + (l + (r - l) * 1.5 - 128) * 1.3)));
      g = Math.max(0, Math.min(255, Math.round(128 + (l + (g - l) * 1.5 - 128) * 1.3)));
      b = Math.max(0, Math.min(255, Math.round(128 + (l + (b - l) * 1.5 - 128) * 1.3)));

      edges[k] = [ex, ey, nx, ny, r, g, b, valid];
    }

    const candidates = [];
    const spots = [];
    if (cfg.ACCENT_STROKES_ENABLED && edgePixelsX.length > 0) {
      const lumHalf = new Float32Array(hn);
      const intHalf = new Float32Array(hn);
      for (let hy = 0; hy < hh; hy++) {
        const sy = Math.min(h - 1, hy << 1) * w;
        const hRow = hy * hw;
        for (let hx = 0; hx < hw; hx++) {
          const i = sy + (hx << 1);
          const p = i * 4;
          const r = subjectData[p], g = subjectData[p + 1], b = subjectData[p + 2];
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          lumHalf[hRow + hx] = l;
          if (maskClean[i] > 20) {
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            const sat = mx > 0 ? (mx - mn) / (mx + 1e-6) : 0;
            const dk = Math.max(0, Math.min(1, (90 - l) / 90.0));
            const br = Math.max(0, Math.min(1, (l - 200) / 55.0));
            const st = Math.max(0, Math.min(1, (sat - 0.1) / 0.9));
            intHalf[hRow + hx] = (1.5 * dk + 1.2 * br + 2.0 * st) * (maskClean[i] / 255.0);
          }
        }
      }
      const smInt = boxBlurFloat32(intHalf, hw, hh, 2);
      let maxInt = 1e-6;
      for (let i = 0; i < hn; i++) if (smInt[i] > maxInt) maxInt = smInt[i];
      for (let i = 0; i < hn; i++) smInt[i] /= maxInt;

      const rng = new PythonRandom(cfg.RANDOM_SEED || 42);
      const aboveIdx = [];
      for (let i = 0; i < edgePixelsX.length; i++) {
        const hi = Math.min(hh - 1, edgePixelsY[i] >> 1) * hw + Math.min(hw - 1, edgePixelsX[i] >> 1);
        if (smInt[hi] >= 0.002) aboveIdx.push(i);
      }
      for (let i = aboveIdx.length - 1; i > 0; i--) {
        const j = Math.floor(rng.random() * (i + 1));
        const t = aboveIdx[i]; aboveIdx[i] = aboveIdx[j]; aboveIdx[j] = t;
      }

      const spacing = 50, s2 = spacing * spacing, cell = spacing / Math.SQRT2;
      const grid = new Map();
      const sampleAreaColor = (cx, cy, rad) => {
        const x0 = Math.max(0, cx - rad), x1 = Math.min(w - 1, cx + rad);
        const y0 = Math.max(0, cy - rad), y1 = Math.min(h - 1, cy + rad);
        let sr = 0, sg = 0, sb = 0, cnt = 0;
        for (let y = y0; y <= y1; y += 2) {
          const rOff = y * w;
          for (let x = x0; x <= x1; x += 2) {
            const idx = rOff + x;
            if (maskClean[idx] > 30) {
              const p = idx * 4;
              sr += subjectData[p]; sg += subjectData[p + 1]; sb += subjectData[p + 2]; cnt++;
            }
          }
        }
        return cnt ? [(sr / cnt) | 0, (sg / cnt) | 0, (sb / cnt) | 0] : [128, 128, 128];
      };

      for (let k = 0; k < aboveIdx.length && candidates.length < 180; k++) {
        const i = aboveIdx[k];
        const ex = edgePixelsX[i], ey = edgePixelsY[i];
        const gx = (ex / cell) | 0, gy = (ey / cell) | 0;
        let close = false;
        for (let dx = -2; dx <= 2 && !close; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            const nb = grid.get((gx + dx) * 100000 + (gy + dy));
            if (nb && (ex - nb[0]) ** 2 + (ey - nb[1]) ** 2 < s2) { close = true; break; }
          }
        }
        if (close) continue;
        grid.set(gx * 100000 + gy, [ex, ey]);
        const hi = Math.min(hh - 1, ey >> 1) * hw + Math.min(hw - 1, ex >> 1);
        const nx = normXHalf[hi], ny = normYHalf[hi];
        const sx = Math.max(0, Math.min(w - 1, Math.trunc(ex - nx * 10)));
        const sy = Math.max(0, Math.min(h - 1, Math.trunc(ey - ny * 10)));
        const L = lumHalf[Math.min(hh - 1, sy >> 1) * hw + Math.min(hw - 1, sx >> 1)];
        candidates.push({
          x: sx + offset[0],
          y: sy + offset[1],
          nx: Number(nx.toFixed(4)),
          ny: Number(ny.toFixed(4)),
          interest: Number(Math.min(1, smInt[hi]).toFixed(4)),
          is_dark: L < 90,
          is_bright: L > 200,
          color: sampleAreaColor(sx, sy, 8),
          w_bright: 0.0,
          w_op: 1.0,
        });
      }

      const stepE = Math.max(1, (edgePixelsX.length / 1200) | 0);
      const spotGrid = new Map();
      for (let i = 0; i < edgePixelsX.length; i += stepE) {
        const ex = edgePixelsX[i], ey = edgePixelsY[i];
        const hi = Math.min(hh - 1, ey >> 1) * hw + Math.min(hw - 1, ex >> 1);
        const inx = -normXHalf[hi], iny = -normYHalf[hi];
        const edgeL = lumHalf[hi];
        let best = null;
        for (let d = 6; d <= 38; d += 6) {
          const sx = Math.max(0, Math.min(w - 1, (ex + inx * d) | 0));
          const sy = Math.max(0, Math.min(h - 1, (ey + iny * d) | 0));
          if (maskClean[sy * w + sx] < 128) continue;
          const lv = lumHalf[Math.min(hh - 1, sy >> 1) * hw + Math.min(hw - 1, sx >> 1)];
          if (lv >= 165 && lv - edgeL >= 32 && (!best || lv > best.lum)) {
            best = { sx, sy, lum: lv, nx: normXHalf[hi], ny: normYHalf[hi] };
          }
        }
        if (best && spots.length < 40) {
          const gx = (best.sx / 32) | 0, gy = (best.sy / 32) | 0;
          let close = false;
          for (let dx = -1; dx <= 1 && !close; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const nb = spotGrid.get((gx + dx) * 100000 + (gy + dy));
              if (nb && (best.sx - nb[0]) ** 2 + (best.sy - nb[1]) ** 2 < 1600) { close = true; break; }
            }
          }
          if (!close) {
            spotGrid.set(gx * 100000 + gy, [best.sx, best.sy]);
            spots.push({
              x: best.sx + offset[0],
              y: best.sy + offset[1],
              nx: Number(best.nx.toFixed(4)),
              ny: Number(best.ny.toFixed(4)),
              interest: 0.72,
              patch_area: 1200,
              color: sampleAreaColor(best.sx, best.sy, 8),
              w_bright: 0.0,
              w_op: 1.0,
            });
          }
        }
      }
    }

    return {
      averageColor,
      dominantColor,
      edges,
      edgePixelsX,
      edgePixelsY,
      normXHalf,
      normYHalf,
      hw,
      hh,
      candidates,
      spots,
    };
  }

  // ==========================================================================
  // 5. PAPER, BLUR_BG, SHADOW & COLORDROP LAYERS
  // ==========================================================================
  function buildPaperLayerClient(cw, ch, cfg) {
    const c = createCanvas(cw, ch);
    const ctx = c.getContext("2d");
    if (cfg.DARK_BACKGROUND_ENABLED) {
      const col = cfg.DARK_BACKGROUND_COLOR || [5, 5, 5];
      ctx.fillStyle = `rgb(${col[0]}, ${col[1]}, ${col[2]})`;
      ctx.fillRect(0, 0, cw, ch);
      return c;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    if (cfg.PAPER_TEXTURE_ENABLED === false) return c;

    const tile = STATE.brushImages["papertexture.png"];
    if (!tile) return c;
    const tw = tile.naturalWidth || tile.width;
    const th = tile.naturalHeight || tile.height;
    ctx.save();
    ctx.globalAlpha = cfg.PAPER_TEXTURE_OPACITY ?? 0.4;
    for (let y = 0; y < ch; y += th) {
      for (let x = 0; x < cw; x += tw) ctx.drawImage(tile, x, y);
    }
    ctx.restore();
    return c;
  }

  function buildBlurBgLayerClient(subjectCanvas, cw, ch, cfg) {
    if (cfg.MASK_BRUSH_ENABLED === false) return null;
    const sw = Math.max(1, cw >> 2), sh = Math.max(1, ch >> 2);
    const subW = Math.max(1, subjectCanvas.width >> 2), subH = Math.max(1, subjectCanvas.height >> 2);

    const smallSub = createCanvas(subW, subH);
    smallSub.getContext("2d").drawImage(subjectCanvas, 0, 0, subW, subH);

    const stackC = createCanvas(sw, sh);
    const stCtx = stackC.getContext("2d");
    const cx = sw >> 1, cy = sh >> 1;
    const numLayers = cfg.NUM_BLUR_LAYERS ?? 7;
    const scaleStep = cfg.LAYER_SCALE_STEP ?? 0.3;

    for (let i = numLayers; i >= 1; i--) {
      const sc = 1.0 + i * scaleStep;
      const nw = Math.trunc(subW * sc), nh = Math.trunc(subH * sc);
      stCtx.drawImage(smallSub, cx - (nw >> 1), cy - (nh >> 1), nw, nh);
    }
    smallSub.width = 1; smallSub.height = 1;

    const blurR = Math.max(1, (cfg.BLUR_AMOUNT ?? 25) >> 2);
    const satB = Math.round((cfg.SATURATION_BOOST ?? 1.1) * 100);
    const conB = Math.round((cfg.CONTRAST_BOOST ?? 1.4) * 100);

    const blurredSmall = createCanvas(sw, sh);
    const bCtx = blurredSmall.getContext("2d");
    bCtx.filter = `blur(${blurR}px) saturate(${satB}%) contrast(${conB}%)`;
    bCtx.drawImage(stackC, 0, 0);
    bCtx.filter = "none";
    stackC.width = 1; stackC.height = 1;

    const outC = createCanvas(cw, ch);
    outC.getContext("2d").drawImage(blurredSmall, 0, 0, cw, ch);
    blurredSmall.width = 1; blurredSmall.height = 1;
    return outC;
  }

  function getBottomOutlinePointsFast(edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh, spacing, leftMargin, rightMargin, inwardOffset) {
    if (!edgePixelsX.length) return [];
    let minX = 0x7fffffff, maxX = -0x7fffffff;
    const bottomByX = new Map();
    for (let i = 0; i < edgePixelsX.length; i++) {
      const x = edgePixelsX[i], y = edgePixelsY[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      const cur = bottomByX.get(x);
      if (cur === undefined || y > cur) bottomByX.set(x, y);
    }
    const effMinX = minX + leftMargin, effMaxX = maxX - rightMargin;
    const bot = [];
    for (const [x, y] of bottomByX.entries()) {
      if (x >= effMinX && x <= effMaxX) bot.push([x, y]);
    }
    if (!bot.length) return [];
    bot.sort((a, b) => a[0] - b[0]);

    const sampled = [bot[0]];
    const s2 = spacing * spacing;
    for (let i = 1; i < bot.length; i++) {
      const p = bot[i];
      let close = false;
      for (let j = 0; j < sampled.length; j++) {
        const dx = p[0] - sampled[j][0], dy = p[1] - sampled[j][1];
        if (dx * dx + dy * dy < s2) { close = true; break; }
      }
      if (!close) sampled.push(p);
    }
    return sampled.map(([x, y]) => {
      const hi = Math.min(hh - 1, y >> 1) * hw + Math.min(hw - 1, x >> 1);
      const nx = normXHalf[hi], ny = normYHalf[hi];
      return [x + Math.trunc(-nx * inwardOffset), y + Math.trunc(-ny * inwardOffset), nx, ny];
    });
  }

  function buildShadowLayerClient(edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh, cw, ch, offset, cfg) {
    if (!cfg.SHADOW_BRUSH_ENABLED) return null;
    const rng = new PythonRandom((cfg.RANDOM_SEED || 42) + 800);
    const pts = getBottomOutlinePointsFast(
      edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh,
      cfg.SHADOW_BRUSH_SPACING ?? 100,
      cfg.SHADOW_BRUSH_LEFT_MARGIN ?? 50,
      cfg.SHADOW_BRUSH_RIGHT_MARGIN ?? 50,
      cfg.SHADOW_BRUSH_INWARD_OFFSET ?? 20
    );
    const outC = createCanvas(cw, ch);
    const brushImg = STATE.brushImages["bgbrush.png"];
    if (!pts.length || !brushImg) return outC;

    const baseSize = cfg.SHADOW_BRUSH_SIZE ?? 300;
    const sizeJit = cfg.SHADOW_BRUSH_SIZE_JITTER ?? 0.2;
    const rotOff = cfg.SHADOW_BRUSH_ROTATION_OFFSET ?? 0;
    const rotJit = cfg.SHADOW_BRUSH_ROTATION_JITTER ?? 0.1;
    const gray = Math.trunc(255 * (cfg.SHADOW_BRUSH_LIGHTNESS ?? 0.0));
    const rgb = [gray, gray, gray];
    const endTurn = cfg.SHADOW_BRUSH_END_TURN_ANGLE ?? 45;

    const xs = pts.map((p) => p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const xRange = Math.max(1, maxX - minX);
    const leftT = minX + xRange * 0.15, rightT = maxX - xRange * 0.15;

    const strokes = [];
    for (const [x, y] of pts) {
      let rot = rotOff + rng.uniform(-180 * rotJit, 180 * rotJit);
      if (x <= leftT) rot += endTurn * (1.0 - (x - minX) / Math.max(1e-5, leftT - minX));
      else if (x >= rightT) rot -= endTurn * ((x - rightT) / Math.max(1e-5, maxX - rightT));
      const sz = Math.max(20, Math.trunc(baseSize * rng.uniform(1 - sizeJit, 1 + sizeJit)));
      strokes.push({ x: x + offset[0], y: y + offset[1], size: sz, rot, rgb, op: 1.0 });
    }
    const glC = drawStrokesWebGL(cw, ch, "bgbrush.png", brushImg, strokes);
    const ctx = outC.getContext("2d");
    ctx.globalAlpha = cfg.SHADOW_BRUSH_OPACITY ?? 0.5;
    if (glC) ctx.drawImage(glC, 0, 0);
    return outC;
  }

  function buildColordropLayerClient(edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh, cw, ch, offset, cfg) {
    if (!cfg.COLORDROP_BRUSH_ENABLED) return null;
    const rng = new PythonRandom((cfg.RANDOM_SEED || 42) + 850);
    const pts = getBottomOutlinePointsFast(
      edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh,
      cfg.COLORDROP_BRUSH_SPACING ?? 150,
      cfg.COLORDROP_BRUSH_LEFT_MARGIN ?? 80,
      cfg.COLORDROP_BRUSH_RIGHT_MARGIN ?? 80,
      cfg.COLORDROP_BRUSH_INWARD_OFFSET ?? 0
    );
    const outC = createCanvas(cw, ch);
    const brushImg = STATE.brushImages["colordrop.png"];
    if (!pts.length || !brushImg) return outC;

    const baseSize = cfg.COLORDROP_BRUSH_SIZE ?? 200;
    const sizeJit = cfg.COLORDROP_BRUSH_SIZE_JITTER ?? 0.3;
    const gray = Math.trunc(255 * (cfg.COLORDROP_BRUSH_LIGHTNESS ?? 0.0));
    const rgb = [gray, gray, gray];

    const strokes = [];
    for (const [x, y] of pts) {
      const sz = Math.max(20, Math.trunc(baseSize * rng.uniform(1 - sizeJit, 1 + sizeJit)));
      strokes.push({ x: x + offset[0], y: y + offset[1] + sz * 0.5, size: sz, rot: 0, rgb, op: 1.0 });
    }
    const glC = drawStrokesWebGL(cw, ch, "colordrop.png", brushImg, strokes);
    const ctx = outC.getContext("2d");
    ctx.globalAlpha = cfg.COLORDROP_BRUSH_OPACITY ?? 0.4;
    if (glC) ctx.drawImage(glC, 0, 0);
    return outC;
  }

  // ==========================================================================
  // 6. MASTER CLIENT-SIDE PAYLOAD GENERATOR
  // ==========================================================================
  async function generate(presetKey, useEditedMask = false) {
    const t0 = performance.now();
    const timings = { "0_engine_mode": "⚡ LOCAL_BROWSER_WEBGL2" };
    const { key, cfg } = await getPresetFromServerSingleSource(presetKey);

    const cw = cfg.OUTPUT_WIDTH || (key.startsWith("cars") ? 1782 : 1260);
    const ch = cfg.OUTPUT_HEIGHT || (key.startsWith("cars") ? 1260 : 1782);

    let tStep = performance.now();
    const origSource = STATE.framedPhotoCanvas || STATE.originalImg;
    const isCar = key.startsWith("cars");
    const maxW = isCar ? 1782 : 1260;
    const maxH = isCar ? 1260 : 1782;
    let w = origSource.naturalWidth || origSource.width;
    let h = origSource.naturalHeight || origSource.height;
    if (w > maxW || h > maxH) {
      const sc = Math.min(maxW / w, maxH / h);
      w = Math.round(w * sc);
      h = Math.round(h * sc);
    }

    const origC = createCanvas(w, h);
    origC.getContext("2d").drawImage(origSource, 0, 0, w, h);

    const maskC = createCanvas(w, h);
    const mCtx = maskC.getContext("2d");
    if (useEditedMask && STATE.maskCanvas) {
      mCtx.filter = "blur(1.5px)";
      mCtx.drawImage(STATE.maskCanvas, 0, 0, w, h);
      mCtx.filter = "none";
    } else if (STATE.framedMaskCanvas) {
      mCtx.drawImage(STATE.framedMaskCanvas, 0, 0, w, h);
    } else if (STATE.rawMaskBase64) {
      const rawMaskImg = await loadImage(STATE.rawMaskBase64);
      mCtx.drawImage(rawMaskImg, 0, 0, w, h);
    } else if (STATE.maskCanvas) {
      mCtx.drawImage(STATE.maskCanvas, 0, 0, w, h);
    }

    const rawMaskData = mCtx.getImageData(0, 0, w, h).data;
    const rawMaskU8 = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < rawMaskU8.length; i++, p += 4) rawMaskU8[i] = rawMaskData[p];

    const trim = useEditedMask ? 1 : (cfg.SUBJECT_EDGE_TRIM ?? 6);
    const maskClean = erodeMaskFastUint8(rawMaskU8, w, h, trim);

    const cleanMaskImgData = mCtx.createImageData(w, h);
    for (let i = 0, p = 0; i < maskClean.length; i++, p += 4) {
      const v = maskClean[i];
      cleanMaskImgData.data[p] = v;
      cleanMaskImgData.data[p + 1] = v;
      cleanMaskImgData.data[p + 2] = v;
      cleanMaskImgData.data[p + 3] = 255;
    }
    mCtx.putImageData(cleanMaskImgData, 0, 0);
    timings["1_mask_trim_sec"] = Number(((performance.now() - tStep) / 1000).toFixed(3));

    const offX = (cw - w) >> 1;
    const offY = (ch - h) >> 1;
    const offset = [offX, offY];

    // 2. WebGL2 GPU Color Correction + WebGL2 GPU LIC Oil Paint (~15 ms)
    tStep = performance.now();
    const gpuOut = renderSubjectAndOilGPU(origC, maskC, w, h, cw, ch, offset, cfg);
    if (!gpuOut) throw new Error("WebGL2 GPU filter context unavailable");
    const { cleanCcCrop, subCcFull, subTexFull, oilFull } = gpuOut;

    // 3. Multi-Eye Beautifier (Supports 1, 2, 3, 4, 6+ eyes for animal portraits across ANY preset!)
    let tEye = performance.now();
    const shouldRunEyeBeautifier =
      (STATE.isAnimalPhoto || key.startsWith("animals")) &&
      Array.isArray(STATE.detectedEyes) &&
      STATE.detectedEyes.length > 0;

    if (shouldRunEyeBeautifier) {
      // Scale eye coordinates if the preset switched orientation (e.g. animal switched to landscape car preset)
      const refSz = STATE.detectedEyesRefSize || [w, h];
      const sxE = w / Math.max(1, refSz[0]);
      const syE = h / Math.max(1, refSz[1]);
      const scaledEyes = STATE.detectedEyes.map((e) => ({
        ...e,
        x: e.x * sxE,
        y: e.y * syE,
        r: (e.r || 18) * Math.min(sxE, syE),
      }));
      // Free previous eye patch canvases if any
      if (Array.isArray(STATE.eyeBeautifierPatches)) {
        for (const ep of STATE.eyeBeautifierPatches) {
          if (ep.canvas) { ep.canvas.width = 1; ep.canvas.height = 1; }
        }
      }
      STATE.eyeBeautifierPatches = runMultiEyeBeautifierClient(origC, maskClean, w, h, scaledEyes, offset);
    } else if (!STATE.isAnimalPhoto && !key.startsWith("animals")) {
      STATE.eyeBeautifierPatches = [];
    }
    timings["2b_eye_beautifier_sec"] = Number(((performance.now() - tEye) / 1000).toFixed(3));
    timings["2b_eyes_beautified_count"] = (STATE.eyeBeautifierPatches || []).length;

    const subRawFull = createCanvas(cw, ch);
    const origCtx = origC.getContext("2d");
    const origImgData = origCtx.getImageData(0, 0, w, h);
    const oD = origImgData.data;
    for (let i = 0, p = 3; i < maskClean.length; i++, p += 4) oD[p] = maskClean[i];
    origCtx.putImageData(origImgData, 0, 0);
    subRawFull.getContext("2d").drawImage(origC, offX, offY);
    origC.width = 1; origC.height = 1;
    timings["2_gpu_cc_and_oil_sec"] = Number(((performance.now() - tStep) / 1000).toFixed(3));

    // 4. Half-Scale Normal Pyramid, Full-Res Edges, Accents & Auxiliary Layers
    tStep = performance.now();
    const {
      averageColor,
      dominantColor,
      edges,
      edgePixelsX,
      edgePixelsY,
      normXHalf,
      normYHalf,
      hw,
      hh,
      candidates,
      spots,
    } = computeEdgesPaletteAndAccentsFast(cleanCcCrop, maskClean, w, h, offset, cfg);

    const paperC = buildPaperLayerClient(cw, ch, cfg);
    const blurBgC = buildBlurBgLayerClient(cleanCcCrop, cw, ch, cfg);
    cleanCcCrop.width = 1; cleanCcCrop.height = 1;

    const shadowC = buildShadowLayerClient(edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh, cw, ch, offset, cfg);
    const colordropC = buildColordropLayerClient(edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh, cw, ch, offset, cfg);
    timings["3_edges_accents_effects_sec"] = Number(((performance.now() - tStep) / 1000).toFixed(3));

    const elapsedSec = Number(((performance.now() - t0) / 1000).toFixed(2));
    timings["total_client_sec"] = elapsedSec;
    STATE.lastEngineSource = "Local GPU";

    const payload = {
      _isCompact: true,
      preset_key: key,
      canvas_size: [cw, ch],
      offset: [offX, offY],
      subject_size: [w, h],
      preset_settings: cfg,
      average_color: cfg.BG_BRUSH_MIX_AVERAGE ? averageColor : [128, 128, 128],
      dominant_color: dominantColor,
      elapsed_sec: elapsedSec,
      timings,
      maskBlob: maskC,
      layerBlobs: {
        bg_paper: paperC,
        subject_raw: subRawFull,
        subject_cc: subCcFull,
        subject_tex: subTexFull,
        blur_bg: blurBgC,
        oil_paint_full: oilFull,
        shadow: shadowC,
        colordrop: colordropC,
      },
      stroke_data: {
        edges,
        accent_candidates: candidates,
        accent_spots: spots,
      },
    };
    rebuildEdgeSpatialIndex(payload.stroke_data);
    setTimeout(() => StudioProfiler.report(), 60);
    return payload;
  }

  window.ClientWatercolorEngine = { generate };
})();