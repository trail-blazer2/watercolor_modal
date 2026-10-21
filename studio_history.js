/**
 * 🎨 Watercolor Studio — Part 2/5: Undo/Redo History & Cutout Mask Overlay
 */

// ============================================================================
// 6A. UNDO / REDO HISTORY
//   - Pixel edits (Add Brush, Eraser, Cutout Mask): copy-on-write 128px tiles.
//     Only the tiles a stroke actually touches are saved, so a step costs a few
//     hundred KB instead of a full-canvas copy. Undo/redo SWAP tile pixels, so
//     every step is stored exactly once and restores bit-exact pixels.
//   - Layer settings (sliders, brush texture, visibility, Reset): tiny swap entries.
//   - Memory is bounded by a byte budget (oldest steps are dropped first).
//   - History is cleared whenever a brand-new painting is generated.
// ============================================================================
const History = (() => {
  const TILE = 128;
  const SMALL_DEVICE =
    window.innerWidth <= 960 || /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
  const BYTE_BUDGET = (SMALL_DEVICE ? 96 : 384) * 1024 * 1024;
  const MAX_STEPS = 2000;

  const undoStack = [];
  const redoStack = [];
  let bytes = 0;
  let stroke = null;        // pixel stroke currently being recorded
  let paramGesture = null;  // slider drag currently being recorded

let transformGesture = null;

  function transformBegin() {
    if (!STATE.subjectTransform) return;
    if (!transformGesture) {
      transformGesture = { ...STATE.subjectTransform };
    }
  }

  function transformCommit() {
    const before = transformGesture;
    transformGesture = null;
    if (!before || !STATE.subjectTransform) return;
    const cur = STATE.subjectTransform;
    if (before.dx === cur.dx && before.dy === cur.dy && before.scale === cur.scale) return;
    push({
      type: "subject_transform",
      snap: before,
      label: "subject reposition",
    });
  }


  function entryBytes(e) {
    if (e.type === "tiles") return e.bytes;
    if (e.type === "reset") {
      let b = 256;
      if (e.paint) b += e.paint.width * e.paint.height * 4;
      if (e.erase) b += e.erase.width * e.erase.height * 4;
      return b;
    }
    return 256;
  }

  function snapTile(canvas, x, y, w, h) {
    const cv = createCanvas(w, h);
    cv.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
    return cv;
  }

  function layerName(layerId) {
    const lyr = STATE.layers[layerId];
    return lyr ? lyr.def.name : "layer";
  }

  function push(entry) {
    for (const r of redoStack) bytes -= entryBytes(r);
    redoStack.length = 0;
    undoStack.push(entry);
    bytes += entryBytes(entry);
    while (undoStack.length > 1 && (bytes > BYTE_BUDGET || undoStack.length > MAX_STEPS)) {
      bytes -= entryBytes(undoStack.shift());
    }
    updateUI();
  }

  // ---------- pixel strokes (brush / eraser / cutout mask) ----------
  function beginStroke(key, layerId) {
    endStroke();
    commitParams();
    stroke = { key, layerId, tiles: new Map(), canvas: null };
  }

  // Call BEFORE drawing onto `canvas`; saves the pre-stroke pixels of touched tiles once.
  function touch(canvas, minX, minY, maxX, maxY) {
    if (!stroke || !canvas) return;
    stroke.canvas = canvas;
    const cols = Math.ceil(canvas.width / TILE);
    const tx0 = Math.max(0, Math.floor(minX / TILE));
    const ty0 = Math.max(0, Math.floor(minY / TILE));
    const tx1 = Math.min(cols - 1, Math.floor(maxX / TILE));
    const ty1 = Math.min(Math.ceil(canvas.height / TILE) - 1, Math.floor(maxY / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const id = ty * cols + tx;
        if (stroke.tiles.has(id)) continue;
        const x = tx * TILE, y = ty * TILE;
        const w = Math.min(TILE, canvas.width - x);
        const h = Math.min(TILE, canvas.height - y);
        stroke.tiles.set(id, { x, y, w, h, cv: snapTile(canvas, x, y, w, h) });
      }
    }
  }

  function endStroke() {
    const s = stroke;
    stroke = null;
    if (!s || s.tiles.size === 0) return;
    const tiles = Array.from(s.tiles.values());
    let b = 0;
    for (const t of tiles) b += t.w * t.h * 4;
    const kind = s.key.split(":")[0];
    const label =
      kind === "mask" ? "cutout mask edit"
      : kind === "erase" ? `eraser stroke (${layerName(s.layerId)})`
      : `brush stroke (${layerName(s.layerId)})`;
    push({ type: "tiles", key: s.key, layerId: s.layerId, tiles, bytes: b, label });
  }

  // ---------- layer settings ----------
  function paramBegin() {
    const id = STATE.selectedLayerId;
    const lyr = STATE.layers[id];
    if (!lyr) return;
    if (paramGesture && paramGesture.layerId !== id) commitParams();
    if (!paramGesture) paramGesture = { layerId: id, before: { ...lyr.params } };
  }

  function commitParams() {
    const g = paramGesture;
    paramGesture = null;
    if (!g) return;
    const lyr = STATE.layers[g.layerId];
    if (!lyr) return;
    let changed = false;
    for (const k in lyr.params) {
      if (lyr.params[k] !== g.before[k]) { changed = true; break; }
    }
    if (!changed) return;
    push({
      type: "params", layerId: g.layerId, snap: g.before,
      label: `setting change (${layerName(g.layerId)})`,
    });
  }

  function recordVis(layerId, previousValue) {
    commitParams();
    push({
      type: "vis", layerId, value: previousValue,
      label: `layer visibility (${layerName(layerId)})`,
    });
  }

  function recordPresetSwitch(fromPreset, toPreset) {
    if (!fromPreset || !toPreset || fromPreset === toPreset) return;
    commitParams();
    push({
      type: "preset",
      presetKey: fromPreset,
      label: `style preset (${fromPreset} → ${toPreset})`,
    });
  }

  // Call BEFORE resetLayerToOriginal mutates the layer.
  function recordReset(layerId, lyr) {
    commitParams();
    if (!STATE.payload) return;
    const defaults = buildInitialLayerParams(lyr.def, STATE.payload.preset_settings);
    let differs = !!(lyr.paintCanvas || lyr.eraseCanvas);
    if (!differs) {
      for (const k in defaults) {
        if (defaults[k] !== lyr.params[k]) { differs = true; break; }
      }
    }
    if (!differs) return;
    push({
      type: "reset", layerId, params: lyr.params, paint: lyr.paintCanvas, erase: lyr.eraseCanvas,
      label: `layer reset (${layerName(layerId)})`,
    });
  }

  // ---------- applying (undo and redo are the same swap) ----------
  function resolveCanvas(e) {
    if (e.key === "crop_mask") {
      return window.Workflow && Workflow.getCropMaskCanvas ? Workflow.getCropMaskCanvas() : null;
    }
    if (e.key === "mask") return STATE.maskCanvas;
    const lyr = STATE.layers[e.layerId];
    if (!lyr || !STATE.payload) return null;
    const [w, h] = STATE.payload.canvas_size;
    return e.key.startsWith("paint:") ? getOrCreatePaintCanvas(lyr, w, h) : getOrCreateEraseCanvas(lyr, w, h);
  }

  function changedKeys(a, b) {
    const out = [];
    for (const k in a) if (a[k] !== b[k]) out.push(k);
    for (const k in b) if (!(k in a)) out.push(k);
    return out;
  }

  function applyParamEffects(layerId, keys) {
    const has = (...names) => keys.some((k) => names.includes(k));
    if (has("brushFile", "spacing", "size", "jiggle")) rerenderProceduralLayer(layerId, true);
    if (layerId === "oil_paint" && has("thickness", "detailPop")) rerenderLiveOilLayer(true);
    if (layerId === "edge_curve" && has("maskDetail", "edgeThickness")) rerenderLiveEdgeCurveLayer(true);
  }

  function swapEntry(e) {
    if (e.type === "tiles") {
      const canvas = resolveCanvas(e);
      if (!canvas) return false;
      const ctx = canvas.getContext("2d");
      for (const t of e.tiles) {
        const current = snapTile(canvas, t.x, t.y, t.w, t.h);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.filter = "none";
        ctx.clearRect(t.x, t.y, t.w, t.h);
        ctx.drawImage(t.cv, t.x, t.y);
        ctx.restore();
        t.cv = current;
        if (e.key === "mask") syncMaskOverlayRect(t.x, t.y, t.w, t.h);
      }
      return true;
    }

    if (e.type === "preset") {
      const sel = document.getElementById("presetSelect");
      const currentPreset = (STATE.payload && STATE.payload.preset_key) || (sel ? sel.value : "animals");
      const targetPreset = e.presetKey;
      e.presetKey = currentPreset;
      if (sel) sel.value = targetPreset;
      runModalGeneration(false, true, true);
      return true;
    }

    if (e.type === "subject_transform") {
      const current = { ...STATE.subjectTransform };
      STATE.subjectTransform = { ...e.snap };
      e.snap = current;
      if (typeof syncMoveSubjectUI === "function") syncMoveSubjectUI();
      if (typeof scheduleSubjectMoveUpdate === "function") scheduleSubjectMoveUpdate();
      return true;
    }
    
    const lyr = STATE.layers[e.layerId];
    if (!lyr) return false;

    if (e.type === "params") {
      const current = { ...lyr.params };
      const keys = changedKeys(current, e.snap);
      Object.assign(lyr.params, e.snap);
      e.snap = current;
      applyParamEffects(e.layerId, keys);
      return true;
    }
    if (e.type === "vis") {
      const current = lyr.vis;
      lyr.vis = e.value;
      e.value = current;
      invalidateStack();
      return true;
    }
    if (e.type === "reset") {
      const cur = { params: lyr.params, paint: lyr.paintCanvas, erase: lyr.eraseCanvas };
      const keys = changedKeys(cur.params, e.params);
      lyr.params = e.params;
      lyr.paintCanvas = e.paint;
      lyr.eraseCanvas = e.erase;
      e.params = cur.params;
      e.paint = cur.paint;
      e.erase = cur.erase;
      applyParamEffects(e.layerId, keys);
      return true;
    }
    return false;
  }

  function showResult(e) {
    if (e.type === "preset" || e.type === "subject_transform") return;
    if (e.type === "tiles" && e.key === "crop_mask") {
      if (window.Workflow && Workflow.onCropMaskHistorySwap) {
        Workflow.onCropMaskHistorySwap();
      }
      return;
    }
    if (e.type === "tiles" && e.key === "mask") {
      if (STATE.activeTool !== "mask") setActiveTool("mask");
      else compositeAllLayers();
      return;
    }
    const lyr = STATE.layers[e.layerId];
    if (!lyr) return;
    if (e.type === "vis") renderLayerListUI();
    if (STATE.selectedLayerId !== e.layerId) selectLayer(e.layerId);
    else if (e.type === "params" || e.type === "reset") renderSlidersForLayer(lyr);
    compositeAllLayers();
  }

  function step(from, to) {
    if (stroke) return false;
    const isCropStep = window.Workflow && Workflow.getStep && Workflow.getStep() === "crop";
    if (!isCropStep && !STATE.payload) return false;
    commitParams();
    while (from.length) {
      const e = from.pop();
      const before = entryBytes(e);
      if (swapEntry(e)) {
        bytes += entryBytes(e) - before;
        to.push(e);
        showResult(e);
        updateUI();
        return true;
      }
      bytes -= before;
    }
    updateUI();
    return false;
  }

  function undo() { return step(undoStack, redoStack); }
  function redo() { return step(redoStack, undoStack); }

  function clear() {
    undoStack.length = 0;
    redoStack.length = 0;
    bytes = 0;
    stroke = null;
    paramGesture = null;
    updateUI();
  }

  function updateUI() {
    const u = document.getElementById("undoBtn");
    const r = document.getElementById("redoBtn");
    const c = document.getElementById("historyCount");
    if (u) {
      u.disabled = undoStack.length === 0;
      u.title = undoStack.length
        ? `Undo ${undoStack[undoStack.length - 1].label} (Ctrl+Z)`
        : "Nothing to undo";
    }
    if (r) {
      r.disabled = redoStack.length === 0;
      r.title = redoStack.length
        ? `Redo ${redoStack[redoStack.length - 1].label} (Ctrl+Shift+Z)`
        : "Nothing to redo";
    }
    if (c) {
      c.textContent = undoStack.length ? String(undoStack.length) : "";
      c.title = `${undoStack.length} step(s) to undo, ${redoStack.length} to redo`;
    }
  }

  function bindUI() {
    document.getElementById("undoBtn").addEventListener("click", undo);
    document.getElementById("redoBtn").addEventListener("click", redo);
    // A slider drag ends on release: make sure it becomes exactly one step.
    window.addEventListener("pointerup", commitParams);
    window.addEventListener("keydown", (ev) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      const t = ev.target;
      if (t && (t.isContentEditable || t.tagName === "TEXTAREA" ||
          (t.tagName === "INPUT" && !["range", "color", "checkbox", "button"].includes(t.type)))) return;
      const k = ev.key.toLowerCase();
      if (k === "z" && !ev.shiftKey) { ev.preventDefault(); undo(); }
      else if ((k === "z" && ev.shiftKey) || k === "y") { ev.preventDefault(); redo(); }
    });
    updateUI();
  }

  return {
    beginStroke, touch, endStroke,
    paramBegin, paramCommit: commitParams,
    transformBegin, transformCommit,
    recordVis,recordPresetSwitch, recordReset,
    undo, redo, clear, bindUI,
  };
})();

// ============================================================================
// 6A-2. CUTOUT MASK OVERLAY (red tint = removed area)
//   The server mask is an OPAQUE grayscale image (white = keep, black = remove),
//   so the removed area must be derived from luminance, not from alpha.
//   The overlay canvas stores "removed amount" as alpha (opaque red) and is drawn
//   at 55% on top of the photo. Brush strokes are mirrored onto it incrementally,
//   so painting never needs a pixel read-back.
// ============================================================================
const _maskOverlay = { canvas: null, dirty: true };

function markMaskOverlayDirty() { _maskOverlay.dirty = true; }

function syncMaskOverlayRect(x, y, w, h) {
  const m = STATE.maskCanvas, o = _maskOverlay.canvas;
  if (!m || !o) return;
  x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
  w = Math.min(m.width - x, Math.ceil(w)); h = Math.min(m.height - y, Math.ceil(h));
  if (w <= 0 || h <= 0) return;
  const img = m.getContext("2d").getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const removed = 255 - d[i]; // black (0) on mask = 255 alpha on black overlay
    d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = removed;
  }
  o.getContext("2d").putImageData(img, x, y);
}

function paintMaskSegment(x0, y0, x1, y1, radius, hasPrev, keep) {
  const overlay = ensureMaskOverlay();
  const draw = (ctx) => {
    ctx.lineWidth = radius * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (hasPrev) {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x1, y1, radius, 0, Math.PI * 2); ctx.fill();
  };

  const mCtx = STATE.maskCanvas.getContext("2d");
  mCtx.save();
  mCtx.fillStyle = mCtx.strokeStyle = keep ? "#ffffff" : "#000000";
  draw(mCtx);
  mCtx.restore();

  const oCtx = overlay.getContext("2d");
  oCtx.save();
  oCtx.globalCompositeOperation = keep ? "destination-out" : "source-over";
  oCtx.fillStyle = oCtx.strokeStyle = "#000000";
  draw(oCtx);
  oCtx.restore();
}

function ensureMaskOverlay() {
  const m = STATE.maskCanvas;
  if (!m) return null;
  if (!_maskOverlay.canvas) _maskOverlay.canvas = document.createElement("canvas");
  const o = _maskOverlay.canvas;
  if (o.width !== m.width || o.height !== m.height) {
    o.width = m.width; o.height = m.height;
    _maskOverlay.dirty = true;
  }
  if (_maskOverlay.dirty) {
    syncMaskOverlayRect(0, 0, m.width, m.height);
    _maskOverlay.dirty = false;
  }
  return o;
}


