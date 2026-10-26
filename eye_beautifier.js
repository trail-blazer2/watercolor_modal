/**
 * 🐾 eye_beautifier.js — Standalone Multi-Eye Animal Beautifier (Port of eye.py v8)
 *   - Supports 1, 2, 3 (e.g. one front + one half-turned head), 4, 6+ eyes.
 *   - Works with RTMPose keypoints on PC AND includes a built-in head-region eye scanner
 *     for mobile devices (where the 54.5 MB RTMPose ONNX model is skipped).
 *   - 4x Bicubic Supersampling + Smooth Gaussian Baselines + Circular Bottom Fade + Dark-Eye Lower Crescent.
 */
(function () {
  "use strict";

  const EYE_CFG = {
    reflection_boost_strength: 1.65,
    reflection_max_white: 250.0,
    secondary_eye_balance_pow: 0.75,
    env_reconstruct_max_opacity: 0.46,
    iris_exposure_lift: 1.26,
    iris_chroma_boost: 1.42,
    iris_fiber_clarity: 1.38,
    dark_eye_lower_crescent_op: 0.36,
    bottom_circular_fade_base: 0.44,
    bottom_circular_fade_bright: 0.48,
    dark_pupil_toe_strength: 0.38,
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

  /**
   * Automatic Multi-Eye Scanner inside the animal's head region when RTMPose keypoints are unavailable
   * (e.g. on iPhone/mobile) or to find additional eyes (3, 4, 6+ eyes) across multiple heads.
   */
  function scanHeadRegionForEyes(origCtx, maskClean, w, h, existingEyes, headRectNorm) {
    const found = [...existingEyes];
    // Search upper 65% of the subject bounding box (or headRectNorm if available)
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y += 2) {
      const row = y * w;
      for (let x = 0; x < w; x += 2) {
        if (maskClean[row + x] > 128) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return found;

    const subW = maxX - minX;
    const subH = maxY - minY;
    const sx0 = headRectNorm ? Math.max(minX, Math.floor(headRectNorm.x0 * w)) : minX + Math.floor(subW * 0.08);
    const sx1 = headRectNorm ? Math.min(maxX, Math.ceil(headRectNorm.x1 * w)) : maxX - Math.floor(subW * 0.08);
    const sy0 = headRectNorm ? Math.max(minY, Math.floor(headRectNorm.y0 * h)) : minY + Math.floor(subH * 0.06);
    const sy1 = headRectNorm ? Math.min(maxY, Math.ceil(headRectNorm.y1 * h)) : minY + Math.floor(subH * 0.58);

    const rw = sx1 - sx0, rh = sy1 - sy0;
    if (rw < 40 || rh < 40) return found;

    // Downsample head region to ~180px wide to find dark eye cores with bright glints or iris contrast
    const scale = Math.min(1.0, 180 / Math.max(rw, rh));
    const gw = Math.max(24, Math.round(rw * scale));
    const gh = Math.max(24, Math.round(rh * scale));

    const c = createCanvas(gw, gh);
    c.getContext("2d").drawImage(origCtx.canvas, sx0, sy0, rw, rh, 0, 0, gw, gh);
    const d = c.getContext("2d").getImageData(0, 0, gw, gh).data;
    c.width = 1; c.height = 1;

    const n = gw * gh;
    const lum = new Float32Array(n);
    const valid = new Uint8Array(n);
    for (let y = 0; y < gh; y++) {
      const fy = Math.min(h - 1, sy0 + Math.floor(y / scale));
      for (let x = 0; x < gw; x++) {
        const fx = Math.min(w - 1, sx0 + Math.floor(x / scale));
        const i = y * gw + x;
        if (maskClean[fy * w + fx] > 200) valid[i] = 1;
        const p = i * 4;
        lum[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      }
    }

    const rEyeGrid = Math.max(3, Math.round(gw * 0.048));
    const smFine = boxBlurFloat32(lum, gw, gh, Math.max(1, rEyeGrid >> 1));
    const smBroad = boxBlurFloat32(lum, gw, gh, rEyeGrid * 2);

    // Eye score: dark local cavity (smBroad - smFine) + nearby sharp glint peak (lum - smFine)
    const glint = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (valid[i]) glint[i] = Math.max(0, lum[i] - smFine[i]);
    }
    const localGlintEnergy = boxBlurFloat32(glint, gw, gh, rEyeGrid);

    const score = new Float32Array(n);
    for (let y = rEyeGrid * 2; y < gh - rEyeGrid * 2; y++) {
      const row = y * gw;
      for (let x = rEyeGrid * 2; x < gw - rEyeGrid * 2; x++) {
        const i = row + x;
        if (!valid[i] || smFine[i] > 105) continue;
        const cavity = Math.max(0, smBroad[i] - smFine[i]);
        const gl = localGlintEnergy[i];
        if (cavity > 8 && gl > 2.2) {
          score[i] = cavity * (1.0 + gl * 0.45);
        }
      }
    }

    // Extract up to 6 non-overlapping eye peaks
    const minDistGrid = rEyeGrid * 3.2;
    const estRadiusFull = Math.max(10, Math.round((rEyeGrid / scale) * 1.05));
    const cands = [];
    for (let k = 0; k < 8; k++) {
      let bestS = 14.0, bestIdx = -1;
      for (let i = 0; i < n; i++) {
        if (score[i] > bestS) {
          bestS = score[i];
          bestIdx = i;
        }
      }
      if (bestIdx < 0) break;
      const gx = bestIdx % gw, gy = (bestIdx / gw) | 0;
      const fx = sx0 + gx / scale;
      const fy = sy0 + gy / scale;

      // Zero out neighborhood in score
      for (let yy = Math.max(0, Math.floor(gy - minDistGrid)); yy <= Math.min(gh - 1, Math.ceil(gy + minDistGrid)); yy++) {
        for (let xx = Math.max(0, Math.floor(gx - minDistGrid)); xx <= Math.min(gw - 1, Math.ceil(gx + minDistGrid)); xx++) {
          if (Math.hypot(xx - gx, yy - gy) <= minDistGrid) score[yy * gw + xx] = 0;
        }
      }

      if (!found.some((e) => Math.hypot(e.x - fx, e.y - fy) < estRadiusFull * 2.4)) {
        cands.push({ x: fx, y: fy, r: estRadiusFull, score: bestS });
      }
    }

    // Keep top symmetric pairs or strong single eyes (for half-turned heads)
    for (const c of cands.slice(0, 6)) {
      found.push({ x: c.x, y: c.y, r: c.r });
    }
    return found;
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

  function segmentEyeballAtKeypointJS(origCtx, maskClean, W, H, kpX, kpY, initR) {
    const estR = Math.max(6, Math.min(Math.min(W, H) * 0.09, initR));
    const winHalf = Math.max(24, Math.round(estR * 2.4));
    const wx0 = Math.max(0, Math.round(kpX - winHalf));
    const wy0 = Math.max(0, Math.round(kpY - winHalf));
    const wx1 = Math.min(W, Math.round(kpX + winHalf));
    const wy1 = Math.min(H, Math.round(kpY + winHalf));
    const cw = wx1 - wx0, ch = wy1 - wy0;
    if (cw < 12 || ch < 12) return null;

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

    // Reject false-positive fur patches that have neither dark contrast nor iris chroma contrast
    const inP95Lum = percentileFloat(lum, innerDisk, 95);
    if (furMedLum - p20 < 6.0 && inP75Chroma - furMedChroma < 8.0 && inP95Lum - p20 < 14.0) {
      return null;
    }

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

  function processForPayload(origCanvas, maskClean, w, h, offset, presetKey) {
    const isAnimal = STATE.isAnimalPhoto || (presetKey && presetKey.startsWith("animals"));
    if (!isAnimal) {
      STATE.eyeBeautifierPatches = [];
      return [];
    }

    const origCtx = origCanvas.getContext("2d");
    const refSz = STATE.detectedEyesRefSize || [w, h];
    const sxE = w / Math.max(1, refSz[0]);
    const syE = h / Math.max(1, refSz[1]);

    let candidateEyes = (STATE.detectedEyes || []).map((e) => ({
      ...e,
      x: e.x * sxE,
      y: e.y * syE,
      r: (e.r || 18) * Math.min(sxE, syE),
    }));

    // If RTMPose was skipped (e.g. on iPhone/mobile) or found < 2 eyes, scan head region automatically!
    if (candidateEyes.length < 2) {
      candidateEyes = scanHeadRegionForEyes(origCtx, maskClean, w, h, candidateEyes, STATE.headRectNorm || null);
    }

    const eyes = [];
    for (const e of candidateEyes) {
      const ex = e.x, ey = e.y;
      const initR = Math.max(8, e.r || Math.min(w, h) * 0.025);
      if (ex < 0 || ex >= w || ey < 0 || ey >= h) continue;
      if (eyes.some((o) => Math.hypot(ex - o.cx, ey - o.cy) < Math.min(initR, o.r_iris) * 1.6)) continue;
      const seg = segmentEyeballAtKeypointJS(origCtx, maskClean, w, h, ex, ey, initR);
      if (seg) eyes.push(seg);
    }

    if (Array.isArray(STATE.eyeBeautifierPatches)) {
      for (const ep of STATE.eyeBeautifierPatches) {
        if (ep && ep.canvas) { ep.canvas.width = 1; ep.canvas.height = 1; }
      }
    }

    if (!eyes.length) {
      STATE.eyeBeautifierPatches = [];
      return [];
    }

    const envInfo = analyzeSceneEnvironmentJS(origCanvas, maskClean, w, h);
    const envTint = envInfo.skyTint;

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

    let maxStrength = 0;
    for (const p of prepared) if (p.rdata.reflStrength > maxStrength) maxStrength = p.rdata.reflStrength;
    const sceneReflScale = maxStrength >= 7.0 ? Math.max(0.42, Math.min(1.0, maxStrength / 28.0)) : 0.45;

    const outPatches = [];
    for (const item of prepared) {
      const { eye, wx0, wy0, cw, ch, upW, upH, patchUp, samSoft, cxUp, cyUp, pxUp, pyUp, rUp, rOrig, rdata } = item;
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

    STATE.eyeBeautifierPatches = outPatches;
    console.log(`🐾 EyeBeautifier: enhanced ${outPatches.length} animal eye(s)`);
    return outPatches;
  }

  window.EyeBeautifier = { processForPayload };
})();