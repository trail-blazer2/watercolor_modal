/*
 * framing.js  v6.1  -  Smart Framing + Multi-Aspect-Ratio Portrait & Vehicle Solver
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WatercolorFraming = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const REF = {
    animal: { canvasW: 1.0, canvasH: 1.43, sideMargin: 0.18, headTop: 0.25, eyeY: 0.45 },
    car: { canvasW: 1.43, canvasH: 1.0, left: 0.10, right: 0.10, bottom: 0.10, top: 0.30 },
  };

  const headWidthFrac = 1 - 2 * (REF.animal.sideMargin / REF.animal.canvasW); // 0.64
  const PROFILES = {
    animal: {
      label: "Animal / person (bust anchored to bottom, eye & head aligned)",
      kind: "bleed",
      sideMargin: REF.animal.sideMargin / REF.animal.canvasW,
      headTop: REF.animal.headTop / REF.animal.canvasH,
      eyeTargetY: REF.animal.eyeY / REF.animal.canvasH,
      eyeRatio: (REF.animal.eyeY - REF.animal.headTop) / (headWidthFrac * REF.animal.canvasW),
      headWidthRange: [0.48, 0.88],
      headTopRange: [0.10, 0.34],
      headRatioK: 0.78,
    },
    car: {
      label: "Car / vehicle (landscape, whole subject visible)",
      kind: "margin",
      margins: {
        left: REF.car.left / REF.car.canvasW,
        right: REF.car.right / REF.car.canvasW,
        top: REF.car.top / REF.car.canvasH,
        bottom: REF.car.bottom / REF.car.canvasH,
      },
      anchorY: 0.62,
    },
    object: {
      label: "Generic object / full-body subject",
      kind: "margin",
      margins: { left: 0.14, right: 0.14, top: 0.12, bottom: 0.12 },
      anchorY: 0.5,
    },
  };
  PROFILES.person = Object.assign({}, PROFILES.animal, {
    label: "Person / group portrait (eyes centered & aligned, bottom anchored)",
  });

  const DEFAULTS = {
    threshold: 115,
    visibleThreshold: 14,
    maxGrid: 360,
    minComponentFrac: 0.02,
    edgeTouchFrac: 0.022,
    trimFrac: 0.012,
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hide(obj, key, value) {
    Object.defineProperty(obj, key, { value: enumerableFalse(value), enumerable: false, writable: true });
  }
  function enumerableFalse(v) { return v; }

  function maskFromImageData(imageData, mode) {
    const { data, width, height } = imageData;
    const out = new Uint8Array(width * height);
    let m = mode || "auto";
    if (m === "auto") {
      m = "luma";
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) { m = "alpha"; break; }
      }
    }
    const off = m === "alpha" ? 3 : 0;
    for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = data[i + off];
    return out;
  }

  function downsampleMaskAndRGB(mask, photoImageData, w, h, threshold, visThreshold, maxGrid) {
    const f = Math.max(1, Math.ceil(Math.max(w, h) / maxGrid));
    const gw = Math.ceil(w / f), gh = Math.ceil(h / f);
    const grid = new Uint8Array(gw * gh);
    const visGrid = new Uint8Array(gw * gh);

    const hasRGB = !!(photoImageData && photoImageData.data && photoImageData.data.length >= w * h * 4);
    const rgbData = hasRGB ? photoImageData.data : null;
    const lumGrid = hasRGB ? new Float32Array(gw * gh) : null;
    const lumSqGrid = hasRGB ? new Float32Array(gw * gh) : null;
    const maxLGrid = hasRGB ? new Uint8Array(gw * gh) : null;
    const minLGrid = hasRGB ? new Uint8Array(gw * gh) : null;

    for (let gy = 0; gy < gh; gy++) {
      const y0 = gy * f, y1 = Math.min(h, y0 + f);
      for (let gx = 0; gx < gw; gx++) {
        const x0 = gx * f, x1 = Math.min(w, x0 + f);
        let sumM = 0, maxM = 0, n = 0;
        let sumL = 0, maxL = 0, minL = 255;

        for (let y = y0; y < y1; y++) {
          let p = y * w + x0;
          for (let x = x0; x < x1; x++, p++) {
            const mv = mask[p];
            sumM += mv;
            if (mv > maxM) maxM = mv;
            if (hasRGB) {
              const idx = p * 4;
              const l = 0.299 * rgbData[idx] + 0.587 * rgbData[idx + 1] + 0.114 * rgbData[idx + 2];
              sumL += l;
              if (l > maxL) maxL = l;
              if (l < minL) minL = l;
            }
          }
          n += x1 - x0;
        }
        const idxG = gy * gw + gx;
        grid[idxG] = sumM / n >= threshold ? 1 : 0;
        visGrid[idxG] = maxM >= visThreshold ? 1 : 0;

        if (hasRGB) {
          const meanL = sumL / n;
          lumGrid[idxG] = meanL;
          lumSqGrid[idxG] = meanL * meanL;
          maxLGrid[idxG] = Math.min(255, Math.round(maxL));
          minLGrid[idxG] = Math.max(0, Math.round(minL));
        }
      }
    }
    return { grid, visGrid, lumGrid, lumSqGrid, maxLGrid, minLGrid, hasRGB, gw, gh };
  }

  function removeSmallComponents(grid, gw, gh, minFrac) {
    const label = new Int32Array(gw * gh);
    const areas = [0];
    const stack = new Int32Array(gw * gh);
    let next = 0;
    for (let i = 0; i < grid.length; i++) {
      if (!grid[i] || label[i]) continue;
      next++;
      let sp = 0, area = 0;
      stack[sp++] = i; label[i] = next;
      while (sp) {
        const p = stack[--sp]; area++;
        const x = p % gw, y = (p / gw) | 0;
        if (x > 0 && grid[p - 1] && !label[p - 1]) { label[p - 1] = next; stack[sp++] = p - 1; }
        if (x < gw - 1 && grid[p + 1] && !label[p + 1]) { label[p + 1] = next; stack[sp++] = p + 1; }
        if (y > 0 && grid[p - gw] && !label[p - gw]) { label[p - gw] = next; stack[sp++] = p - gw; }
        if (y < gh - 1 && grid[p + gw] && !label[p + gw]) { label[p + gw] = next; stack[sp++] = p + gw; }
      }
      areas.push(area);
    }
    const biggest = Math.max(0, ...areas);
    const keep = areas.map((a) => a >= Math.max(2, biggest * minFrac));
    const out = new Uint8Array(gw * gh);
    for (let i = 0; i < grid.length; i++) if (grid[i] && keep[label[i]]) out[i] = 1;
    return out;
  }

  function smooth(arr, radius) {
    const n = arr.length, out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = i + k;
        if (j >= 0 && j < n && !Number.isNaN(arr[j])) { s += arr[j]; c++; }
      }
      out[i] = c ? s / c : NaN;
    }
    return out;
  }

  function makeIntegral(grid, gw, gh) {
    const S = gw + 1;
    const I = new Float64Array(S * (gh + 1));
    for (let y = 0; y < gh; y++) {
      let row = 0;
      for (let x = 0; x < gw; x++) {
        row += grid[y * gw + x];
        I[(y + 1) * S + x + 1] = I[y * S + x + 1] + row;
      }
    }
    return I;
  }

  function boxSum(I, gw, gh, x0, y0, x1, y1) {
    x0 = Math.max(0, Math.min(gw, x0 | 0));
    x1 = Math.max(0, Math.min(gw, x1 | 0));
    y0 = Math.max(0, Math.min(gh, y0 | 0));
    y1 = Math.max(0, Math.min(gh, y1 | 0));
    if (x1 <= x0 || y1 <= y0) return 0;
    const S = gw + 1;
    return I[y1 * S + x1] - I[y0 * S + x1] - I[y1 * S + x0] + I[y0 * S + x0];
  }

  function rectSum(an, c0, r0, c1, r1) {
    return boxSum(an._integral, an._gw, an._gh, c0, r0, c1, r1);
  }

  function computeChamferDistanceInsideMask(grid, gw, gh) {
    const n = gw * gh;
    const dist = new Float32Array(n);
    const INF = 1e6;
    for (let i = 0; i < n; i++) dist[i] = grid[i] ? INF : 0;

    for (let y = 0; y < gh; y++) {
      const row = y * gw;
      for (let x = 0; x < gw; x++) {
        const idx = row + x;
        let d = dist[idx];
        if (d === 0) continue;
        if (x > 0) d = Math.min(d, dist[idx - 1] + 1);
        if (y > 0) {
          d = Math.min(d, dist[idx - gw] + 1);
          if (x > 0) d = Math.min(d, dist[idx - gw - 1] + 1.414);
          if (x < gw - 1) d = Math.min(d, dist[idx - gw + 1] + 1.414);
        }
        dist[idx] = d;
      }
    }
    for (let y = gh - 1; y >= 0; y--) {
      const row = y * gw;
      for (let x = gw - 1; x >= 0; x--) {
        const idx = row + x;
        let d = dist[idx];
        if (d === 0) continue;
        if (x < gw - 1) d = Math.min(d, dist[idx + 1] + 1);
        if (y < gh - 1) {
          d = Math.min(d, dist[idx + gw] + 1);
          if (x < gw - 1) d = Math.min(d, dist[idx + gw + 1] + 1.414);
          if (x > 0) d = Math.min(d, dist[idx + gw - 1] + 1.414);
        }
        dist[idx] = d;
      }
    }
    return dist;
  }

  function detectHeadsAndNeck(grid, rowCount, L, R, Wd, x0, y0, x1, y1, gw, gh, k) {
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

    const upperCheckRows = Math.floor(0.38 * bh);
    let peakUpperFill = 1;
    for (let r = 0; r <= upperCheckRows; r++) {
      const c = rowCount[y0 + r];
      if (c > peakUpperFill) peakUpperFill = c;
    }
    let craniumRowStart = 0;
    while (
      craniumRowStart < Math.floor(0.28 * bh) &&
      rowCount[y0 + craniumRowStart] < peakUpperFill * 0.56
    ) {
      craniumRowStart++;
    }

    const bandMax = Math.floor(0.62 * bh);
    const minEnd = Math.max(craniumRowStart + 4, Math.floor(0.12 * bh));

    let peakW = 0, valleyW = Infinity, valleyAt = 0, endNeck = -1;
    for (let i = craniumRowStart; i <= bandMax; i++) {
      const w = Wd[i];
      if (Number.isNaN(w)) continue;
      if (valleyW < 0.88 * peakW && w > valleyW * 1.10) { endNeck = valleyAt; break; }
      if (w > peakW) { peakW = w; valleyW = Infinity; valleyAt = i; }
      else if (w < valleyW) { valleyW = w; valleyAt = i; }
    }

    let maxW = 0, endRatio = -1;
    for (let i = craniumRowStart; i <= bandMax; i++) {
      if (!Number.isNaN(Wd[i])) maxW = Math.max(maxW, Wd[i]);
      if (i >= minEnd && (i - craniumRowStart + 1) >= k * maxW) { endRatio = i; break; }
    }
    if (endRatio < 0) endRatio = Math.max(minEnd, Math.floor(0.42 * bh));

    let endAt = endRatio, method = "proportion";
    if (endNeck >= Math.floor(0.16 * bh) && endNeck < endAt) {
      endAt = endNeck;
      method = "neck";
    }

    const measureEnd = Math.max(minEnd, Math.floor(endAt * 0.88));
    let minL = Infinity, maxR = -Infinity;
    for (let i = 0; i <= measureEnd; i++) {
      if (!Number.isNaN(L[i])) minL = Math.min(minL, L[i]);
      if (!Number.isNaN(R[i])) maxR = Math.max(maxR, R[i]);
    }

    return { rowStart: craniumRowStart, rowEnd: endAt, left: minL, right: maxR + 1, method };
  }

  function analyzeMask(mask, w, h, options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const prep = downsampleMaskAndRGB(
      mask,
      o.photoImageData || null,
      w,
      h,
      o.threshold,
      o.visibleThreshold,
      o.maxGrid
    );
    const { gw, gh } = prep;
    const grid = removeSmallComponents(prep.grid, gw, gh, o.minComponentFrac);
    const visGrid = removeSmallComponents(prep.visGrid, gw, gh, o.minComponentFrac);
    prep.grid = grid;

    const rowCount = new Int32Array(gh), colCount = new Int32Array(gw);
    const visRowCount = new Int32Array(gh), visColCount = new Int32Array(gw);
    let total = 0;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (grid[y * gw + x]) { rowCount[y]++; colCount[x]++; total++; }
        if (visGrid[y * gw + x]) { visRowCount[y]++; visColCount[x]++; }
      }
    }
    if (total === 0) return { empty: true, srcW: w, srcH: h };

    const rowMin = Math.max(1, Math.round(0.004 * gw));
    const colMin = Math.max(1, Math.round(0.004 * gh));
    let y0 = 0, y1 = gh - 1, x0 = 0, x1 = gw - 1;
    while (y0 < gh - 1 && rowCount[y0] < rowMin) y0++;
    while (y1 > 0 && rowCount[y1] < rowMin) y1--;
    while (x0 < gw - 1 && colCount[x0] < colMin) x0++;
    while (x1 > 0 && colCount[x1] < colMin) x1--;

    const visRowMin = Math.max(2, Math.round(0.015 * gw));
    let visY1 = y1;
    while (visY1 < gh - 1 && visRowCount[visY1 + 1] >= visRowMin) visY1++;

    let visX0 = x0, visX1 = x1;
    while (visX0 > 0 && visColCount[visX0 - 1] >= colMin) visX0--;
    while (visX1 < gw - 1 && visColCount[visX1 + 1] >= colMin) visX1++;

    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const hasFadedBottom = visY1 > y1 + 3;
    const solidAnchorRow = hasFadedBottom
      ? Math.round(y1 + (visY1 - y1) * 0.22)
      : visY1;

    const tolX = Math.max(2, Math.round(o.edgeTouchFrac * gw));
    const tolY = Math.max(2, Math.round(o.edgeTouchFrac * gh));
    const sumVisRows = (a, b) => { let s = 0; for (let y = a; y <= b; y++) s += visRowCount[y]; return s; };
    const sumVisCols = (a, b) => { let s = 0; for (let x = a; x <= b; x++) s += visColCount[x]; return s; };

    const touches = {
      top: y0 <= tolY && sumVisRows(0, tolY - 1) >= 0.04 * bw * tolY,
      bottom: visY1 >= gh - tolY - 1,
      left: visX0 <= tolX && sumVisCols(0, tolX - 1) >= 0.04 * bh * tolX,
      right: visX1 >= gw - tolX - 1 && sumVisCols(gw - tolX, gw - 1) >= 0.04 * bh * tolX,
      fadedBottom: hasFadedBottom,
    };

    const L = new Float64Array(bh).fill(NaN), R = new Float64Array(bh).fill(NaN);
    for (let r = 0; r < bh; r++) {
      const y = y0 + r, c = rowCount[y];
      if (!c) continue;
      const t = Math.floor(c * o.trimFrac);
      let k = 0;
      for (let x = 0; x < gw; x++) {
        if (grid[y * gw + x]) { if (k === t) { L[r] = x; break; } k++; }
      }
      k = 0;
      for (let x = gw - 1; x >= 0; x--) {
        if (grid[y * gw + x]) { if (k === t) { R[r] = x; break; } k++; }
      }
    }

    const Ls = smooth(L, 2), Rs = smooth(R, 2);
    const Wd = new Float64Array(bh);
    for (let r = 0; r < bh; r++) Wd[r] = Rs[r] - Ls[r] + 1;

    const headSil = detectHeadsAndNeck(
      grid, rowCount, Ls, Rs, Wd, x0, y0, x1, y1, gw, gh,
      (options && options.headRatioK) || PROFILES.animal.headRatioK
    );

    const hLeft = Math.max(0, Math.floor(headSil.left));
    const hRight = Math.min(gw - 1, Math.ceil(headSil.right - 1));
    const hSpanW = Math.max(1, hRight - hLeft + 1);
    const rStart = Math.max(headSil.rowStart, Math.floor(headSil.rowEnd * 0.06));
    const rEnd = Math.max(rStart + 1, Math.floor(headSil.rowEnd * 0.92));

    const colFill = new Float64Array(hSpanW);
    for (let cx = 0; cx < hSpanW; cx++) {
      const gx = hLeft + cx;
      let cnt = 0;
      for (let r = rStart; r <= rEnd; r++) {
        if (grid[(y0 + r) * gw + gx]) cnt++;
      }
      colFill[cx] = cnt;
    }
    const colSmooth = smooth(colFill, Math.max(1, Math.round(hSpanW * 0.03)));
    let peakColFill = 1;
    for (let cx = 0; cx < hSpanW; cx++) {
      if (colSmooth[cx] > peakColFill) peakColFill = colSmooth[cx];
    }

    const maxEarTrim = Math.floor(hSpanW * 0.16);
    const solidThresh = peakColFill * 0.58;
    let trimL = 0, trimR = 0;
    while (trimL < maxEarTrim && colSmooth[trimL] < solidThresh) trimL++;
    while (trimR < maxEarTrim && colSmooth[hSpanW - 1 - trimR] < solidThresh) trimR++;

    const rawHeadW = (headSil.right - headSil.left) / gw;
    const craniumX0 = (hLeft + trimL) / gw;
    const craniumX1 = (hRight + 1 - trimR) / gw;
    const craniumW = Math.max(rawHeadW * 0.72, craniumX1 - craniumX0);
    const effectiveHeadW = craniumW + 0.22 * (rawHeadW - craniumW);
    const craniumY0 = (y0 + headSil.rowStart) / gh;

    const headBox = {
      x0: headSil.left / gw,
      x1: headSil.right / gw,
      craniumX0,
      craniumX1,
      y0: y0 / gh,
      craniumY0,
      y1: (y0 + headSil.rowEnd + 1) / gh,
      width: rawHeadW,
      effectiveWidth: effectiveHeadW,
      method: headSil.method,
    };

    let upL = Infinity, upR = -Infinity;
    const headEndRow = Math.min(bh - 1, Math.max(3, Math.round((headBox.y1 - y0 / gh) * gh)));
    for (let r = 0; r <= headEndRow; r++) {
      const y = y0 + r;
      let rl = -1, rr = -1;
      for (let x = 0; x < gw; x++) if (grid[y * gw + x]) { if (rl < 0) rl = x; rr = x; }
      if (rl < 0) continue;
      if (rl > 1) upL = Math.min(upL, rl);
      if (rr < gw - 2) upR = Math.max(upR, rr + 1);
    }

    const estEyeY = craniumY0 + PROFILES.animal.eyeRatio * effectiveHeadW * (w / h);
    const estEyeX = 0.75 * ((headBox.x0 + headBox.x1) * 0.5) + 0.25 * ((craniumX0 + craniumX1) * 0.5);

    const analysis = {
      empty: false,
      srcW: w, srcH: h, srcAspect: w / h,
      areaFrac: total / (gw * gh),
      bbox: {
        x0: visX0 / gw,
        y0: y0 / gh,
        x1: (visX1 + 1) / gw,
        y1: (visY1 + 1) / gh,
        solidY1: (solidAnchorRow + 1) / gh,
      },
      touches,
      head: headBox,
      eyes: [],
      eyeCenter: { x: estEyeX, y: estEyeY, count: 0, faceCount: 0, isHuman: false },
      eyeMethod: "cranium_proportion",
    };

    hide(analysis, "_grid", grid);
    hide(analysis, "_gw", gw);
    hide(analysis, "_gh", gh);
    hide(analysis, "_total", total);
    hide(analysis, "_integral", makeIntegral(grid, gw, gh));
    hide(analysis, "_upperL", Number.isFinite(upL) ? upL / gw : null);
    hide(analysis, "_upperR", Number.isFinite(upR) ? upR / gw : null);
    hide(analysis, "_prep", prep);

    if (prep.hasRGB && prep.lumGrid) {
      const gradH = new Float32Array(gw * gh);
      for (let y = 1; y < gh - 1; y++) {
        const row = y * gw;
        for (let x = 1; x < gw - 1; x++) {
          const idx = row + x;
          if (!grid[idx]) continue;
          const dy = Math.abs(prep.lumGrid[idx + gw] - prep.lumGrid[idx - gw]);
          const dx = Math.abs(prep.lumGrid[idx + 1] - prep.lumGrid[idx - 1]);
          gradH[idx] = Math.max(0, dy - dx * 0.35);
        }
      }
      hide(analysis, "_distToEdge", computeChamferDistanceInsideMask(grid, gw, gh));
      hide(analysis, "_intLum", makeIntegral(prep.lumGrid, gw, gh));
      hide(analysis, "_intLumSq", makeIntegral(prep.lumSqGrid, gw, gh));
      hide(analysis, "_intGradH", makeIntegral(gradH, gw, gh));
    }

    return analysis;
  }

  function withHeadOverride(analysis, box) {
    const w = box.x1 - box.x0;
    const c = Object.assign({}, analysis, {
      head: {
        x0: box.x0, x1: box.x1, craniumX0: box.x0, craniumX1: box.x1,
        y0: box.y0, craniumY0: box.y0, y1: box.y1, width: w, effectiveWidth: w, method: "manual",
      },
    });
    ["_grid", "_gw", "_gh", "_total", "_integral", "_upperL", "_upperR", "_prep", "_distToEdge", "_intLum", "_intLumSq", "_intGradH"].forEach((k) => {
      if (analysis[k] !== undefined) hide(c, k, analysis[k]);
    });
    return c;
  }

  function withEyesOverride(analysis, eyesList) {
    let eyeCenter = null;
    if (eyesList && eyesList.length > 0) {
      let sx = 0, sy = 0;
      for (const e of eyesList) { sx += e.x; sy += e.y; }
      eyeCenter = {
        x: sx / eyesList.length,
        y: sy / eyesList.length,
        count: eyesList.length,
        faceCount: eyesList.length >= 2 ? 1 : 0,
        isHuman: eyesList.length >= 2,
      };
    }
    const c = Object.assign({}, analysis, {
      eyes: eyesList || [],
      eyeCenter,
      eyeMethod: "manual_override",
    });
    ["_grid", "_gw", "_gh", "_total", "_integral", "_upperL", "_upperR", "_prep", "_distToEdge", "_intLum", "_intLumSq", "_intGradH"].forEach((k) => {
      if (analysis[k] !== undefined) hide(c, k, analysis[k]);
    });
    return c;
  }

  function resolveProfile(analysis, requested) {
    const bboxAspect =
      ((analysis.bbox.x1 - analysis.bbox.x0) * analysis.srcW) /
      ((analysis.bbox.y1 - analysis.bbox.y0) * analysis.srcH);
    const req = requested || "auto";
    if (req === "car") return { key: "car", reason: "chosen by you" };
    if (req === "object") return { key: "object", reason: "chosen by you (whole subject fitted)" };
    if (req === "animal" || req === "person") return { key: req, reason: "chosen by you: bust anchored to bottom, eye & head aligned" };
    if (analysis.subjects && analysis.subjects.kind) {
      return { key: analysis.subjects.kind, reason: `AI detected ${analysis.subjects.kind}` };
    }
    if (bboxAspect >= 1.48 && !analysis.touches.bottom) {
      return { key: "car", reason: "auto: wide landscape subject (vehicle-like)" };
    }
    return {
      key: analysis.eyeCenter && analysis.eyeCenter.isHuman ? "person" : "animal",
      reason: "auto: portrait/bust — bottom anchored to canvas floor, eyes & head aligned to target guides",
    };
  }

  function suggestOrientation(analysis, requested) {
    if (analysis.empty) return "portrait";
    const p = resolveProfile(analysis, requested);
    if (p.key === "animal" || p.key === "person") return "portrait";
    if (p.key === "car") return "landscape";
    const bb = analysis.bbox;
    const a = ((bb.x1 - bb.x0) * analysis.srcW) / ((bb.y1 - bb.y0) * analysis.srcH);
    return a > 1.1 ? "landscape" : "portrait";
  }

  function solvePortrait(an, W, H, prof) {
    const a = an.srcAspect, bb = an.bbox, hd = an.head, t = an.touches;
    const gw = an._gw, gh = an._gh, total = an._total;
    const hT = 1 - 2 * prof.sideMargin; // 0.64

    // Scale reference width so wide/landscape ratios keep vertical head & eye proportions balanced
    // while expanding side margins naturally.
    const refPortraitAspect = REF.animal.canvasW / REF.animal.canvasH;
    const effectiveW = Math.min(W, H * refPortraitAspect);

    const bustBottomY = bb.solidY1 != null ? bb.solidY1 : bb.y1;
    const headTopRefY = hd.craniumY0 != null ? hd.craniumY0 : bb.y0;
    const effHeadW = hd.effectiveWidth || hd.width;
    const rawHeadCx = (hd.x0 + hd.x1) * 0.5;
    const craniumCx = hd.craniumX0 != null ? (hd.craniumX0 + hd.craniumX1) * 0.5 : rawHeadCx;
    const headCx = 0.75 * rawHeadCx + 0.25 * craniumCx;
    const bbCx = (bb.x0 + bb.x1) * 0.5;

    let anchorX = 0.88 * headCx + 0.12 * bbCx;
    if (an.eyeCenter && an.eyeCenter.count > 0) {
      if (an.eyeCenter.isHuman && an.eyeCenter.count >= 2) {
        anchorX = 0.85 * an.eyeCenter.x + 0.15 * headCx;
      } else if (an.eyeCenter.count >= 2) {
        anchorX = 0.55 * headCx + 0.45 * an.eyeCenter.x;
      } else {
        anchorX = 0.82 * headCx + 0.18 * an.eyeCenter.x;
      }
    }

    const srcEyeY = an.eyeCenter && an.eyeCenter.y != null
      ? an.eyeCenter.y
      : headTopRefY + prof.eyeRatio * effHeadW * a;

    const baseDw = (hT * effectiveW) / Math.max(0.08, effHeadW);
    const sq = (v) => v * v;

    function evaluate(f, desiredTopFrac, dxFrac, wantTerms) {
      const dw = baseDw * f, dh = dw / a;
      const hwEff = (effHeadW * dw) / effectiveW;
      const hwFull = (hd.width * dw) / effectiveW;

      const y0FromTop = desiredTopFrac * H - headTopRefY * dh;
      const minY0ForBottom = H - bustBottomY * dh;
      const isShortBustAtThisScale = y0FromTop < minY0ForBottom;
      let y0 = isShortBustAtThisScale ? minY0ForBottom : y0FromTop;

      const minEarTipY = 0.032 * H - bb.y0 * dh;
      if (y0 < minEarTipY) y0 = minEarTipY;

      const actualTopFrac = (y0 + headTopRefY * dh) / H;
      const actualEyeFrac = (y0 + srcEyeY * dh) / H;

      let x0 = W * 0.5 + dxFrac * W - anchorX * dw;
      const leftCutX = x0 + bb.x0 * dw;
      const rightCutX = x0 + bb.x1 * dw;
      if (t.left && !t.right && leftCutX > 0) {
        x0 -= leftCutX;
      } else if (t.right && !t.left && rightCutX < W) {
        x0 += W - rightCutX;
      } else if (t.left && t.right) {
        if (leftCutX > 0) x0 -= leftCutX;
        if (x0 + bb.x1 * dw < W) x0 = W - bb.x1 * dw;
      }

      const T = {};

      if (isShortBustAtThisScale) {
        const targetHw = hT * 1.07;
        T.head = 2.6 * sq(Math.log(hwEff / targetHw) / (hwEff > targetHw ? 0.15 : 0.14));
        const lowDrop = Math.max(0, actualTopFrac - prof.headTop);
        const extraLow = Math.max(0, actualTopFrac - 0.245);
        T.top = 1.6 * sq(lowDrop / 0.065) + 4.5 * sq(extraLow / 0.035);
        T.eye = 1.2 * sq(Math.max(0, actualEyeFrac - prof.eyeTargetY) / 0.085);
      } else {
        T.head = 4.2 * sq(Math.log(hwEff / hT) / (hwEff > hT ? 0.11 : 0.15));
        T.top = 1.8 * sq((actualTopFrac - prof.headTop) / 0.065);
        T.eye = 2.4 * sq((actualEyeFrac - prof.eyeTargetY) / 0.060);
      }

      const attentionX = x0 + anchorX * dw;
      T.balance = 3.0 * sq((attentionX / W - 0.5) / 0.045);

      const cu0 = Math.round(clamp(-x0 / dw, 0, 1) * gw);
      const cu1 = Math.round(clamp((W - x0) / dw, 0, 1) * gw);
      const cv0 = Math.round(clamp(-y0 / dh, 0, 1) * gh);
      const lossSides = (rectSum(an, 0, 0, cu0, gh) + rectSum(an, cu1, 0, gw, gh)) / total;
      const lossTop = rectSum(an, 0, 0, gw, cv0) / total;
      T.crop = sq(lossSides / 0.35) + sq(lossTop / 0.008);

      const hx0 = x0 + hd.x0 * dw, hx1 = x0 + hd.x1 * dw;
      const minSideMargin = 0.082 * effectiveW;
      const overflow = (Math.max(0, minSideMargin - hx0) + Math.max(0, hx1 - (W - minSideMargin))) / effectiveW;
      T.headBox = 4.0 * sq(overflow / 0.015);

      let ovU = 0;
      if (an._upperL != null) ovU += Math.max(0, 0.03 * effectiveW - (x0 + an._upperL * dw));
      if (an._upperR != null) ovU += Math.max(0, x0 + an._upperR * dw - (W - 0.03 * effectiveW));
      T.upper = 1.0 * sq(ovU / effectiveW / 0.025);

      const earTopFrac = (y0 + bb.y0 * dh) / H;
      T.topCeiling = earTopFrac < 0.03 ? sq((0.03 - earTopFrac) / 0.012) : 0;

      let cover = 0;
      if (t.left) cover += 25.0 * sq(Math.max(0, x0 + bb.x0 * dw) / W / 0.01);
      if (t.right) cover += 25.0 * sq(Math.max(0, W - (x0 + bb.x1 * dw)) / W / 0.01);
      if (t.top) cover += 25.0 * sq(Math.max(0, y0 + bb.y0 * dh) / H / 0.01);
      T.cover = cover;

      let cost = 0;
      for (const k in T) cost += T[k];
      return wantTerms ? { cost, T, dw, x0, y0, hw: hwFull, hwEff, isShortBustAtThisScale } : cost;
    }

    function search(fList, yList, xList) {
      let best = { cost: Infinity };
      for (const f of fList) for (const y of yList) for (const x of xList) {
        const c = evaluate(f, y, x, false);
        if (c < best.cost) best = { cost: c, f, y, x };
      }
      return best;
    }

    const lin = (a0, a1, n) => Array.from({ length: n }, (_, i) => a0 + ((a1 - a0) * i) / (n - 1));
    const fLo = 0.78, fHi = 1.32;
    const geo = (n) => Array.from({ length: n }, (_, i) => fLo * Math.pow(fHi / fLo, i / (n - 1)));
    const [tMin, tMax] = prof.headTopRange;

    const c1 = search(geo(35), lin(tMin, tMax, 19), lin(-0.24, 0.24, 37));
    const stepF = Math.pow(fHi / fLo, 1 / 34);
    const c2 = search(
      lin(c1.f / stepF, c1.f * stepF, 11),
      lin(Math.max(tMin, c1.y - 0.012), Math.min(tMax, c1.y + 0.012), 9),
      lin(c1.x - 0.012, c1.x + 0.012, 9)
    );
    const best = evaluate(c2.f, c2.y, c2.x, true);

    const notes = [];
    if (best.isShortBustAtThisScale) {
      notes.push(
        `short-cropped bust: cranium ${(best.hwEff * 100).toFixed(0)}% (ear-to-ear ${(best.hw * 100).toFixed(0)}%) lifted to optimal vertical balance`
      );
    }
    return { place: { dw: best.dw, x0: best.x0, y0: best.y0 }, cost: best.cost, terms: best.T, notes };
  }

  function computeFraming(analysis, canvas, opts) {
    if (analysis.empty) return { empty: true, warnings: ["mask_is_empty"] };
    const o = opts || {};
    const W = canvas.width, H = canvas.height;
    const adj = Object.assign({ zoom: 1, dx: 0, dy: 0 }, o.adjust || {});
    const choice = resolveProfile(analysis, o.profile);
    const prof = Object.assign({}, PROFILES[choice.key], o.profileOverrides || {});
    const a = analysis.srcAspect;
    const bb = analysis.bbox;
    const t = analysis.touches;
    const bbW = bb.x1 - bb.x0, bbH = bb.y1 - bb.y0;

    let dw, x0, y0;
    const notes = [];
    let solver = null;

    if (prof.kind === "bleed") {
      solver = solvePortrait(analysis, W, H, prof);
      ({ dw, x0, y0 } = solver.place);
      notes.push(...solver.notes);
    } else {
      const m = prof.margins;
      const boxW = (1 - m.left - m.right) * W, boxH = (1 - m.top - m.bottom) * H;
      dw = Math.min(boxW / bbW, (boxH * a) / bbH);
      const dh = dw / a;
      const bw = bbW * dw, bh = bbH * dh;
      const bx = m.left * W + (boxW - bw) / 2;
      const by = m.top * H + (boxH - bh) * clamp(prof.anchorY, 0, 1);
      x0 = bx - bb.x0 * dw;
      y0 = by - bb.y0 * dh;
    }

    if (adj.zoom !== 1 || adj.dx || adj.dy) {
      let cx = W * 0.5;
      if (prof.kind === "bleed") {
        if (t.left && !t.right) cx = 0;
        else if (t.right && !t.left) cx = W;
      }
      const cy = prof.kind === "bleed" ? H : H * 0.5;

      x0 = cx + (x0 - cx) * adj.zoom + adj.dx * W;
      y0 = cy + (y0 - cy) * adj.zoom + adj.dy * H;
      dw *= adj.zoom;
      const dhAfter = dw / a;

      if (prof.kind === "bleed") {
        if (adj.dy === 0) {
          const bustBottomY = bb.solidY1 != null ? bb.solidY1 : bb.y1;
          if (y0 + bustBottomY * dhAfter < H) {
            y0 = H - bustBottomY * dhAfter;
          }
        }
        if (adj.dx === 0) {
          if (t.left && !t.right && x0 + bb.x0 * dw > 0) {
            x0 = -bb.x0 * dw;
          } else if (t.right && !t.left && x0 + bb.x1 * dw < W) {
            x0 = W - bb.x1 * dw;
          }
        }
      }
    }

    const out = describe(analysis, canvas, { dw, x0, y0 }, choice, prof, adj, notes);
    if (solver) out.solver = { cost: solver.cost, terms: solver.terms };
    return out;
  }

  function describe(analysis, canvas, place, choice, prof, adj, notes) {
    const W = canvas.width, H = canvas.height;
    const { dw, x0, y0 } = place;
    const a = analysis.srcAspect, dh = dw / a;
    const bb = analysis.bbox, hd = analysis.head;
    const headTopRefY = hd.craniumY0 != null ? hd.craniumY0 : bb.y0;

    const bx0 = x0 + bb.x0 * dw, bx1 = x0 + bb.x1 * dw;
    const by0 = y0 + bb.y0 * dh, by1 = y0 + bb.y1 * dh;
    const hx0 = x0 + hd.x0 * dw, hx1 = x0 + hd.x1 * dw;
    const hy0 = y0 + headTopRefY * dh, hy1 = y0 + hd.y1 * dh;

    const rawEyes = prof.kind === "bleed" ? (analysis.eyes || []) : [];
    const canvasEyes = rawEyes.map((e) => ({
      x: x0 + e.x * dw,
      y: y0 + e.y * dh,
      r: e.r * dw,
      xFrac: (x0 + e.x * dw) / W,
      yFrac: (y0 + e.y * dh) / H,
      rFrac: (e.r * dw) / W,
      side: e.side,
      confidence: e.confidence,
    }));

    const detectedEyeY = prof.kind === "bleed"
      ? (analysis.eyeCenter && analysis.eyeCenter.y != null ? y0 + analysis.eyeCenter.y * dh : prof.eyeRatio ? hy0 + prof.eyeRatio * (hx1 - hx0) : null)
      : null;

    const detectedEyeX = prof.kind === "bleed"
      ? (analysis.eyeCenter && analysis.eyeCenter.x != null ? x0 + analysis.eyeCenter.x * dw : (hx0 + hx1) * 0.5)
      : W * 0.5;

    const refPortraitAspect = REF.animal.canvasW / REF.animal.canvasH;
    const effectiveW = Math.min(W, H * refPortraitAspect);
    const targetSideMargin = (W - (1 - 2 * prof.sideMargin) * effectiveW) * 0.5;

    const metrics = {
      bboxLeft: bx0,
      bboxRight: W - bx1,
      bboxTop: by0,
      bboxBottom: H - by1,
      subjectWidth: bx1 - bx0,
      subjectHeight: by1 - by0,
      headLeft: hx0,
      headRight: W - hx1,
      headWidth: hx1 - hx0,
      headTop: hy0,
      earTipTop: by0,
      headBottom: hy1,
      eyeLine: detectedEyeY,
      eyeCenterX: detectedEyeX,
      eyeCount: canvasEyes.length,
    };

    const warnings = [];
    const eps = 0.004;
    const t = analysis.touches;
    if (t.top && by0 > eps * H) warnings.push("subject_is_cut_at_top_of_photo: head cropped in original photo");
    if (t.left && bx0 > eps * W) warnings.push("subject_is_cut_at_left_of_photo: straight edge visible on left");
    if (t.right && bx1 < W - eps * W) warnings.push("subject_is_cut_at_right_of_photo: straight edge visible on right");
    if (prof.kind === "bleed" && metrics.bboxBottom > 0.5) {
      warnings.push("bust_bottom_gap: subject bottom is above the canvas floor");
    }

    const vis = {
      u0: clamp((0 - x0) / dw, 0, 1), u1: clamp((W - x0) / dw, 0, 1),
      v0: clamp((0 - y0) / dh, 0, 1), v1: clamp((H - y0) / dh, 0, 1),
    };

    return {
      empty: false,
      profile: choice.key,
      profileLabel: prof.label,
      mode: prof.kind,
      reason: choice.reason,
      notes,
      warnings,
      canvas: { width: W, height: H },
      rect: { x: x0 / W, y: y0 / H, w: dw / W, h: dh / H },
      rectUnits: { x: x0, y: y0, w: dw, h: dh },
      scale: dw / W,
      visibleSource: vis,
      subjectRect: { x0: bx0 / W, y0: by0 / H, x1: bx1 / W, y1: by1 / H },
      headRect: { x0: hx0 / W, y0: hy0 / H, x1: hx1 / W, y1: hy1 / H },
      eyes: canvasEyes,
      eyeCenter: detectedEyeY != null ? { x: detectedEyeX / W, y: detectedEyeY / H } : null,
      metrics,
      targets: prof.kind === "bleed"
        ? {
            headLeft: targetSideMargin,
            headRight: targetSideMargin,
            headTop: prof.headTop * H,
            eyeLine: prof.eyeTargetY * H,
            eyeCenterX: 0.5 * W,
          }
        : {
            bboxLeft: prof.margins.left * W,
            bboxRight: prof.margins.right * W,
            bboxTop: prof.margins.top * H,
            bboxBottom: prof.margins.bottom * H,
          },
      adjust: adj,
    };
  }

  function toPixels(framing, pxW, pxH) {
    return {
      x: framing.rect.x * pxW,
      y: framing.rect.y * pxH,
      w: framing.rect.w * pxW,
      h: framing.rect.h * pxH,
      eyes: (framing.eyes || []).map((e) => ({
        x: e.xFrac * pxW,
        y: e.yFrac * pxH,
        r: e.rFrac * pxW,
        side: e.side,
        confidence: e.confidence,
      })),
    };
  }

  return {
    PROFILES,
    REF,
    DEFAULTS,
    maskFromImageData,
    analyzeMask,
    withHeadOverride,
    withEyesOverride,
    computeFraming,
    suggestOrientation,
    resolveProfile,
    toPixels,
  };
});