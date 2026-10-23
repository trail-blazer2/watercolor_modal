/**
 * 🎨 Watercolor Studio — Part 4/5: 60 FPS Scheduler, Fast Subject-Move Compositor & Procedural Layers
 */

// ============================================================================
// 6B. UNIFIED SINGLE-PASS 60 FPS SCHEDULER
// ============================================================================
const _pendingRerender = new Set();
let _pendingOil = false;
let _pendingEdgeCurve = false;
let _pendingGlow = false;
let _pendingComposite = false;
let _rafId = 0;

function cancelPendingSchedules() {
  _pendingRerender.clear();
  _pendingOil = false;
  _pendingEdgeCurve = false;
  _pendingGlow = false;
  _pendingComposite = false;
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = 0;
  }
}

function _ensureRaf() {
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = 0;
    let needsComp = _pendingComposite;
    _pendingComposite = false;

    if (_pendingRerender.size > 0) {
      for (const id of _pendingRerender) {
        rerenderProceduralLayer(id, true);
      }
      _pendingRerender.clear();
      invalidateMoveFastStack();
      needsComp = true;
    }
    if (_pendingEdgeCurve) {
      _pendingEdgeCurve = false;
      if (STATE.layers.edge_curve) {
        if (!STATE.layers.edge_curve.baseCanvas) {
          const [bw, bh] = STATE.payload.canvas_size;
          STATE.layers.edge_curve.baseCanvas = createCanvas(bw, bh);
        }
        rerenderLiveEdgeCurveLayer(true);
        if (typeof freeEdgeCurveCpuUploadBuffers === "function") freeEdgeCurveCpuUploadBuffers();
      }
      invalidateMoveFastStack();
      needsComp = true;
    }
    if (_pendingOil) {
      _pendingOil = false;
      rerenderLiveOilLayer(true);
      invalidateMoveFastStack();
      needsComp = true;
    }
    if (_pendingGlow) {
      _pendingGlow = false;
      rerenderLiveGlowLayer(true);
      invalidateMoveFastStack();
      needsComp = true;
    }
    if (needsComp) {
      compositeAllLayers();
    }
  });
}

function scheduleGlowRerender() {
  scheduleRerender("glow");
}

function scheduleRerender(layerId) {
  const lyr = STATE.layers && STATE.layers[layerId];
  if (lyr) lyr.strokesDirty = true;
  _pendingRerender.add(layerId);
  _ensureRaf();
}
function scheduleEdgeCurveRerender() {
  _pendingEdgeCurve = true;
  _ensureRaf();
}
function scheduleOilRerender() {
  _pendingOil = true;
  _ensureRaf();
}
function scheduleComposite() {
  invalidateMoveFastStack();
  _pendingComposite = true;
  _ensureRaf();
}

function isCarPresetActive() {
  const key =
    (STATE.payload && STATE.payload.preset_key) ||
    (document.getElementById("presetSelect") && document.getElementById("presetSelect").value) ||
    "";
  return key.startsWith("cars");
}

function ensureSubjectParams(p) {
  const cfg = (STATE.payload && STATE.payload.preset_settings) || {};
  const isCar = isCarPresetActive();
  if (p.ccBlend === undefined) p.ccBlend = 100;
  if (isCar) {
    p.bottomFade = 0;
  } else if (p.bottomFade === undefined || Number.isNaN(p.bottomFade)) {
    p.bottomFade = 100;
  }
  if (p.wcTexture === undefined) p.wcTexture = !!cfg.WATERCOLOR_TEXTURE_ENABLED;
  if (p.underWindowEnabled === undefined) p.underWindowEnabled = false;
  if (p.underWindowColor === undefined) p.underWindowColor = cfg.DARK_BACKGROUND_ENABLED ? "black" : "white";
  if (p.underWindowOpacity === undefined || Number.isNaN(p.underWindowOpacity)) p.underWindowOpacity = 85;
  return p;
}

function ensureGlowParams(p) {
  const cfg = (STATE.payload && STATE.payload.preset_settings) || {};
  const defW = cfg.GLOW_WIDTH ?? 7;
  const defB = cfg.GLOW_BLUR ?? 12;
  const defCol = cfg.GLOW_COLOR || [255, 255, 255];
  const defHex = rgbToHex(defCol[0], defCol[1], defCol[2]);
  if (p.defaultSize === undefined) p.defaultSize = defW;
  if (p.defaultBlur === undefined) p.defaultBlur = defB;
  if (p.size === undefined || Number.isNaN(p.size)) p.size = defW;
  if (p.defaultColorHex === undefined) p.defaultColorHex = defHex;
  if (p.glowColor === undefined) p.glowColor = defHex;
  if (p.colorMode === undefined) p.colorMode = false;
  return p;
}

function buildInitialLayerParams(def, cfg) {
  const p = def.prefix;
  if (
    def.type === "brush_edge" ||
    def.type === "brush_dots" ||
    def.type === "brush_ellipse" ||
    def.type === "brush_ellipse_dark"
  ) {
    return {
      opacity: cfg[`${p}_OPACITY`] ?? 0.6,
      baseOpacity: cfg[`${p}_OPACITY`] ?? 0.6,
      size: cfg[`${p}_SIZE`] ?? 600,
      spacing: cfg[`${p}_SPACING`] ?? 200,
      jiggle: cfg[`${p}_JIGGLE`] ?? cfg.BRUSH_DIRECTION_JIGGLE ?? 0.6,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      brushFile: cfg[`${p}_FILE`] || defaultBrushForLayer(def.id, cfg),
    };
  }
  if (def.type === "mask_blur") {
    return {
      opacity: cfg.MASK_BRUSH_OPACITY ?? 0.5,
      baseOpacity: cfg.MASK_BRUSH_OPACITY ?? 0.5,
      size: cfg.MASK_BRUSH_SIZE ?? 900,
      spacing: cfg.MASK_BRUSH_SPACING ?? 200,
      jiggle: cfg.BRUSH_DIRECTION_JIGGLE ?? 0.8,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      brushFile:
        cfg.MASK_BRUSH_FILE && cfg.MASK_BRUSH_FILE !== "square.png"
          ? cfg.MASK_BRUSH_FILE
          : "brush2.png",
    };
  }
  if (def.type === "accent") {
    return {
      opacity: 1.0,
      baseOpacity: 1.0,
      size: 300,
      spacing: 50,
      jiggle: 0.8,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      brushFile: "bgbrush.png",
    };
  }
  if (def.id === "edge_curve") {
    return {
      opacity: cfg.EDGE_CURVE_ENABLED ? (cfg.EDGE_CURVE_OPACITY ?? 0.75) : 0.75,
      baseOpacity: 1.0,
      maskDetail: 85,
      edgeThickness: 0,
      brightness: 100,
      contrast: 105,
      saturation: 105,
    };
  }
  if (def.type === "oil") {
    return {
      opacity: cfg.OIL_PAINT_OPACITY ?? 0.65,
      baseOpacity: 1.0,
      thickness: 0,
      detailPop: 0,
      brightness: 100,
      contrast: 100,
      saturation: 100,
    };
  }
  if (def.type === "subject") {
    return ensureSubjectParams({
      opacity: 1.0,
      baseOpacity: 1.0,
      bottomFade: 100,
      brightness: 100,
      contrast: 100,
      saturation: 100,
    });
  }
  if (def.type === "glow") {
    return ensureGlowParams({
      opacity: cfg.GLOW_OPACITY ?? 0.4,
      baseOpacity: cfg.GLOW_OPACITY ?? 0.4,
      brightness: 100,
      contrast: 100,
      saturation: 100,
    });
  }
  return {
    opacity: 1.0,
    baseOpacity: 1.0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
  };
}

function defaultBrushForLayer(id, cfg) {
  const map = {
    bg_brush: "bgbrush.png", sharp_brush: "sharpbrush.png", color_brush: "brush2.png",
    white_dots: "whitedots.png", dark_dots: "darkdots.png", small_dots: "whitedots.png",
    dark_ellipse: "bgbrush.png",
    white_ellipse: cfg.ELLIPSE_BRUSH_MODE === "dark" ? (cfg.ELLIPSE_BRUSH_FILE || "square.png") : "whitebrush.png",
    outer_white: cfg.ELLIPSE_BRUSH_MODE === "dark" ? (cfg.ELLIPSE_BRUSH_FILE || "square.png") : "whitebrush.png",
  };
  return map[id] || "bgbrush.png";
}

// ============================================================================
// 7. REAL-TIME COMPOSITOR + FAST SUBJECT-MOVE GROUP CACHE (_moveFastStack)
// ============================================================================
const _tempLayerCanvas = document.createElement("canvas");
const _stack = { id: null, dirty: true, below: null, above: null };
const _moveFastStack = {
  dirty: true,
  movableUnder: null,  // Layers 17..8 in Overscan Space
  subjectGroup: null,  // Layers 7..5 (subject, oil_paint, edge_curve) un-faded in Overscan Space
  fixedOvals: null,    // Layers 4..2 (dark_ellipse, white_ellipse, outer_white) in Viewport Space
  movableOver: null,   // Layers 1..0 (small_dots, custom_detail) in Overscan Space
};

function invalidateStack() { _stack.dirty = true; }
function invalidateMoveFastStack() { _moveFastStack.dirty = true; }

function releaseMoveFastStack() {
  _moveFastStack.dirty = true;
  for (const k of ["movableUnder", "subjectGroup", "fixedOvals", "movableOver"]) {
    if (_moveFastStack[k]) {
      _moveFastStack[k].width = 1;
      _moveFastStack[k].height = 1;
      _moveFastStack[k] = null;
    }
  }
}

const FIXED_CANVAS_LAYERS = new Set(["outer_white", "white_ellipse", "dark_ellipse", "bg_paper"]);

function isSubjectMovableLayer(layerId) {
  return !FIXED_CANVAS_LAYERS.has(layerId);
}

function getBaseSubjectCenter() {
  if (!STATE.payload) return { cx: 870, cy: 1131 };
  const [offX, offY] = STATE.payload.offset || [0, 0];
  const [subW, subH] = STATE.payload.subject_size || [1260, 1782];
  return { cx: offX + subW * 0.5, cy: offY + subH * 0.5 };
}

function drawBackdropWindowIfEnabled(ctx) {
  const subLyr = STATE.layers && STATE.layers.subject;
  if (!subLyr || !subLyr.vis) return;
  const p = subLyr.params;
  if (!p.underWindowEnabled || p.underWindowOpacity <= 0) return;

  const vr = STATE.viewRect || { x: 0, y: 0, w: displayCanvas.width, h: displayCanvas.height };
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, p.underWindowOpacity / 100));
  ctx.fillStyle = p.underWindowColor === "black" ? "#000000" : "#ffffff";
  ctx.fillRect(0, 0, vr.w, vr.h);
  ctx.restore();
}

function applyBottomQuarterFade(tCtx, w, h, fadePercent) {
  const strength = Math.max(0, Math.min(1, (fadePercent ?? 0) / 100));
  if (strength <= 0.001 || w <= 0 || h <= 0) return;

  const rInner = 0.50;
  const rOuter = 0.75;

  tCtx.save();
  tCtx.globalCompositeOperation = "destination-out";
  tCtx.beginPath();
  tCtx.rect(0, Math.floor(h * 0.50), w, Math.ceil(h * 0.50));
  tCtx.clip();

  tCtx.translate(w * 0.5, h * 0.25);
  tCtx.scale(w * 1.32, h);

  const grad = tCtx.createRadialGradient(0, 0, rInner, 0, 0, rOuter);
  grad.addColorStop(0, "rgba(0, 0, 0, 0)");
  grad.addColorStop(0.5, `rgba(0, 0, 0, ${(strength * 0.45).toFixed(3)})`);
  grad.addColorStop(1, `rgba(0, 0, 0, ${strength})`);

  tCtx.fillStyle = grad;
  tCtx.fillRect(-1.5, 0, 3.0, 1.5);
  tCtx.restore();
}

function ensureLayerCanvasRendered(lyr) {
  const def = lyr.def;
  if (["brush_edge", "brush_dots", "brush_ellipse", "brush_ellipse_dark", "mask_blur", "accent"].includes(def.type)) {
    if (!lyr.baseCanvas || lyr.strokesDirty) {
      rerenderProceduralLayer(def.id, true);
    }
  } else if (def.id === "edge_curve" && !lyr.baseCanvas) {
    const [bw, bh] = STATE.payload.canvas_size;
    lyr.baseCanvas = createCanvas(bw, bh);
    if (typeof ensureServerRasterLayerDecoded === "function" && (!STATE.serverImages || !STATE.serverImages.edge_curve)) {
      ensureServerRasterLayerDecoded("edge_curve").then(() => {
        rerenderLiveEdgeCurveLayer(false);
        if (typeof freeEdgeCurveCpuUploadBuffers === "function") freeEdgeCurveCpuUploadBuffers();
      });
      return;
    }
    rerenderLiveEdgeCurveLayer(true);
    if (typeof freeEdgeCurveCpuUploadBuffers === "function") freeEdgeCurveCpuUploadBuffers();
  } else if (def.id === "oil_paint" && !lyr.baseCanvas) {
    rerenderLiveOilLayer(true);
  } else if (def.id === "glow" && !lyr.baseCanvas) {
    rerenderLiveGlowLayer(true);
  }
}

function applyOverscanToViewportTransform(targetCtx, vr, movable) {
  if (!movable) {
    targetCtx.translate(-vr.x, -vr.y);
    return;
  }
  const st = STATE.subjectTransform || { dx: 0, dy: 0, scale: 1.0 };
  const { cx, cy } = getBaseSubjectCenter();
  targetCtx.translate(cx - vr.x + st.dx, cy - vr.y + st.dy);
  if (st.scale !== 1.0) targetCtx.scale(st.scale, st.scale);
  targetCtx.translate(-cx, -cy);
}

function drawPaperLayerInViewport(targetCtx, vr) {
  const paperLyr = STATE.layers && STATE.layers.bg_paper;
  if (!paperLyr || !paperLyr.vis) return;
  const paperImg = STATE.serverImages.bg_paper;
  if (!paperImg) return;

  const [baseW, baseH] = STATE.payload.base_canvas_size || [paperImg.width, paperImg.height];
  const [padX, padY] = STATE.payload.pad || [0, 0];
  const p = paperLyr.params;
  const hasFilter = p.brightness !== 100 || p.contrast !== 100 || p.saturation !== 100;

  targetCtx.save();
  targetCtx.globalAlpha = Math.min(1, p.opacity ?? 1.0);
  if (hasFilter) {
    targetCtx.filter = `brightness(${p.brightness}%) contrast(${p.contrast}%) saturate(${p.saturation}%)`;
  }

  for (let ty = -1; ty <= 1; ty++) {
    for (let tx = -1; tx <= 1; tx++) {
      const dx = padX - vr.x + tx * baseW;
      const dy = padY - vr.y + ty * baseH;
      if (dx + baseW <= 0 || dx >= vr.w || dy + baseH <= 0 || dy >= vr.h) continue;
      targetCtx.save();
      targetCtx.translate(dx + (tx !== 0 ? baseW : 0), dy + (ty !== 0 ? baseH : 0));
      targetCtx.scale(tx !== 0 ? -1 : 1, ty !== 0 ? -1 : 1);
      targetCtx.drawImage(paperImg, 0, 0, baseW, baseH);
      targetCtx.restore();
    }
  }
  targetCtx.restore();
}

function drawLayerSourceInViewport(targetCtx, lyr, def, vr) {
  if (def.id === "bg_paper") {
    drawPaperLayerInViewport(targetCtx, vr);
    return;
  }

  const movable = isSubjectMovableLayer(def.id);

  if (def.id === "subject") {
    const p = lyr.params;
    const subMain =
      p.wcTexture && STATE.serverImages.subject_tex
        ? STATE.serverImages.subject_tex
        : STATE.serverImages.subject_cc;

    targetCtx.save();
    applyOverscanToViewportTransform(targetCtx, vr, true);
    if (p.ccBlend < 100 && STATE.serverImages.subject_raw) {
      targetCtx.drawImage(STATE.serverImages.subject_raw, 0, 0);
      if (subMain) {
        targetCtx.globalAlpha = p.ccBlend / 100;
        targetCtx.drawImage(subMain, 0, 0);
      }
    } else if (subMain) {
      targetCtx.drawImage(subMain, 0, 0);
    }
    targetCtx.restore();
    return;
  }

  const src = lyr.baseCanvas || lyr.origImage;
  if (src) {
    targetCtx.save();
    applyOverscanToViewportTransform(targetCtx, vr, movable);
    targetCtx.drawImage(src, 0, 0);
    targetCtx.restore();
  }
}

function drawLayerInto(ctx, def) {
  if (!def) return;
  const lyr = STATE.layers[def.id];
  if (!lyr || !lyr.vis) return;
  const p = lyr.params;
  const op = p.baseOpacity > 0 ? Math.min(2.5, p.opacity / p.baseOpacity) : p.opacity;
  if (op <= 0.001) return;

  ensureLayerCanvasRendered(lyr);

  const vr = STATE.viewRect || { x: 0, y: 0, w: displayCanvas.width, h: displayCanvas.height };
  const isSubject = def.id === "subject";
  const isSubjectOverlay = def.id === "oil_paint" || def.id === "edge_curve";
  const subParams = STATE.layers.subject ? ensureSubjectParams(STATE.layers.subject.params) : null;
  const isCar = isCarPresetActive();
  const bottomFadePct = isCar
    ? 0
    : isSubject
    ? (ensureSubjectParams(p).bottomFade ?? 100)
    : isSubjectOverlay && subParams
    ? (subParams.bottomFade ?? 100)
    : 0;

  const hasFilter = p.brightness !== 100 || p.contrast !== 100 || p.saturation !== 100;
  const hasSubjectBlend = isSubject && p.ccBlend < 100 && STATE.serverImages.subject_raw;
  const hasPaintOrErase = !!(lyr.paintCanvas || lyr.eraseCanvas);
  const hasBottomFade = bottomFadePct > 0.05;
  const movable = isSubjectMovableLayer(def.id);

  if (!hasFilter && !hasSubjectBlend && !hasPaintOrErase && !hasBottomFade) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, op);
    drawLayerSourceInViewport(ctx, lyr, def, vr);
    if (op > 1) {
      ctx.globalAlpha = Math.min(1, op - 1);
      drawLayerSourceInViewport(ctx, lyr, def, vr);
    }
    ctx.restore();
    return;
  }

  if (_tempLayerCanvas.width !== vr.w || _tempLayerCanvas.height !== vr.h) {
    _tempLayerCanvas.width = vr.w;
    _tempLayerCanvas.height = vr.h;
  }
  const t = _tempLayerCanvas.getContext("2d");
  t.clearRect(0, 0, vr.w, vr.h);
  t.filter = hasFilter ? `brightness(${p.brightness}%) contrast(${p.contrast}%) saturate(${p.saturation}%)` : "none";
  drawLayerSourceInViewport(t, lyr, def, vr);
  t.filter = "none";

  if (lyr.paintCanvas) {
    t.save();
    applyOverscanToViewportTransform(t, vr, movable);
    t.drawImage(lyr.paintCanvas, 0, 0);
    t.restore();
  }
  if (lyr.eraseCanvas) {
    t.save();
    t.globalCompositeOperation = "destination-out";
    applyOverscanToViewportTransform(t, vr, movable);
    t.drawImage(lyr.eraseCanvas, 0, 0);
    t.restore();
  }

  if (hasBottomFade) {
    applyBottomQuarterFade(t, vr.w, vr.h, bottomFadePct);
  }

  ctx.save();
  ctx.globalAlpha = Math.min(1, op);
  ctx.drawImage(_tempLayerCanvas, 0, 0);
  if (op > 1) {
    ctx.globalAlpha = Math.min(1, op - 1);
    ctx.drawImage(_tempLayerCanvas, 0, 0);
  }
  ctx.restore();
}

// Draws a single layer directly in Overscan Space (0..overW, 0..overH) without subjectTransform or bottomFade
// Used once when building _moveFastStack so moving/scaling the subject is a 4-blit 60 FPS operation!
function drawLayerInOverscanSpaceUntransformed(targetCtx, def) {
  const lyr = STATE.layers[def.id];
  if (!lyr || !lyr.vis) return;
  const p = lyr.params;
  const op = p.baseOpacity > 0 ? Math.min(2.5, p.opacity / p.baseOpacity) : p.opacity;
  if (op <= 0.001) return;

  ensureLayerCanvasRendered(lyr);

  const [overW, overH] = STATE.payload.canvas_size;
  const isSubject = def.id === "subject";
  const hasFilter = p.brightness !== 100 || p.contrast !== 100 || p.saturation !== 100;
  const hasSubjectBlend = isSubject && p.ccBlend < 100 && STATE.serverImages.subject_raw;
  const hasPaintOrErase = !!(lyr.paintCanvas || lyr.eraseCanvas);

  const subMain =
    isSubject && p.wcTexture && STATE.serverImages.subject_tex
      ? STATE.serverImages.subject_tex
      : isSubject
      ? STATE.serverImages.subject_cc
      : lyr.baseCanvas || lyr.origImage;
  if (!subMain) return;

  if (!hasFilter && !hasSubjectBlend && !hasPaintOrErase) {
    targetCtx.save();
    targetCtx.globalAlpha = Math.min(1, op);
    targetCtx.drawImage(subMain, 0, 0);
    if (op > 1) {
      targetCtx.globalAlpha = Math.min(1, op - 1);
      targetCtx.drawImage(subMain, 0, 0);
    }
    targetCtx.restore();
    return;
  }

  const tmp = createCanvas(overW, overH);
  const t = tmp.getContext("2d");
  t.filter = hasFilter ? `brightness(${p.brightness}%) contrast(${p.contrast}%) saturate(${p.saturation}%)` : "none";
  if (hasSubjectBlend) {
    t.drawImage(STATE.serverImages.subject_raw, 0, 0);
    t.globalAlpha = p.ccBlend / 100;
    t.drawImage(subMain, 0, 0);
    t.globalAlpha = 1;
  } else {
    t.drawImage(subMain, 0, 0);
  }
  t.filter = "none";
  if (lyr.paintCanvas) t.drawImage(lyr.paintCanvas, 0, 0);
  if (lyr.eraseCanvas) {
    t.globalCompositeOperation = "destination-out";
    t.drawImage(lyr.eraseCanvas, 0, 0);
    t.globalCompositeOperation = "source-over";
  }

  targetCtx.save();
  targetCtx.globalAlpha = Math.min(1, op);
  targetCtx.drawImage(tmp, 0, 0);
  if (op > 1) {
    targetCtx.globalAlpha = Math.min(1, op - 1);
    targetCtx.drawImage(tmp, 0, 0);
  }
  targetCtx.restore();
}

function ensureMoveFastStackReady() {
  if (!_moveFastStack.dirty && _moveFastStack.movableUnder) return;
  const [overW, overH] = STATE.payload.canvas_size;
  const vr = STATE.viewRect || { x: 0, y: 0, w: displayCanvas.width, h: displayCanvas.height };

  if (!_moveFastStack.movableUnder || _moveFastStack.movableUnder.width !== overW || _moveFastStack.movableUnder.height !== overH) {
    _moveFastStack.movableUnder = createCanvas(overW, overH);
    _moveFastStack.subjectGroup = createCanvas(overW, overH);
    _moveFastStack.movableOver = createCanvas(overW, overH);
  }
  if (!_moveFastStack.fixedOvals || _moveFastStack.fixedOvals.width !== vr.w || _moveFastStack.fixedOvals.height !== vr.h) {
    _moveFastStack.fixedOvals = createCanvas(vr.w, vr.h);
  }

  const uCtx = _moveFastStack.movableUnder.getContext("2d");
  const sCtx = _moveFastStack.subjectGroup.getContext("2d");
  const fCtx = _moveFastStack.fixedOvals.getContext("2d");
  const oCtx = _moveFastStack.movableOver.getContext("2d");

  uCtx.clearRect(0, 0, overW, overH);
  sCtx.clearRect(0, 0, overW, overH);
  fCtx.clearRect(0, 0, vr.w, vr.h);
  oCtx.clearRect(0, 0, overW, overH);

  // 1. Movable Under Subject (indices 17..8: bg_brush .. shadow)
  for (let i = 17; i >= 8; i--) {
    drawLayerInOverscanSpaceUntransformed(uCtx, LAYER_DEFINITIONS[i]);
  }
  // 2. Subject + Oil + EdgeCurve un-faded (indices 7..5)
  for (let i = 7; i >= 5; i--) {
    drawLayerInOverscanSpaceUntransformed(sCtx, LAYER_DEFINITIONS[i]);
  }
  // 3. Fixed Ovals in Viewport Space (indices 4..2: dark_ellipse, white_ellipse, outer_white)
  for (let i = 4; i >= 2; i--) {
    drawLayerInto(fCtx, LAYER_DEFINITIONS[i]);
  }
  // 4. Movable Over Ovals (indices 1..0: small_dots, custom_detail)
  for (let i = 1; i >= 0; i--) {
    drawLayerInOverscanSpaceUntransformed(oCtx, LAYER_DEFINITIONS[i]);
  }

  _moveFastStack.dirty = false;
}

// Ultra-fast 4-blit compositor used when moving/scaling the subject (0.3 ms/frame on mobile & desktop)
function compositeFastSubjectMove() {
  ensureMoveFastStackReady();
  const vr = STATE.viewRect || { x: 0, y: 0, w: displayCanvas.width, h: displayCanvas.height };
  displayCtx.clearRect(0, 0, vr.w, vr.h);

  // 1. Fixed Paper Base
  drawPaperLayerInViewport(displayCtx, vr);

  // 2. Movable Under-Subject Brushes + Glow + Drops + Shadow
  displayCtx.save();
  applyOverscanToViewportTransform(displayCtx, vr, true);
  displayCtx.drawImage(_moveFastStack.movableUnder, 0, 0);
  displayCtx.restore();

  // 3. Optional Backdrop Window
  drawBackdropWindowIfEnabled(displayCtx);

  // 4. Movable Subject + Oil + EdgeCurve with Fixed Canvas Oval Bottom 25% Fade
  const isCar = isCarPresetActive();
  const subParams = STATE.layers.subject ? ensureSubjectParams(STATE.layers.subject.params) : null;
  
  const bottomFadePct = isCar ? 0 : (subParams ? (subParams.bottomFade ?? 100) : 0);

  if (bottomFadePct > 0.05) {
    if (_tempLayerCanvas.width !== vr.w || _tempLayerCanvas.height !== vr.h) {
      _tempLayerCanvas.width = vr.w;
      _tempLayerCanvas.height = vr.h;
    }
    const t = _tempLayerCanvas.getContext("2d");
    t.clearRect(0, 0, vr.w, vr.h);
    t.save();
    applyOverscanToViewportTransform(t, vr, true);
    t.drawImage(_moveFastStack.subjectGroup, 0, 0);
    t.restore();
    applyBottomQuarterFade(t, vr.w, vr.h, bottomFadePct);
    displayCtx.drawImage(_tempLayerCanvas, 0, 0);
  } else {
    displayCtx.save();
    applyOverscanToViewportTransform(displayCtx, vr, true);
    displayCtx.drawImage(_moveFastStack.subjectGroup, 0, 0);
    displayCtx.restore();
  }

  // 5. Fixed Frame Ovals
  displayCtx.drawImage(_moveFastStack.fixedOvals, 0, 0);

  // 6. Movable Over-Oval Details (small_dots + custom_detail)
  displayCtx.save();
  applyOverscanToViewportTransform(displayCtx, vr, true);
  displayCtx.drawImage(_moveFastStack.movableOver, 0, 0);
  displayCtx.restore();
}

function rebuildStack(selId) {
  const vr = STATE.viewRect || { x: 0, y: 0, w: displayCanvas.width, h: displayCanvas.height };

  if (!_stack.below) _stack.below = createCanvas(vr.w, vr.h);
  if (!_stack.above) _stack.above = createCanvas(vr.w, vr.h);

  if (_stack.below.width !== vr.w || _stack.below.height !== vr.h) {
    _stack.below.width = vr.w;
    _stack.below.height = vr.h;
  }
  if (_stack.above.width !== vr.w || _stack.above.height !== vr.h) {
    _stack.above.width = vr.w;
    _stack.above.height = vr.h;
  }

  const bCtx = _stack.below.getContext("2d");
  const aCtx = _stack.above.getContext("2d");

  bCtx.clearRect(0, 0, vr.w, vr.h);
  aCtx.clearRect(0, 0, vr.w, vr.h);

  const selIdx = LAYER_DEFINITIONS.findIndex((d) => d.id === selId);
  for (let i = LAYER_DEFINITIONS.length - 1; i >= 0; i--) {
    const def = LAYER_DEFINITIONS[i];
    if (def.id === "colordrop") {
      drawBackdropWindowIfEnabled(i >= selIdx ? bCtx : aCtx);
    }
    if (i === selIdx) continue;
    drawLayerInto(i > selIdx ? bCtx : aCtx, def);
  }

  _stack.id = selId;
  _stack.dirty = false;
}

function compositeAllLayers() {
  if (!STATE.payload) return;
  if (STATE.activeTool === "mask" && STATE.originalImg && STATE.maskCanvas) {
    renderMaskEditorView();
    return;
  }
  if (STATE.activeTool === "move_subject") {
    compositeFastSubjectMove();
    return;
  }
  const vr = STATE.viewRect || { x: 0, y: 0, w: displayCanvas.width, h: displayCanvas.height };
  const sel = STATE.selectedLayerId;
  if (_stack.dirty || _stack.id !== sel) rebuildStack(sel);

  displayCtx.clearRect(0, 0, vr.w, vr.h);
  displayCtx.drawImage(_stack.below, 0, 0);
  drawLayerInto(displayCtx, LAYER_DEFINITIONS.find((d) => d.id === sel));
  displayCtx.drawImage(_stack.above, 0, 0);
}

// Fast O(1) Spatial Grid for Edge Sampling with fixed integer offset so overscan edges never shift grid buckets
const _sampleCache = new Map();
let _gridBuf = new Int32Array(0);

function sampleEdgePointsJS(edges, spacing) {
  if (!edges || edges.length === 0) return [];
  if (_sampleCache.has(spacing)) return _sampleCache.get(spacing);

  const sd = STATE.payload && STATE.payload.stroke_data;
  const edgesX = sd && sd.edgesX;
  const edgesY = sd && sd.edgesY;
  const n = edges.length;
  const s2 = spacing * spacing;
  const cell = spacing / Math.SQRT2;
  const invCell = 1.0 / cell;

  const FIXED_OFF = 256;
  const gW = 1024;
  const gH = 1024;
  const gLen = gW * gH;
  if (_gridBuf.length < gLen) {
    _gridBuf = new Int32Array(gLen);
  }
  _gridBuf.fill(-1, 0, gLen);

  const out = [];
  for (let i = 0; i < n; i++) {
    const px = edgesX ? edgesX[i] : edges[i][0];
    const py = edgesY ? edgesY[i] : edges[i][1];
    const gx = Math.max(2, Math.min(gW - 3, ((px * invCell) | 0) + FIXED_OFF));
    const gy = Math.max(2, Math.min(gH - 3, ((py * invCell) | 0) + FIXED_OFF));
    const centerIdx = gy * gW + gx;

    const cNb = _gridBuf[centerIdx];
    if (cNb >= 0) {
      const ex = px - (edgesX ? edgesX[cNb] : edges[cNb][0]);
      const ey = py - (edgesY ? edgesY[cNb] : edges[cNb][1]);
      if (ex * ex + ey * ey < s2) continue;
    }

    let close = false;
    for (let dx = -2; dx <= 2 && !close; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nb = _gridBuf[(gy + dy) * gW + (gx + dx)];
        if (nb >= 0) {
          const ex = px - (edgesX ? edgesX[nb] : edges[nb][0]);
          const ey = py - (edgesY ? edgesY[nb] : edges[nb][1]);
          if (ex * ex + ey * ey < s2) { close = true; break; }
        }
      }
    }
    if (!close) {
      out.push(edges[i]);
      _gridBuf[centerIdx] = i;
    }
  }
  _sampleCache.set(spacing, out);
  return out;
}

function getOrBuildOilDetailCache() {
  if (STATE.oilDetailCache) return STATE.oilDetailCache;
  if (!STATE.serverImages || !STATE.serverImages.oil_paint_full) return null;
  const [cw, ch] = STATE.payload.canvas_size;
  const [bx, by, bw, bh] = STATE.payload.full_subject_box || [
    Math.max(0, STATE.payload.offset[0]),
    Math.max(0, STATE.payload.offset[1]),
    STATE.payload.subject_size[0],
    STATE.payload.subject_size[1],
  ];
  if (bw <= 0 || bh <= 0) return null;

  const oilCrop = createCanvas(bw, bh);
  const oCtx = oilCrop.getContext("2d");
  oCtx.drawImage(STATE.serverImages.oil_paint_full, bx, by, bw, bh, 0, 0, bw, bh);

  if (STATE.serverImages.subject_cc) {
    const oilImg = oCtx.getImageData(0, 0, bw, bh);
    const oData = oilImg.data;
    const subC = createCanvas(bw, bh);
    subC.getContext("2d").drawImage(STATE.serverImages.subject_cc, bx, by, bw, bh, 0, 0, bw, bh);
    const sData = subC.getContext("2d").getImageData(0, 0, bw, bh).data;

    const n = bw * bh;
    const outerSil = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      outerSil[i] = oData[i * 4 + 3] < 245 ? 1.0 : 0.0;
    }
    let silBlur = boxBlurFloat32(outerSil, bw, bh, 5);
    silBlur = boxBlurFloat32(silBlur, bw, bh, 5);

    for (let i = 0; i < n; i++) {
      const p = i * 4;
      if (oData[p + 3] === 0) continue;
      const keepOil = Math.max(0, Math.min(1, (0.18 - silBlur[i]) / 0.16));
      if (keepOil < 0.999) {
        const inv = 1 - keepOil;
        oData[p] = Math.round(sData[p] * inv + oData[p] * keepOil);
        oData[p + 1] = Math.round(sData[p + 1] * inv + oData[p + 1] * keepOil);
        oData[p + 2] = Math.round(sData[p + 2] * inv + oData[p + 2] * keepOil);
      }
    }
    oCtx.putImageData(oilImg, 0, 0);
  }

  const popCanvas = createCanvas(bw, bh);
  const pCtx = popCanvas.getContext("2d");
  pCtx.filter = "contrast(165%) saturate(80%)";
  pCtx.drawImage(oilCrop, 0, 0);
  pCtx.filter = "none";

  STATE.oilDetailCache = { bx, by, bw, bh, oilCrop, popCanvas };
  // Release the redundant 21.5 MB full-size oil_paint_full canvas now that oilCrop & popCanvas are cached
  if (STATE.serverImages && STATE.serverImages.oil_paint_full) {
    if (STATE.serverImages.oil_paint_full.tagName === "CANVAS") {
      STATE.serverImages.oil_paint_full.width = 1;
      STATE.serverImages.oil_paint_full.height = 1;
    }
    STATE.serverImages.oil_paint_full = null;
  }

  STATE.oilDetailCache = { bx, by, bw, bh, oilCrop, popCanvas };
  return STATE.oilDetailCache;
}

function rerenderLiveOilLayer(skipComposite = false) {
  const lyr = STATE.layers.oil_paint;
  if (!lyr || (!STATE.serverImages.oil_paint_full && !STATE.oilDetailCache)) return;
  const [w, h] = STATE.payload.canvas_size;
  if (!lyr.baseCanvas) lyr.baseCanvas = createCanvas(w, h);

  const p = lyr.params;
  const ctx = lyr.baseCanvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const cache = getOrBuildOilDetailCache();
  if (!cache) {
    ctx.drawImage(STATE.serverImages.oil_paint_full, 0, 0);
  } else {
    const { bx, by, oilCrop, popCanvas } = cache;
    ctx.drawImage(oilCrop, bx, by);

    if (p.thickness > 0) {
      const blurPx = (p.thickness / 100) * 3.5;
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.filter = `blur(${blurPx.toFixed(1)}px) contrast(${100 + p.thickness * 0.25}%)`;
      ctx.drawImage(oilCrop, bx, by);
      ctx.restore();
    } else if (p.thickness < 0 && STATE.serverImages.subject_cc) {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = Math.abs(p.thickness) / 100;
      ctx.drawImage(STATE.serverImages.subject_cc, 0, 0);
      ctx.restore();
    }

    if (p.detailPop > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = (p.detailPop / 100) * 0.55;
      ctx.drawImage(popCanvas, bx, by);
      ctx.restore();
    }
  }

  if (_stack.id !== "oil_paint") invalidateStack();
  if (!skipComposite) compositeAllLayers();
}

function getOrBuildGlowCache() {
  if (STATE.glowCache) return STATE.glowCache;
  const subImg = STATE.serverImages && (STATE.serverImages.subject_cc || STATE.serverImages.subject_raw);
  if (!subImg) return null;

  const [cw, ch] = STATE.payload.canvas_size;
  const scale = 0.5;
  const gw = Math.max(1, Math.round(cw * scale));
  const gh = Math.max(1, Math.round(ch * scale));

  const c = createCanvas(gw, gh);
  const ctx = c.getContext("2d");
  ctx.drawImage(subImg, 0, 0, gw, gh);
  const imgData = ctx.getImageData(0, 0, gw, gh).data;

  const n = gw * gh;
  const maskAlpha = new Float32Array(n);
  const distInf = new Float32Array(n);
  const INF = 1e9;

  for (let i = 0; i < n; i++) {
    const a = imgData[i * 4 + 3];
    maskAlpha[i] = a;
    distInf[i] = a >= 250 ? 0 : a > 5 ? (255 - a) / 255.0 : INF;
  }

  for (let y = 0; y < gh; y++) {
    const row = y * gw;
    for (let x = 0; x < gw; x++) {
      const idx = row + x;
      let d = distInf[idx];
      if (d === 0) continue;
      if (x > 0) d = Math.min(d, distInf[idx - 1] + 1);
      if (y > 0) {
        d = Math.min(d, distInf[idx - gw] + 1);
        if (x > 0) d = Math.min(d, distInf[idx - gw - 1] + 1);
        if (x < gw - 1) d = Math.min(d, distInf[idx - gw + 1] + 1);
      }
      distInf[idx] = d;
    }
  }
  for (let y = gh - 1; y >= 0; y--) {
    const row = y * gw;
    for (let x = gw - 1; x >= 0; x--) {
      const idx = row + x;
      let d = distInf[idx];
      if (d === 0) continue;
      if (x < gw - 1) d = Math.min(d, distInf[idx + 1] + 1);
      if (y < gh - 1) {
        d = Math.min(d, distInf[idx + gw] + 1);
        if (x < gw - 1) d = Math.min(d, distInf[idx + gw + 1] + 1);
        if (x > 0) d = Math.min(d, distInf[idx + gw - 1] + 1);
      }
      distInf[idx] = d;
    }
  }

  const outCanvas = createCanvas(gw, gh);
  const outCtx = outCanvas.getContext("2d");
  const outImg = outCtx.createImageData(gw, gh);

  STATE.glowCache = {
    cw, ch, gw, gh, scale,
    maskAlpha,
    distPx: distInf,
    ringBuf: new Float32Array(n),
    outCanvas, outCtx, outImg,
  };
  return STATE.glowCache;
}

function rerenderLiveGlowLayer(skipComposite = false) {
  const lyr = STATE.layers.glow;
  if (!lyr || !STATE.payload) return;
  const p = ensureGlowParams(lyr.params);
  const [cw, ch] = STATE.payload.canvas_size;
  if (!lyr.baseCanvas) lyr.baseCanvas = createCanvas(cw, ch);

  const ctx = lyr.baseCanvas.getContext("2d");
  ctx.clearRect(0, 0, cw, ch);

  const cache = getOrBuildGlowCache();
  if (!cache) return;
  const { gw, gh, scale, maskAlpha, distPx, ringBuf, outCanvas, outCtx, outImg } = cache;
  const n = gw * gh;

  // 1. Exact dilated rim of thickness p.size (matches PIL MaxFilter(glow_width * 2 + 1) - mask)
  const maxDist = Math.max(0.5, p.size * scale);
  for (let i = 0; i < n; i++) {
    const d = distPx[i];
    if (d <= maxDist + 0.5) {
      const dilatedVal = 255 * Math.max(0, Math.min(1, maxDist + 0.5 - d));
      const rim = dilatedVal - maskAlpha[i];
      ringBuf[i] = rim > 0 ? rim : 0;
    } else {
      ringBuf[i] = 0;
    }
  }

  // 2. Exact Gaussian-variance matched 3-pass box blur:
  // 3 box blurs of radius r have variance r*(r+1) = sigmaHalf^2 -> r = sqrt(sigmaHalf^2 + 0.25) - 0.5
  const blurRatio = p.defaultBlur / Math.max(1, p.defaultSize);
  const sigmaHalf = Math.max(0.8, p.size * blurRatio * scale);
  const exactR = Math.max(1.0, Math.sqrt(sigmaHalf * sigmaHalf + 0.25) - 0.5);
  const totalR = Math.max(3, Math.round(exactR * 3));
  const r1 = Math.max(1, Math.floor(totalR / 3));
  const r2 = Math.max(1, Math.floor((totalR - r1) / 2));
  const r3 = Math.max(1, totalR - r1 - r2);

  let blurred = boxBlurFloat32(ringBuf, gw, gh, r1);
  blurred = boxBlurFloat32(blurred, gw, gh, r2);
  blurred = boxBlurFloat32(blurred, gw, gh, r3);

  const hex = p.colorMode ? p.glowColor : p.defaultColorHex;
  const [cr, cg, cb] = hexToRgb(hex || "#ffffff");
  const baseOp = p.baseOpacity ?? 0.4;
  const dst = outImg.data;

  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    dst[idx] = cr;
    dst[idx + 1] = cg;
    dst[idx + 2] = cb;
    dst[idx + 3] = Math.min(255, Math.round(blurred[i] * baseOp));
  }

  outCtx.putImageData(outImg, 0, 0);
  ctx.drawImage(outCanvas, 0, 0, gw, gh, 0, 0, cw, ch);

  if (typeof invalidateMoveFastStack === "function") invalidateMoveFastStack();
  if (_stack.id !== "glow") invalidateStack();
  if (!skipComposite) compositeAllLayers();
}

// ============================================================================
// 8C. CONTOUR SEARCH & OVERSCAN PROCEDURAL BRUSH ENGINE
// ============================================================================
function findNearestEdgePointJS(edges, subX, subY) {
  const sd = STATE.payload && STATE.payload.stroke_data;
  if (!sd || !sd.edgesX || sd.numChunks === undefined) {
    let bestPt = edges[0], bestDist = Infinity;
    for (let i = 0; i < edges.length; i++) {
      const pt = edges[i];
      const dx = pt[0] - subX, dy = pt[1] - subY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) { bestDist = d2; bestPt = pt; }
    }
    return bestPt;
  }

  const { edgesX, edgesY, numChunks, chunkMinX, chunkMaxX, chunkMinY, chunkMaxY } = sd;
  const n = edges.length;
  let bestIdx = 0;
  let bestDist = Infinity;

  for (let c = 0; c < numChunks; c++) {
    const dxBox = subX < chunkMinX[c] ? chunkMinX[c] - subX : subX > chunkMaxX[c] ? subX - chunkMaxX[c] : 0;
    const dyBox = subY < chunkMinY[c] ? chunkMinY[c] - subY : subY > chunkMaxY[c] ? subY - chunkMaxY[c] : 0;
    if (dxBox * dxBox + dyBox * dyBox >= bestDist) continue;

    const start = c << _EDGE_CHUNK_SHIFT;
    const end = Math.min(n, start + _EDGE_CHUNK_SIZE);
    for (let i = start; i < end; i++) {
      const dx = edgesX[i] - subX;
      const dy = edgesY[i] - subY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        bestIdx = i;
      }
    }
  }
  return edges[bestIdx];
}

function getBottomOutlineCoordsJS(edges) {
  if (!edges || edges.length === 0) return [];
  const sd = STATE.payload && STATE.payload.stroke_data;
  if (sd && sd.bottomCoords) return sd.bottomCoords;

  const bottomByX = new Map();
  for (let i = 0; i < edges.length; i++) {
    const x = edges[i][0];
    const y = edges[i][1];
    const cur = bottomByX.get(x);
    if (cur === undefined || y > cur) {
      bottomByX.set(x, y);
    }
  }
  const coords = [];
  for (const [x, y] of bottomByX.entries()) {
    coords.push([x, y]);
  }
  if (sd) sd.bottomCoords = coords;
  return coords;
}

const _ellipseGeomCache = new Map();

function getOrBuildEllipseGeometry(layerId, def, spacing, w, h, offX, offY, edges, cfg) {
  const [baseW, baseH] = (STATE.payload && STATE.payload.base_canvas_size) || [w, h];
  const [padX, padY] = (STATE.payload && STATE.payload.pad) || [0, 0];
  const key = `${layerId}_${spacing}_${baseW}x${baseH}`;
  let cached = _ellipseGeomCache.get(key);
  if (cached) return cached;

  const isOuter = def.id === "outer_white";
  const isDark = def.id === "dark_ellipse";
  const prefix = isDark ? "DARK_ELLIPSE" : isOuter ? "OUTER_WHITE_BRUSH" : "WHITE_BRUSH";
  const inset = isDark ? 0 : cfg[`${prefix}_ELLIPSE_INSET`] ?? (isOuter ? -200 : -40);
  const falloff = isDark ? 0 : cfg[`${prefix}_OPACITY_FALLOFF`] ?? (isOuter ? 0.0 : 0.8);
  const blendAmt = isDark ? 0 : cfg[`${prefix}_OUTLINE_BLEND`] ?? (isOuter ? 0.0 : 0.25);
  const rotOffset = cfg[`${prefix}_ROTATION_OFFSET`] ?? 180;

  const halfW = Math.trunc(baseW / 2), halfH = Math.trunc(baseH / 2);
  const cx = padX + halfW, cy = padY + halfH;
  const maxDist = Math.hypot(halfW, halfH);
  const rx = Math.max(10, halfW - inset), ry = Math.max(10, halfH - inset);
  const circum = 2 * Math.PI * Math.max(rx, ry);
  const numPts = Math.max(1, Math.trunc(circum / spacing));
  const bottomThresh = padY + baseH * (1 - (cfg.DARK_ELLIPSE_BOTTOM_PERCENT ?? 0.15));

  cached = [];
  for (let i = 0; i < numPts; i++) {
    const angle = (2 * Math.PI * i) / numPts;
    let ex = Math.trunc(cx + rx * Math.cos(angle));
    let ey = Math.trunc(cy + ry * Math.sin(angle));
    if (isDark && ey < bottomThresh) continue;

    if (!isDark && blendAmt > 0 && edges && edges.length > 0) {
      const nearEdge = findNearestEdgePointJS(edges, ex - offX, ey - offY);
      const nx = nearEdge[0] + offX;
      const ny = nearEdge[1] + offY;
      ex = Math.trunc(ex + (nx - ex) * blendAmt);
      ey = Math.trunc(ey + (ny - ey) * blendAmt);
    }

    const degToCenter = (Math.atan2(-(cy - ey), cx - ex) * 180) / Math.PI;
    const baseRot = degToCenter + 90 + rotOffset;

    let rgb = [255, 255, 255];
    if (isDark && edges && edges.length > 0) {
      const near = findNearestEdgePointJS(edges, ex - offX, ey - offY);
      rgb = [near[4], near[5], near[6]];
    } else if (cfg.ELLIPSE_BRUSH_MODE === "dark") {
      rgb = [0, 0, 0];
    }

    const distRatio = Math.hypot(ex - cx, ey - cy) / maxDist;
    const ptOp = isDark ? 1.0 : (1.0 - falloff) + falloff * distRatio;
    cached.push({ ex, ey, baseRot, rgb, ptOp });
  }

  _ellipseGeomCache.set(key, cached);
  return cached;
}

// ============================================================================
// 8D. EXACT 4-PASS ACCENT STROKES ENGINE
// ============================================================================
function adjustAccentColourJS(colour, isDark, isBright, accentPass, weightAdj) {
  let r = colour[0], g = colour[1], b = colour[2];

  const w = 0.8;
  r += w * 25; g += w * 5; b -= w * 15;

  const gray = (r + g + b) / 3.0;
  const s = 1.5;
  r = gray + (r - gray) * s;
  g = gray + (g - gray) * s;
  b = gray + (b - gray) * s;

  let adj = weightAdj || 0.0;
  if (accentPass === "dark") adj -= 0.3;
  else if (accentPass === "bright") adj += 0.8;

  if (adj > 0) {
    r += (255 - r) * adj;
    g += (255 - g) * adj;
    b += (255 - b) * adj;
  } else if (adj < 0) {
    const f = 1.0 + adj;
    r *= f; g *= f; b *= f;
  }

  const catSat = isDark ? 0.9 : isBright ? 1.1 : 1.2;
  r = gray + (r - gray) * catSat;
  g = gray + (g - gray) * catSat;
  b = gray + (b - gray) * catSat;

  return [
    Math.max(0, Math.min(255, Math.trunc(r))),
    Math.max(0, Math.min(255, Math.trunc(g))),
    Math.max(0, Math.min(255, Math.trunc(b))),
  ];
}

function bottomFadeMultJS(canvasY, canvasH) {
  const [, baseH] = (STATE.payload && STATE.payload.base_canvas_size) || [canvasH, canvasH];
  const [, padY] = (STATE.payload && STATE.payload.pad) || [0, 0];
  const start = 0.70;
  const minOp = 0.0;
  const frac = (canvasY - padY) / Math.max(1, baseH);
  if (frac <= start) return 1.0;
  if (frac >= 1.0) return minOp;
  const t = (frac - start) / (1.0 - start);
  return 1.0 - t * (1.0 - minOp);
}

function buildKeepMaskBySpacingJS(points, spacing) {
  const n = points.length;
  const keep = new Uint8Array(n);
  if (spacing <= 50) {
    keep.fill(1);
    return keep;
  }
  const s2 = spacing * spacing;
  const cell = spacing / Math.SQRT2;
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const px = points[i].x, py = points[i].y;
    const gx = Math.floor(px / cell), gy = Math.floor(py / cell);
    let close = false;
    for (let dx = -2; dx <= 2 && !close; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const nb = grid.get((gx + dx) * 100000 + (gy + dy));
        if (nb !== undefined) {
          const ex = px - nb.x, ey = py - nb.y;
          if (ex * ex + ey * ey < s2) { close = true; break; }
        }
      }
    }
    if (!close) {
      keep[i] = 1;
      grid.set(gx * 100000 + gy, points[i]);
    }
  }
  return keep;
}

function buildAccentStrokesListJS(cands, spots, p, cfg, h) {
  const strokes = [];
  const seed = cfg.RANDOM_SEED || 42;
  const jiggle = p.jiggle ?? 0.8;
  const sizeScale = p.size / 300.0;

  const keepCand = buildKeepMaskBySpacingJS(cands, p.spacing);
  const spotSpacing = Math.max(40, p.spacing * 0.8);
  const keepSpot = p.spacing <= 50 ? new Uint8Array(spots.length).fill(1) : buildKeepMaskBySpacingJS(spots, spotSpacing);

  const passes = [
    { name: "main", seedOff: 1000, sizeMult: 1.0, baseOp: 0.6 },
    { name: "dark", seedOff: 2000, sizeMult: 1.0, baseOp: 0.6 },
    { name: "bright", seedOff: 3000, sizeMult: 0.75, baseOp: 0.3 },
  ];

  for (const pass of passes) {
    const rng = new PythonRandom(seed + pass.seedOff);
    const base = Math.trunc(p.size * pass.sizeMult);

    for (let i = 0; i < cands.length; i++) {
      const pt = cands[i];
      if (pass.name === "dark" && !pt.is_dark) continue;
      if (pass.name === "bright" && !pt.is_bright) continue;

      const sz = Math.max(20, Math.trunc(base * rng.uniform(0.5, 1.5)));
      let angle = (Math.atan2(-pt.ny, pt.nx) * 180) / Math.PI + 270;
      angle += rng.uniform(-180 * jiggle, 180 * jiggle);
      const qAngle = Math.round(angle / 2.0) * 2.0;

      const sx = pt.x + Math.trunc(-pt.nx * rng.uniform(0, 40));
      const sy = pt.y + Math.trunc(-pt.ny * rng.uniform(0, 40));

      let op = pass.baseOp * pt.interest + rng.uniform(-0.1, 0.1);
      if (!keepCand[i]) continue;

      op = Math.max(0.05, Math.min(1.0, op));
      op *= (pt.w_op ?? 1.0) * bottomFadeMultJS(pt.y, h);
      op = Math.max(0.02, Math.min(1.0, op));

      const rgb = adjustAccentColourJS(pt.color, pt.is_dark, pt.is_bright, pass.name, pt.w_bright ?? 0.0);
      strokes.push({ x: sx, y: sy, size: sz, rot: qAngle, rgb, op });
    }
  }

  const spotRng = new PythonRandom(seed + 8888);
  const spotBaseSize = 320 * sizeScale;
  const logS = Math.log1p(600);
  const logRange = Math.max(0.01, Math.log1p(5000) - logS);

  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i];
    const area = sp.patch_area ?? 500;
    const t = Math.max(0.0, Math.min(1.0, (Math.log1p(area) - logS) / logRange));
    const areaFactor = 0.9 + 0.7 * t;

    const sz = Math.max(20, Math.trunc(spotBaseSize * areaFactor * spotRng.uniform(0.8, 1.2)));
    const angle = (Math.atan2(-sp.ny, sp.nx) * 180) / Math.PI + 270 + spotRng.uniform(-60, 60);
    const qAngle = Math.round(angle / 2.0) * 2.0;
    let op = Math.max(0.05, Math.min(1.0, 0.3 * sp.interest + spotRng.uniform(-0.1, 0.1)));

    if (!keepSpot[i]) continue;

    op *= (sp.w_op ?? 1.0) * bottomFadeMultJS(sp.y, h);
    op = Math.max(0.02, Math.min(1.0, op));

    let r = sp.color[0] + 0.15 * 25;
    let g = sp.color[1] + 0.15 * 5;
    let b = sp.color[2] - 0.15 * 15;
    const gray = (r + g + b) / 3.0;
    r = gray + (r - gray) * 1.5;
    g = gray + (g - gray) * 1.5;
    b = gray + (b - gray) * 1.5;

    const totalLighten = 0.7 + (sp.w_bright ?? 0.0);
    if (totalLighten > 0) {
      r += (255 - r) * totalLighten;
      g += (255 - g) * totalLighten;
      b += (255 - b) * totalLighten;
    } else if (totalLighten < 0) {
      const f = 1.0 + totalLighten;
      r *= f; g *= f; b *= f;
    }

    const rgb = [
      Math.max(0, Math.min(255, Math.trunc(r))),
      Math.max(0, Math.min(255, Math.trunc(g))),
      Math.max(0, Math.min(255, Math.trunc(b))),
    ];
    strokes.push({ x: sp.x, y: sp.y, size: sz, rot: qAngle, rgb, op });
  }

  return strokes;
}

function buildProceduralStrokesInOverscanSpace(lyr) {
  const def = lyr.def;
  const p = lyr.params;
  const cfg = STATE.payload.preset_settings;
  const [overW, overH] = STATE.payload.canvas_size;
  const [offX, offY] = STATE.payload.offset;
  const edges = STATE.payload.stroke_data.edges;
  const strokes = [];

  if (def.type === "brush_edge" || def.type === "brush_dots") {
    const rng = new PythonRandom((cfg.RANDOM_SEED || 42) + (def.seedOffset || 0));
    const points = sampleEdgePointsJS(edges, p.spacing);
    const avgColor = STATE.payload.average_color || [128, 128, 128];
    const domColor = STATE.payload.dominant_color;

    const avoidBottom = def.id === "small_dots" && !!cfg.SMALL_WHITE_DOTS_AVOID_BOTTOM;
    const bottomMarginSq = Math.pow(cfg.SMALL_WHITE_DOTS_BOTTOM_MARGIN ?? 50, 2);
    const bottomCoords = avoidBottom ? getBottomOutlineCoordsJS(edges) : [];

    for (const pt of points) {
      const [x, y, nx, ny, cr, cg, cb, valid] = pt;
      if (!valid && def.type === "brush_edge" && def.id !== "small_dots") continue;

      if (avoidBottom && bottomCoords.length > 0) {
        let nearBottom = false;
        for (let b = 0; b < bottomCoords.length; b++) {
          const dx = x - bottomCoords[b][0];
          const dy = y - bottomCoords[b][1];
          if (dx * dx + dy * dy < bottomMarginSq) {
            nearBottom = true;
            break;
          }
        }
        if (nearBottom) continue;
      }

      let rgb = [255, 255, 255];
      if (def.id === "bg_brush" || def.id === "color_brush" || def.id === "sharp_brush") {
        rgb = [cr, cg, cb];
        if (def.id === "bg_brush") {
          if (cfg.BG_BRUSH_MIX_AVERAGE && avgColor) {
            const amt = cfg.BG_BRUSH_MIX_AMOUNT ?? 0.2;
            rgb = rgb.map((v, idx) => Math.round(v * (1 - amt) + avgColor[idx] * amt));
          }
          if (cfg.BG_BRUSH_MIX_DOMINANT && domColor) {
            const amt = cfg.BG_BRUSH_MIX_DOMINANT_AMOUNT ?? 0.3;
            rgb = rgb.map((v, idx) => Math.round(v * (1 - amt) + domColor[idx] * amt));
          }
        }
        rgb = applyBrushWarmthJS(rgb, cfg);
        if (def.id === "bg_brush") {
          rgb = adjustBrightSatJS(rgb, cfg.BG_BRUSH_BRIGHTNESS ?? 0.6, cfg.BG_BRUSH_SATURATION ?? 1.0);
        }
      } else if (def.id === "dark_dots") {
        if (cfg.DARK_DOTS_USE_DOMINANT_COLOR && domColor) {
          const dk = cfg.DARK_DOTS_COLOR_DARKEN ?? 0.3;
          rgb = domColor.map((v) => Math.round(v * (1 - dk)));
        } else {
          rgb = [0, 0, 0];
        }
      }

      let rotAngle = 0;
      if (def.id === "sharp_brush" || def.type === "brush_dots" || def.id === "small_dots") {
        rotAngle = rng.uniform(0, 360);
      } else {
        rotAngle = (Math.atan2(-ny, nx) * 180) / Math.PI + 270;
        if (p.jiggle > 0) rotAngle += rng.uniform(-180 * p.jiggle, 180 * p.jiggle);
      }

      let drawX = x + offX, drawY = y + offY;
      if (def.id === "small_dots") {
        const jit = cfg.SMALL_WHITE_DOTS_DISTANCE_JITTER ?? -50;
        const jAmt = rng.uniform(-jit, jit);
        drawX += nx * jAmt;
        drawY += ny * jAmt;
      }
      const variedSize = Math.max(15, Math.trunc(p.size * rng.uniform(0.7, 1.3)));
      strokes.push({ x: drawX, y: drawY, size: variedSize, rot: rotAngle, rgb, op: 1.0 });
    }
  } else if (def.type === "mask_blur") {
    const rng = new PythonRandom(cfg.RANDOM_SEED || 42);
    const points = sampleEdgePointsJS(edges, p.spacing);
    const blackRgb = [0, 0, 0];
    for (const pt of points) {
      const [x, y, nx, ny] = pt;
      let rotAngle = (Math.atan2(-ny, nx) * 180) / Math.PI + 270;
      if (p.jiggle > 0) rotAngle += rng.uniform(-180 * p.jiggle, 180 * p.jiggle);
      const variedSize = Math.max(20, Math.trunc(p.size * rng.uniform(0.7, 1.3)));
      strokes.push({ x: x + offX, y: y + offY, size: variedSize, rot: rotAngle, rgb: blackRgb, op: 1.0 });
    }
  } else if (def.type === "accent") {
    const cands = STATE.payload.stroke_data.accent_candidates || [];
    const spots = STATE.payload.stroke_data.accent_spots || [];
    return buildAccentStrokesListJS(cands, spots, p, cfg, overH);
  } else if (def.type === "brush_ellipse" || def.type === "brush_ellipse_dark") {
    const rng = new PythonRandom((cfg.RANDOM_SEED || 42) + (def.seedOffset || 500));
    const geom = getOrBuildEllipseGeometry(def.id, def, p.spacing, overW, overH, offX, offY, edges, cfg);

    for (let i = 0; i < geom.length; i++) {
      const g = geom[i];
      let rotAngle = g.baseRot;
      if (p.jiggle > 0) {
        rotAngle += rng.uniform(-180 * p.jiggle, 180 * p.jiggle);
      }
      const variedSize = Math.max(20, Math.trunc(p.size * rng.uniform(0.7, 1.3)));
      strokes.push({ x: g.ex, y: g.ey, size: variedSize, rot: rotAngle, rgb: g.rgb, op: g.ptOp });
    }
  }

  return strokes;
}

function rerenderProceduralLayer(layerId, skipComposite = false) {
  if (layerId === "glow") {
    rerenderLiveGlowLayer(skipComposite);
    return;
  }
  const lyr = STATE.layers[layerId];
  if (!lyr || !STATE.payload) return;
  const def = lyr.def;
  const p = lyr.params;

  if (!lyr.cachedStrokes || lyr.strokesDirty) {
    lyr.cachedStrokes = buildProceduralStrokesInOverscanSpace(lyr);
    lyr.strokesDirty = false;
  }

  if (!lyr.vis) {
    lyr.baseCanvas = null;
    return;
  }

  const brushKey = STATE.brushImages[p.brushFile] ? p.brushFile : Object.keys(STATE.brushImages)[0];
  const brushImg = STATE.brushImages[brushKey];
  if (!brushImg) return;

  const [overW, overH] = STATE.payload.canvas_size;
  if (!lyr.baseCanvas) {
    lyr.baseCanvas = createCanvas(overW, overH);
  } else if (lyr.baseCanvas.width !== overW || lyr.baseCanvas.height !== overH) {
    lyr.baseCanvas.width = overW;
    lyr.baseCanvas.height = overH;
  }

  const ctx = lyr.baseCanvas.getContext("2d");
  ctx.clearRect(0, 0, overW, overH);
  const strokes = lyr.cachedStrokes;

  if (def.type === "mask_blur" && STATE.serverImages.blur_bg) {
    const glCanvas = drawStrokesWebGL(overW, overH, brushKey, brushImg, strokes);
    ctx.drawImage(STATE.serverImages.blur_bg, 0, 0);
    if (glCanvas) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      ctx.globalAlpha = p.baseOpacity;
      ctx.drawImage(glCanvas, 0, 0);
      ctx.restore();
    }
  } else if (def.type === "accent") {
    const glCanvas = drawStrokesWebGL(overW, overH, brushKey, brushImg, strokes);
    if (glCanvas) {
      ctx.drawImage(glCanvas, 0, 0);
    } else {
      for (const s of strokes) colorizeAndDrawBrush(ctx, brushImg, s.x, s.y, s.size, s.rot, s.rgb, s.op);
    }
  } else {
    const glCanvas = drawStrokesWebGL(overW, overH, brushKey, brushImg, strokes);
    if (glCanvas) {
      ctx.save();
      ctx.globalAlpha = p.baseOpacity;
      ctx.drawImage(glCanvas, 0, 0);
      ctx.restore();
    } else {
      for (const s of strokes) colorizeAndDrawBrush(ctx, brushImg, s.x, s.y, s.size, s.rot, s.rgb, s.op);
      if (p.baseOpacity < 1.0) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = `rgba(0, 0, 0, ${p.baseOpacity})`;
        ctx.fillRect(0, 0, overW, overH);
        ctx.restore();
      }
    }
  }

  invalidateMoveFastStack();
  if (_stack.id !== layerId) {
    invalidateStack();
  }
  if (!skipComposite) {
    compositeAllLayers();
  }
}

// Fast 60 FPS subject move/scale update: ZERO procedural re-renders!
let _pendingSubjectMoveRaf = 0;
function scheduleSubjectMoveUpdate() {
  if (_pendingSubjectMoveRaf) return;
  _pendingSubjectMoveRaf = requestAnimationFrame(() => {
    _pendingSubjectMoveRaf = 0;
    if (!STATE.payload) return;
    invalidateStack();
    compositeAllLayers();
  });
}

function applyBrushWarmthJS(rgb, cfg) {
  let [r, g, b] = rgb;
  const amount = cfg.BRUSH_WARMTH || 0;
  if (amount > 0) {
    const baseWarm = amount * 0.3;
    const coolness = Math.max(0, (b - r) / 255.0);
    const cyanFactor = Math.max(0, (b + g - 2 * r) / 510.0);
    const warmStrength = baseWarm + Math.max(coolness, cyanFactor * 0.7) * amount * 0.7;
    r = Math.min(255, Math.max(0, r + Math.floor(warmStrength * 35)));
    g = Math.min(255, Math.max(0, g + Math.floor(warmStrength * 10)));
    b = Math.min(255, Math.max(0, b - Math.floor(warmStrength * 20)));
  }
  if (cfg.DARK_BACKGROUND_ENABLED && cfg.BRUSH_LIGHTEN_AMOUNT > 0) {
    const la = cfg.BRUSH_LIGHTEN_AMOUNT;
    r = Math.min(255, Math.floor(r + (255 - r) * la));
    g = Math.min(255, Math.floor(g + (255 - g) * la));
    b = Math.min(255, Math.floor(b + (255 - b) * la));
  }
  return [r, g, b];
}

function adjustBrightSatJS(rgb, brightness, saturation) {
  let r = (rgb[0] / 255) * brightness;
  let g = (rgb[1] / 255) * brightness;
  let b = (rgb[2] / 255) * brightness;
  const gray = (r + g + b) / 3;
  r = gray + (r - gray) * saturation;
  g = gray + (g - gray) * saturation;
  b = gray + (b - gray) * saturation;
  return [
    Math.max(0, Math.min(255, Math.floor(r * 255))),
    Math.max(0, Math.min(255, Math.floor(g * 255))),
    Math.max(0, Math.min(255, Math.floor(b * 255))),
  ];
}