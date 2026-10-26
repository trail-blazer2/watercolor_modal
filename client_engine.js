/**
 * ⚡ client_engine.js — 100% Client-Side Watercolor & Oil Paint Engine (Path A)
 *   - Reads preset settings directly from Python's `/health` (single source of truth in presets_*.py!)
 *   - Produces the exact payload structure expected by the original `studio_core.js` (including full overscan).
 */
(function () {
  "use strict";

  async function getPresetFromServerSingleSource(presetKey) {
    if (!STATE.serverPresets) {
      try {
        const res = await fetch(`${STATE.apiUrl}/health`, { mode: "cors" });
        if (res.ok) {
          const data = await res.json();
          if (data && data.presets) {
            STATE.serverPresets = data.presets;
            try { localStorage.setItem("wc_cached_presets_v1", JSON.stringify(data.presets)); } catch (_) {}
          }
        }
      } catch (_) {
        try {
          const cached = localStorage.getItem("wc_cached_presets_v1");
          if (cached) STATE.serverPresets = JSON.parse(cached);
        } catch (__) {}
      }
    }
    const dict = STATE.serverPresets || {};
    const key = dict[presetKey] ? presetKey : "animals";
    return { key, cfg: { ...(dict[key] || {}), _preset_name: key } };
  }

  function canvasToBlobAndFree(canvas, mime = "image/webp", quality = 0.88) {
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          canvas.width = 1;
          canvas.height = 1;
          resolve(blob);
        },
        mime,
        quality
      );
    });
  }

  function morphFilterUint8(src, w, h, radius, isMax) {
    if (radius <= 0) return new Uint8Array(src);
    const tmp = new Uint8Array(w * h);
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(w - 1, x + radius);
        let best = src[row + x0];
        if (isMax) {
          for (let xi = x0 + 1; xi <= x1; xi++) if (src[row + xi] > best) best = src[row + xi];
        } else {
          for (let xi = x0 + 1; xi <= x1; xi++) if (src[row + xi] < best) best = src[row + xi];
        }
        tmp[row + x] = best;
      }
    }
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(h - 1, y + radius);
      const dstRow = y * w;
      for (let x = 0; x < w; x++) {
        let best = tmp[y0 * w + x];
        if (isMax) {
          for (let yi = y0 + 1; yi <= y1; yi++) if (tmp[yi * w + x] > best) best = tmp[yi * w + x];
        } else {
          for (let yi = y0 + 1; yi <= y1; yi++) if (tmp[yi * w + x] < best) best = tmp[yi * w + x];
        }
        dst[dstRow + x] = best;
      }
    }
    return dst;
  }

  // ==========================================================================
  // 1. COLOR CORRECTION & WATERCOLOR TEXTURE OVERLAY
  // ==========================================================================
  function applyColorCorrectionClient(origCanvas, w, h, cfg) {
    const outC = createCanvas(w, h);
    const outCtx = outC.getContext("2d");
    outCtx.drawImage(origCanvas, 0, 0, w, h);
    if (cfg.COLOR_CORRECTION_ENABLED === false) return outC;

    const sw = Math.max(1, w >> 2), sh = Math.max(1, h >> 2);
    const smallC = createCanvas(sw, sh);
    const sCtx = smallC.getContext("2d");
    sCtx.filter = "blur(7px)";
    sCtx.drawImage(origCanvas, 0, 0, sw, sh);
    sCtx.filter = "none";

    const upC = createCanvas(w, h);
    const uCtx = upC.getContext("2d");
    uCtx.drawImage(smallC, 0, 0, w, h);
    const blurData = uCtx.getImageData(0, 0, w, h).data;
    smallC.width = 1; smallC.height = 1;
    upC.width = 1; upC.height = 1;

    const imgData = outCtx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const n = w * h;

    const shadowLift = cfg.CC_SHADOW_LIFT ?? 10;
    const highReduce = cfg.CC_HIGHLIGHT_REDUCE ?? 30;
    const vibrance = cfg.CC_VIBRANCE ?? 1.25;
    const sat = cfg.CC_SATURATION ?? 1.10;
    const bright = cfg.CC_BRIGHTNESS ?? 1.08;
    const contrast = cfg.CC_CONTRAST ?? 1.02;
    const warmFilter = cfg.CC_WARM_FILTER ?? 0.02;
    const warmBoost = cfg.CC_WARM_BOOST ?? 2.6;
    const bAmt = warmBoost - 1.0;

    let sumLum = 0;
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const bLum = (0.299 * blurData[p] + 0.587 * blurData[p + 1] + 0.114 * blurData[p + 2]) / 255.0;
      const shMask = Math.pow(1.0 - bLum, 0.7);
      const hiMask = Math.max(0, Math.min(1, (Math.pow(bLum, 0.7) - 0.5) * 2.0));
      const delta = shMask * shadowLift - hiMask * highReduce;

      let r = Math.max(0, Math.min(255, d[p] + delta)) / 255.0;
      let g = Math.max(0, Math.min(255, d[p + 1] + delta)) / 255.0;
      let b = Math.max(0, Math.min(255, d[p + 2] + delta)) / 255.0;

      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const curSat = mx > 0 ? (mx - mn) / mx : 0;
      const vibBoost = 1.0 + (vibrance - 1.0) * Math.pow(1.0 - curSat, 0.5);
      const gray = (r + g + b) / 3.0;
      r = Math.max(0, Math.min(1, gray + (r - gray) * vibBoost)) * 255.0;
      g = Math.max(0, Math.min(1, gray + (g - gray) * vibBoost)) * 255.0;
      b = Math.max(0, Math.min(1, gray + (b - gray) * vibBoost)) * 255.0;

      const l601 = 0.299 * r + 0.587 * g + 0.114 * b;
      r = Math.max(0, Math.min(255, (l601 + (r - l601) * sat) * bright));
      g = Math.max(0, Math.min(255, (l601 + (g - l601) * sat) * bright));
      b = Math.max(0, Math.min(255, (l601 + (b - l601) * sat) * bright));

      d[p] = r; d[p + 1] = g; d[p + 2] = b;
      sumLum += 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const meanL = sumLum / Math.max(1, n);

    for (let i = 0; i < n; i++) {
      const p = i * 4;
      let r = Math.max(0, Math.min(255, meanL + (d[p] - meanL) * contrast));
      let g = Math.max(0, Math.min(255, meanL + (d[p + 1] - meanL) * contrast));
      let b = Math.max(0, Math.min(255, meanL + (d[p + 2] - meanL) * contrast));

      if (warmFilter > 0) {
        r = r * (1 - warmFilter) + 255 * warmFilter;
        g = g * (1 - warmFilter) + 197 * warmFilter;
        b = b * (1 - warmFilter) + 143 * warmFilter;
      }
      if (bAmt > 0) {
        const wFactor = Math.max(0, Math.min(1, (r - b) / 255.0)) * (1.0 - Math.max(0, Math.min(1, (g - r) / 255.0)));
        r = Math.max(0, Math.min(255, r + wFactor * bAmt * 20.0));
        b = Math.max(0, Math.min(255, b - wFactor * bAmt * 10.0));
      }
      d[p] = r; d[p + 1] = g; d[p + 2] = b;
    }

    outCtx.putImageData(imgData, 0, 0);
    return outC;
  }

  function applyWatercolorTextureClient(srcCanvas, sizeMult, opacity, contrast) {
    const texImg = STATE.brushImages["watercolortexture.png"];
    const w = srcCanvas.width, h = srcCanvas.height;
    const outC = createCanvas(w, h);
    const outCtx = outC.getContext("2d");
    outCtx.drawImage(srcCanvas, 0, 0);
    if (!texImg || opacity <= 0) return outC;

    const tw = Math.max(1, Math.trunc((texImg.naturalWidth || texImg.width) * sizeMult));
    const th = Math.max(1, Math.trunc((texImg.naturalHeight || texImg.height) * sizeMult));
    const tileC = createCanvas(tw, th);
    const tCtx = tileC.getContext("2d");
    if (contrast !== 1.0) tCtx.filter = `contrast(${Math.round(contrast * 100)}%)`;
    tCtx.drawImage(texImg, 0, 0, tw, th);
    tCtx.filter = "none";
    const tData = tCtx.getImageData(0, 0, tw, th).data;

    const imgData = outCtx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const inv255 = 1 / 255;

    for (let y = 0; y < h; y++) {
      const ty = (y % th) * tw;
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        const p = row + x * 4;
        if (d[p + 3] === 0) continue;
        const tv = tData[(ty + (x % tw)) * 4] * inv255;
        for (let c = 0; c < 3; c++) {
          const bv = d[p + c] * inv255;
          const ov = bv < 0.5 ? 2 * bv * tv : 1 - 2 * (1 - bv) * (1 - tv);
          d[p + c] = Math.max(0, Math.min(255, Math.round((bv * (1 - opacity) + ov * opacity) * 255)));
        }
      }
    }
    outCtx.putImageData(imgData, 0, 0);
    tileC.width = 1; tileC.height = 1;
    return outC;
  }

  // ==========================================================================
  // 2. EDGECACHE, COLOR OUTLINE, AVERAGE & DOMINANT COLOR
  // ==========================================================================
  function computePaletteAndEdgesClient(subjectData, maskClean, w, h, cfg) {
    const n = w * h;
    let sumR = 0, sumG = 0, sumB = 0, visCount = 0;
    const counts = new Int32Array(1331);
    for (let i = 0; i < n; i++) {
      if (maskClean[i] <= 128) continue;
      const p = i * 4;
      const r = subjectData[p], g = subjectData[p + 1], b = subjectData[p + 2];
      sumR += r; sumG += g; sumB += b; visCount++;
      const biR = (r / 24) | 0, biG = (g / 24) | 0, biB = (b / 24) | 0;
      counts[biR * 121 + biG * 11 + biB]++;
    }
    const averageColor = visCount > 0
      ? [Math.trunc(sumR / visCount), Math.trunc(sumG / visCount), Math.trunc(sumB / visCount)]
      : [128, 128, 128];

    let dominantColor = null;
    let bestCount = -1;
    for (let idx = 0; idx < 1331; idx++) {
      const cnt = counts[idx];
      if (cnt <= bestCount) continue;
      const r = ((idx / 121) | 0) * 24 + 12;
      const g = (((idx % 121) / 11) | 0) * 24 + 12;
      const b = (idx % 11) * 24 + 12;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 40 || lum > 220) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx > 0 ? (mx - mn) / (mx + 1) : 0;
      if (sat > 0.20) {
        bestCount = cnt;
        dominantColor = [r, g, b];
      }
    }

    const bin20 = new Uint8Array(n);
    const bin128 = new Float32Array(n);
    const bxX = new Float32Array(n);
    const bxY = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const m = maskClean[i];
        if (m > 20) bin20[i] = 255;
        if (m > 128) {
          bin128[i] = 1.0;
          bxX[i] = x;
          bxY[i] = y;
        }
      }
    }
    const eroded3 = morphFilterUint8(bin20, w, h, 1, false);
    const edgePixelsX = [];
    const edgePixelsY = [];
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        if (bin20[i] > eroded3[i]) {
          edgePixelsX.push(x);
          edgePixelsY.push(y);
        }
      }
    }

    const countBlur = boxBlurFloat32(bin128, w, h, 10);
    const avgX = boxBlurFloat32(bxX, w, h, 10);
    const avgY = boxBlurFloat32(bxY, w, h, 10);
    const normX = new Float32Array(n);
    const normY = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const sc = Math.max(countBlur[i], 1e-10);
        const nx = -(avgX[i] / sc - x);
        const ny = -(avgY[i] / sc - y);
        const mag = Math.hypot(nx, ny) + 1e-10;
        normX[i] = nx / mag;
        normY[i] = ny / mag;
      }
    }

    const edgeWidth = cfg.EDGE_SAMPLE_WIDTH ?? 20;
    const halfEw = edgeWidth >> 1;
    const edges = new Array(edgePixelsX.length);

    for (let k = 0; k < edgePixelsX.length; k++) {
      const ex = edgePixelsX[k], ey = edgePixelsY[k];
      const idx = ey * w + ex;
      const nx = normX[idx], ny = normY[idx];
      const sx = Math.max(0, Math.min(w - 1, Math.trunc(ex - nx * halfEw)));
      const sy = Math.max(0, Math.min(h - 1, Math.trunc(ey - ny * halfEw)));
      const sp = (sy * w + sx) * 4;
      let r = subjectData[sp], g = subjectData[sp + 1], b = subjectData[sp + 2];
      const valid = maskClean[sy * w + sx] >= 50 ? 1 : 0;

      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * 1.5;
      g = l + (g - l) * 1.5;
      b = l + (b - l) * 1.5;
      r = Math.max(0, Math.min(255, Math.round(128 + (r - 128) * 1.3)));
      g = Math.max(0, Math.min(255, Math.round(128 + (g - 128) * 1.3)));
      b = Math.max(0, Math.min(255, Math.round(128 + (b - 128) * 1.3)));

      edges[k] = [ex, ey, nx, ny, r, g, b, valid];
    }

    return { averageColor, dominantColor, edges, normX, normY, edgePixelsX, edgePixelsY };
  }

  // ==========================================================================
  // 3. PAPER, BLUR_BG, SHADOW & COLORDROP LAYERS
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
    const texC = createCanvas(cw, ch);
    const tCtx = texC.getContext("2d");
    for (let y = 0; y < ch; y += th) {
      for (let x = 0; x < cw; x += tw) tCtx.drawImage(tile, x, y);
    }
    const warmth = cfg.PAPER_TEXTURE_WARMTH ?? 0.2;
    if (warmth > 0) {
      const wAmt = warmth * 0.3;
      const img = tCtx.getImageData(0, 0, cw, ch);
      const d = img.data;
      const inv = 1 - wAmt;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, d[i] * inv + 255 * wAmt);
        d[i + 1] = Math.min(255, d[i + 1] * inv + 240 * wAmt);
        d[i + 2] = Math.min(255, d[i + 2] * inv + 220 * wAmt);
      }
      tCtx.putImageData(img, 0, 0);
    }
    ctx.save();
    ctx.globalAlpha = cfg.PAPER_TEXTURE_OPACITY ?? 0.4;
    ctx.drawImage(texC, 0, 0);
    ctx.restore();
    texC.width = 1; texC.height = 1;
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

    let outC = createCanvas(cw, ch);
    outC.getContext("2d").drawImage(blurredSmall, 0, 0, cw, ch);
    blurredSmall.width = 1; blurredSmall.height = 1;

    if (cfg.BLUR_BG_TEXTURE_ENABLED) {
      const texOut = applyWatercolorTextureClient(
        outC,
        cfg.BLUR_BG_TEXTURE_SIZE ?? 1.0,
        cfg.BLUR_BG_TEXTURE_OPACITY ?? 0.8,
        cfg.BLUR_BG_TEXTURE_CONTRAST ?? 1.2
      );
      outC.width = 1; outC.height = 1;
      outC = texOut;
    }
    return outC;
  }

  function getBottomOutlinePointsClient(edgePixelsX, edgePixelsY, normX, normY, w, spacing, leftMargin, rightMargin, inwardOffset) {
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
    const effMinX = minX + leftMargin;
    const effMaxX = maxX - rightMargin;
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
      const idx = y * w + x;
      const nx = normX[idx], ny = normY[idx];
      return [x + Math.trunc(-nx * inwardOffset), y + Math.trunc(-ny * inwardOffset), nx, ny];
    });
  }

  function buildShadowLayerClient(edgePixelsX, edgePixelsY, normX, normY, w, cw, ch, offset, cfg) {
    if (!cfg.SHADOW_BRUSH_ENABLED) return null;
    const rng = new PythonRandom((cfg.RANDOM_SEED || 42) + 800);
    const pts = getBottomOutlinePointsClient(
      edgePixelsX, edgePixelsY, normX, normY, w,
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

  function buildColordropLayerClient(edgePixelsX, edgePixelsY, normX, normY, w, cw, ch, offset, cfg) {
    if (!cfg.COLORDROP_BRUSH_ENABLED) return null;
    const rng = new PythonRandom((cfg.RANDOM_SEED || 42) + 850);
    const pts = getBottomOutlinePointsClient(
      edgePixelsX, edgePixelsY, normX, normY, w,
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
  // 4. OIL PAINT ENGINE (Structure Tensor + 4-Step Bidirectional LIC)
  // ==========================================================================
  function buildOilPaintLayerClient(correctedCanvas, maskClean, w, h, cw, ch, offset, cfg) {
    if (cfg.OIL_PAINT_ENABLED === false) return null;

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (maskClean[row + x] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return createCanvas(cw, ch);

    const pad = 28;
    const x1 = Math.max(0, minX - pad), y1 = Math.max(0, minY - pad);
    const x2 = Math.min(w, maxX + pad + 1), y2 = Math.min(h, maxY + pad + 1);
    const bw = x2 - x1, bh = y2 - y1;

    const scale = cfg.OIL_DETAIL_SCALE ?? 0.85;
    const sw = Math.max(8, Math.round(bw * scale));
    const sh = Math.max(8, Math.round(bh * scale));

    const workC = createCanvas(sw, sh);
    const wCtx = workC.getContext("2d");
    wCtx.drawImage(correctedCanvas, x1, y1, bw, bh, 0, 0, sw, sh);

    const lumSmallC = createCanvas(Math.max(1, sw >> 2), Math.max(1, sh >> 2));
    const lsCtx = lumSmallC.getContext("2d");
    lsCtx.filter = "blur(6px)";
    lsCtx.drawImage(workC, 0, 0, lumSmallC.width, lumSmallC.height);
    lsCtx.filter = "none";
    const lumUpC = createCanvas(sw, sh);
    lumUpC.getContext("2d").drawImage(lumSmallC, 0, 0, sw, sh);
    const lumBlurData = lumUpC.getContext("2d").getImageData(0, 0, sw, sh).data;
    lumSmallC.width = 1; lumSmallC.height = 1;
    lumUpC.width = 1; lumUpC.height = 1;

    const imgData = wCtx.getImageData(0, 0, sw, sh);
    const d = imgData.data;
    const n = sw * sh;

    const shAmt = ((cfg.OIL_SHADOW_AMOUNT ?? 30) / 100.0) * 100.0;
    const hiAmt = ((cfg.OIL_HIGHLIGHT_AMOUNT ?? 90) / 100.0) * 80.0;
    const black = cfg.OIL_LEVELS_BLACK ?? 30;
    const white = cfg.OIL_LEVELS_WHITE ?? 220;
    const invRange = 255.0 / Math.max(1, white - black);
    const invGamma = 1.0 / (cfg.OIL_LEVELS_GAMMA ?? 0.95);

    const gray = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const bL = (0.299 * lumBlurData[p] + 0.587 * lumBlurData[p + 1] + 0.114 * lumBlurData[p + 2]) / 255.0;
      const shM = Math.pow(1.0 - bL, 0.5);
      const hiM = Math.max(0, Math.min(1, (bL - 0.5) * 2.0));
      const delta = shM * shAmt - hiM * hiAmt;

      for (let c = 0; c < 3; c++) {
        let v = Math.max(0, Math.min(255, d[p + c] + delta));
        v = Math.max(0, Math.min(255, (v - black) * invRange));
        v = 255.0 * Math.pow(v / 255.0, invGamma);
        d[p + c] = v;
      }
      gray[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    }

    const graySm = boxBlurFloat32(gray, sw, sh, 1);
    const Ixx = new Float32Array(n);
    const Iyy = new Float32Array(n);
    const Ixy = new Float32Array(n);

    for (let y = 1; y < sh - 1; y++) {
      const row = y * sw;
      for (let x = 1; x < sw - 1; x++) {
        const i = row + x;
        const ix = (graySm[i + 1] - graySm[i - 1]) * 0.5;
        const iy = (graySm[i + sw] - graySm[i - sw]) * 0.5;
        Ixx[i] = ix * ix;
        Iyy[i] = iy * iy;
        Ixy[i] = ix * iy;
      }
    }
    const Sxx = boxBlurFloat32(Ixx, sw, sh, 2);
    const Syy = boxBlurFloat32(Iyy, sw, sh, 2);
    const Sxy = boxBlurFloat32(Ixy, sw, sh, 2);

    const flowX = new Float32Array(n);
    const flowY = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const theta = 0.5 * Math.atan2(2.0 * Sxy[i], Sxx[i] - Syy[i] + 1e-10);
      flowX[i] = -Math.sin(theta);
      flowY[i] = Math.cos(theta);
    }
    const fxSm = boxBlurFloat32(flowX, sw, sh, 2);
    const fySm = boxBlurFloat32(flowY, sw, sh, 2);

    const srcCopy = new Uint8Array(d);
    const stepDist = 5.0;
    const wMax = sw - 1, hMax = sh - 1;
    const weights = [1.0, 0.875, 0.75, 0.625];
    const invWsum = 1.0 / (2.0 * (1.0 + 0.875 + 0.75 + 0.625));

    for (let y = 0; y < sh; y++) {
      const row = y * sw;
      for (let x = 0; x < sw; x++) {
        const i0 = row + x;
        let rAcc = 0, gAcc = 0, bAcc = 0;
        for (let dir = -1; dir <= 1; dir += 2) {
          let cx = x, cy = y;
          const dStep = dir * stepDist;
          for (let s = 0; s < 4; s++) {
            const wt = weights[s];
            const xi = Math.max(0, Math.min(wMax, cx | 0));
            const yi = Math.max(0, Math.min(hMax, cy | 0));
            const idx = yi * sw + xi;
            const p = idx * 4;
            rAcc += srcCopy[p] * wt;
            gAcc += srcCopy[p + 1] * wt;
            bAcc += srcCopy[p + 2] * wt;
            cx += fxSm[idx] * dStep;
            cy += fySm[idx] * dStep;
          }
        }
        const p0 = i0 * 4;
        d[p0] = rAcc * invWsum;
        d[p0 + 1] = gAcc * invWsum;
        d[p0 + 2] = bAcc * invWsum;
      }
    }
    wCtx.putImageData(imgData, 0, 0);

    const blurC = createCanvas(sw, sh);
    const bCtx = blurC.getContext("2d");
    bCtx.filter = "blur(2.8px)";
    bCtx.drawImage(workC, 0, 0);
    bCtx.filter = "none";
    const bData = bCtx.getImageData(0, 0, sw, sh).data;
    blurC.width = 1; blurC.height = 1;

    const hpStrength = cfg.OIL_HIGH_PASS_STRENGTH ?? 0.5;
    const unsharpAmt = (cfg.OIL_UNSHARP_AMOUNT ?? 1.1) * 0.55;
    const finalCon = cfg.OIL_FINAL_CONTRAST ?? 1.0;

    for (let i = 0; i < n; i++) {
      const p = i * 4;
      for (let c = 0; c < 3; c++) {
        const origV = d[p + c];
        const blurV = bData[p + c];
        const base = origV / 255.0;
        const ov = Math.max(0, Math.min(255, origV - blurV + 128)) / 255.0;
        const blended = base < 0.5 ? 2 * base * ov : 1 - 2 * (1 - base) * (1 - ov);
        let resV = (base + (blended - base) * hpStrength) * 255.0;
        resV += (resV - blurV) * unsharpAmt;
        if (finalCon > 1.0) resV = 128 + (resV - 128) * finalCon;
        d[p + c] = Math.max(0, Math.min(255, resV));
      }
    }
    wCtx.putImageData(imgData, 0, 0);

    const cropOutC = createCanvas(bw, bh);
    const coCtx = cropOutC.getContext("2d");
    coCtx.drawImage(workC, 0, 0, bw, bh);
    workC.width = 1; workC.height = 1;

    const coImg = coCtx.getImageData(0, 0, bw, bh);
    const coD = coImg.data;
    for (let y = 0; y < bh; y++) {
      const mRow = (y1 + y) * w + x1;
      const cRow = y * bw * 4;
      for (let x = 0; x < bw; x++) {
        coD[cRow + x * 4 + 3] = maskClean[mRow + x];
      }
    }
    coCtx.putImageData(coImg, 0, 0);

    const fullOilC = createCanvas(cw, ch);
    fullOilC.getContext("2d").drawImage(cropOutC, offset[0] + x1, offset[1] + y1);
    cropOutC.width = 1; cropOutC.height = 1;
    return fullOilC;
  }

  // ==========================================================================
  // 5. ACCENT STROKES METADATA ANALYZER
  // ==========================================================================
  function analyzeAccentsClient(subjectData, maskClean, edgePixelsX, edgePixelsY, normX, normY, w, h, cw, ch, offset, cfg) {
    if (!cfg.ACCENT_STROKES_ENABLED || !edgePixelsX.length) {
      return { candidates: [], spots: [] };
    }
    const n = w * h;
    const lumMap = new Float32Array(n);
    const satMap = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const r = subjectData[p], g = subjectData[p + 1], b = subjectData[p + 2];
      lumMap[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      satMap[i] = mx > 0 ? (mx - mn) / (mx + 1e-6) : 0;
    }

    const stepE = Math.max(1, (edgePixelsX.length / 2000) | 0);
    const edgeLums = [];
    for (let i = 0; i < edgePixelsX.length; i += stepE) {
      edgeLums.push(lumMap[edgePixelsY[i] * w + edgePixelsX[i]]);
    }
    edgeLums.sort((a, b) => a - b);
    const lumMed = edgeLums.length ? edgeLums[edgeLums.length >> 1] : 128;
    const p25 = edgeLums.length ? edgeLums[(edgeLums.length * 0.25) | 0] : 80;
    const p75 = edgeLums.length ? edgeLums[(edgeLums.length * 0.75) | 0] : 160;
    const iqr = p75 - p25;
    const minJump = 50 * 0.3 + Math.max(20, iqr * 0.5) * 0.7;
    const minSpotLum = 200 * 0.3 + Math.min(240, Math.max(140, lumMed + 30)) * 0.7;

    const interest = new Float32Array(n);
    let maxInt = 1e-6;
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        if (maskClean[i] < 20) continue;
        const l = lumMap[i];
        const grad = Math.hypot(lumMap[i + 1] - lumMap[i - 1], lumMap[i + w] - lumMap[i - w]) / 255.0;
        const dk = Math.max(0, Math.min(1, (90 - l) / 90.0));
        const br = Math.max(0, Math.min(1, (l - 200) / 55.0));
        const st = Math.max(0, Math.min(1, (satMap[i] - 0.1) / 0.9));
        const val = (0.2 * grad + 1.5 * dk + 1.2 * br + 2.0 * st) * (maskClean[i] / 255.0);
        interest[i] = val;
        if (val > maxInt) maxInt = val;
      }
    }
    const smInterest = boxBlurFloat32(interest, w, h, 4);
    for (let i = 0; i < n; i++) smInterest[i] /= maxInt;

    const rng = new PythonRandom(cfg.RANDOM_SEED || 42);
    const aboveIdx = [];
    for (let i = 0; i < edgePixelsX.length; i++) {
      const idx = edgePixelsY[i] * w + edgePixelsX[i];
      if (smInterest[idx] >= 0.002) aboveIdx.push(i);
    }
    for (let i = aboveIdx.length - 1; i > 0; i--) {
      const j = Math.floor(rng.random() * (i + 1));
      const tmp = aboveIdx[i]; aboveIdx[i] = aboveIdx[j]; aboveIdx[j] = tmp;
    }

    const spacing = 50, s2 = spacing * spacing, cell = spacing / Math.SQRT2;
    const grid = new Map();
    const candidates = [];

    const sampleAreaColor = (cx, cy, rad) => {
      const x0 = Math.max(0, cx - rad), x1 = Math.min(w - 1, cx + rad);
      const y0 = Math.max(0, cy - rad), y1 = Math.min(h - 1, cy + rad);
      let sr = 0, sg = 0, sb = 0, cnt = 0;
      for (let y = y0; y <= y1; y++) {
        const rOff = y * w;
        for (let x = x0; x <= x1; x++) {
          const idx = rOff + x;
          if (maskClean[idx] > 30) {
            const p = idx * 4;
            sr += subjectData[p]; sg += subjectData[p + 1]; sb += subjectData[p + 2]; cnt++;
          }
        }
      }
      if (!cnt) return [128, 128, 128];
      return [(sr / cnt) | 0, (sg / cnt) | 0, (sb / cnt) | 0];
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
      const idx = ey * w + ex;
      const nx = normX[idx], ny = normY[idx];
      const sx = Math.max(0, Math.min(w - 1, Math.trunc(ex - nx * 10)));
      const sy = Math.max(0, Math.min(h - 1, Math.trunc(ey - ny * 10)));
      const L = lumMap[sy * w + sx];
      const col = sampleAreaColor(sx, sy, 8);
      candidates.push({
        x: sx + offset[0],
        y: sy + offset[1],
        nx: Number(nx.toFixed(4)),
        ny: Number(ny.toFixed(4)),
        interest: Number(Math.min(1, smInterest[idx]).toFixed(4)),
        is_dark: L < 90,
        is_bright: L > 200,
        color: col,
        w_bright: 0.0,
        w_op: 1.0,
      });
    }

    const spots = [];
    const spotGrid = new Map();
    for (let i = 0; i < edgePixelsX.length; i += stepE) {
      const ex = edgePixelsX[i], ey = edgePixelsY[i];
      const idx = ey * w + ex;
      const inx = -normX[idx], iny = -normY[idx];
      const edgeL = lumMap[idx];
      let best = null;
      for (let d = 4; d <= 40; d += 4) {
        const sx = Math.max(0, Math.min(w - 1, (ex + inx * d) | 0));
        const sy = Math.max(0, Math.min(h - 1, (ey + iny * d) | 0));
        const sIdx = sy * w + sx;
        if (maskClean[sIdx] < 128) continue;
        const lv = lumMap[sIdx];
        if (lv >= minSpotLum && lv - edgeL >= minJump) {
          if (!best || lv > best.lum) best = { sx, sy, lum: lv, nx: normX[idx], ny: normY[idx] };
        }
      }
      if (best) {
        const gx = (best.sx / 28) | 0, gy = (best.sy / 28) | 0;
        let close = false;
        for (let dx = -1; dx <= 1 && !close; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nb = spotGrid.get((gx + dx) * 100000 + (gy + dy));
            if (nb && (best.sx - nb[0]) ** 2 + (best.sy - nb[1]) ** 2 < 1600) { close = true; break; }
          }
        }
        if (!close && spots.length < 45) {
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

    return { candidates, spots };
  }

  // ==========================================================================
  // 6. MASTER CLIENT-SIDE PAYLOAD GENERATOR
  // ==========================================================================
  async function generate(presetKey, useEditedMask = false) {
    const t0 = performance.now();
    const timings = {};
    const { key, cfg } = await getPresetFromServerSingleSource(presetKey);

    const cw = cfg.OUTPUT_WIDTH || (key.startsWith("cars") ? 1782 : 1260);
    const ch = cfg.OUTPUT_HEIGHT || (key.startsWith("cars") ? 1260 : 1782);

    let tStep = performance.now();
    const origImg = STATE.originalImg;
    const isCar = key.startsWith("cars");
    const maxW = isCar ? 1782 : 1260;
    const maxH = isCar ? 1260 : 1782;
    let w = origImg.naturalWidth || origImg.width;
    let h = origImg.naturalHeight || origImg.height;
    if (w > maxW || h > maxH) {
      const sc = Math.min(maxW / w, maxH / h);
      w = Math.round(w * sc);
      h = Math.round(h * sc);
    }

    const origC = createCanvas(w, h);
    origC.getContext("2d").drawImage(origImg, 0, 0, w, h);

    const maskC = createCanvas(w, h);
    const mCtx = maskC.getContext("2d");
    if (useEditedMask && STATE.maskCanvas) {
      mCtx.filter = "blur(1.5px)";
      mCtx.drawImage(STATE.maskCanvas, 0, 0, w, h);
      mCtx.filter = "none";
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
    const maskClean = morphFilterUint8(rawMaskU8, w, h, trim, false);

    const cleanMaskImgData = mCtx.createImageData(w, h);
    for (let i = 0, p = 0; i < maskClean.length; i++, p += 4) {
      const v = maskClean[i];
      cleanMaskImgData.data[p] = v;
      cleanMaskImgData.data[p + 1] = v;
      cleanMaskImgData.data[p + 2] = v;
      cleanMaskImgData.data[p + 3] = 255;
    }
    mCtx.putImageData(cleanMaskImgData, 0, 0);
    const maskBlob = await canvasToBlobAndFree(maskC, "image/webp", 0.92);
    timings["1_mask_trim_sec"] = Number(((performance.now() - tStep) / 1000).toFixed(3));

    const offX = (cw - w) >> 1;
    const offY = (ch - h) >> 1;
    const offset = [offX, offY];

    tStep = performance.now();
    const correctedC = applyColorCorrectionClient(origC, w, h, cfg);
    const corrCtx = correctedC.getContext("2d");
    const corrImgData = corrCtx.getImageData(0, 0, w, h);
    const corrD = corrImgData.data;

    const origCtx = origC.getContext("2d");
    const origImgData = origCtx.getImageData(0, 0, w, h);
    const origD = origImgData.data;

    for (let i = 0, p = 3; i < maskClean.length; i++, p += 4) {
      corrD[p] = maskClean[i];
      origD[p] = maskClean[i];
    }
    corrCtx.putImageData(corrImgData, 0, 0);
    origCtx.putImageData(origImgData, 0, 0);

    const subRawFull = createCanvas(cw, ch);
    subRawFull.getContext("2d").drawImage(origC, offX, offY);
    origC.width = 1; origC.height = 1;
    const subjectRawBlob = await canvasToBlobAndFree(subRawFull, "image/webp", 0.88);

    let subCcSource = correctedC;
    if (cfg.WATERCOLOR_TEXTURE_ENABLED) {
      subCcSource = applyWatercolorTextureClient(
        correctedC,
        cfg.WATERCOLOR_TEXTURE_SIZE ?? 1.0,
        cfg.WATERCOLOR_TEXTURE_OPACITY ?? 0.6,
        cfg.WATERCOLOR_TEXTURE_CONTRAST ?? 1.2
      );
    }
    const subCcFull = createCanvas(cw, ch);
    subCcFull.getContext("2d").drawImage(subCcSource, offX, offY);
    if (subCcSource !== correctedC) { subCcSource.width = 1; subCcSource.height = 1; }
    const subjectCcBlob = await canvasToBlobAndFree(subCcFull, "image/webp", 0.88);
    timings["2_color_correction_sec"] = Number(((performance.now() - tStep) / 1000).toFixed(3));

    await new Promise((r) => requestAnimationFrame(r));

    tStep = performance.now();
    const { averageColor, dominantColor, edges, normX, normY, edgePixelsX, edgePixelsY } =
      computePaletteAndEdgesClient(corrD, maskClean, w, h, cfg);

    const paperC = buildPaperLayerClient(cw, ch, cfg);
    const bgPaperBlob = await canvasToBlobAndFree(paperC, "image/webp", 0.88);

    const blurBgC = buildBlurBgLayerClient(correctedC, cw, ch, cfg);
    const blurBgBlob = blurBgC ? await canvasToBlobAndFree(blurBgC, "image/webp", 0.86) : null;

    const shadowC = buildShadowLayerClient(edgePixelsX, edgePixelsY, normX, normY, w, cw, ch, offset, cfg);
    const shadowBlob = shadowC ? await canvasToBlobAndFree(shadowC, "image/webp", 0.86) : null;

    const colordropC = buildColordropLayerClient(edgePixelsX, edgePixelsY, normX, normY, w, cw, ch, offset, cfg);
    const colordropBlob = colordropC ? await canvasToBlobAndFree(colordropC, "image/webp", 0.86) : null;
    timings["3_edges_and_effects_sec"] = Number(((performance.now() - tStep) / 1000).toFixed(3));

    await new Promise((r) => requestAnimationFrame(r));

    tStep = performance.now();
    const oilFullC = buildOilPaintLayerClient(correctedC, maskClean, w, h, cw, ch, offset, cfg);
    correctedC.width = 1; correctedC.height = 1;
    const oilBlob = oilFullC ? await canvasToBlobAndFree(oilFullC, "image/webp", 0.88) : null;

    const accentMeta = analyzeAccentsClient(
      corrD, maskClean, edgePixelsX, edgePixelsY, normX, normY, w, h, cw, ch, offset, cfg
    );
    timings["4_oil_and_accents_sec"] = Number(((performance.now() - tStep) / 1000).toFixed(3));

    const elapsedSec = Number(((performance.now() - t0) / 1000).toFixed(2));
    timings["total_client_sec"] = elapsedSec;

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
      maskBlob,
      layerBlobs: {
        bg_paper: bgPaperBlob,
        subject_raw: subjectRawBlob,
        subject_cc: subjectCcBlob,
        blur_bg: blurBgBlob,
        oil_paint_full: oilBlob,
        shadow: shadowBlob,
        colordrop: colordropBlob,
      },
      stroke_data: {
        edges,
        accent_candidates: accentMeta.candidates,
        accent_spots: accentMeta.spots,
      },
    };
    rebuildEdgeSpatialIndex(payload.stroke_data);
    return payload;
  }

  window.ClientWatercolorEngine = { generate };
})();