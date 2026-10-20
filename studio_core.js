/**
 * 🎨 Watercolor Studio — Part 1/5: Core State, RNG, Upload & Payload Init
 */

// ============================================================================
// 1. PYTHON MERSENNE TWISTER (Exact match for Python random.Random(seed))
// ============================================================================
class PythonRandom {
  constructor(seed = 42) {
    this.MT = new Uint32Array(624);
    this.index = 624;
    this.seed(seed);
  }
  seed(n) {
    n = Math.abs(Math.floor(n)) >>> 0;
    this.init_genrand(19650218);
    let i = 1, j = 0;
    const key = [n];
    for (let k = 624; k > 0; k--) {
      const prev = this.MT[i - 1];
      const x = prev ^ (prev >>> 30);
      const mul = Math.imul(x, 1664525) >>> 0;
      this.MT[i] = ((this.MT[i] ^ mul) + key[j] + j) >>> 0;
      i++; j = (j + 1) % key.length;
      if (i >= 624) { this.MT[0] = this.MT[623]; i = 1; }
    }
    for (let k = 623; k > 0; k--) {
      const prev = this.MT[i - 1];
      const x = prev ^ (prev >>> 30);
      const mul = Math.imul(x, 1566083941) >>> 0;
      this.MT[i] = ((this.MT[i] ^ mul) - i) >>> 0;
      i++;
      if (i >= 624) { this.MT[0] = this.MT[623]; i = 1; }
    }
    this.MT[0] = 0x80000000 >>> 0;
  }
  init_genrand(s) {
    this.MT[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const x = this.MT[i - 1] ^ (this.MT[i - 1] >>> 30);
      this.MT[i] = (Math.imul(x, 1812433253) + i) >>> 0;
    }
    this.index = 624;
  }
  genrand_int32() {
    if (this.index >= 624) {
      const mag01 = [0x0, 0x9908b0df];
      for (let kk = 0; kk < 227; kk++) {
        const y = (this.MT[kk] & 0x80000000) | (this.MT[kk + 1] & 0x7fffffff);
        this.MT[kk] = this.MT[kk + 397] ^ (y >>> 1) ^ mag01[y & 0x1];
      }
      for (let kk = 227; kk < 623; kk++) {
        const y = (this.MT[kk] & 0x80000000) | (this.MT[kk + 1] & 0x7fffffff);
        this.MT[kk] = this.MT[kk - 227] ^ (y >>> 1) ^ mag01[y & 0x1];
      }
      const y = (this.MT[623] & 0x80000000) | (this.MT[0] & 0x7fffffff);
      this.MT[623] = this.MT[396] ^ (y >>> 1) ^ mag01[y & 0x1];
      this.index = 0;
    }
    let y = this.MT[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
  random() {
    const a = this.genrand_int32() >>> 5;
    const b = this.genrand_int32() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }
  uniform(a, b) {
    return a + (b - a) * this.random();
  }
}

// ============================================================================
// 2. LAYER STACK DEFINITIONS
// ============================================================================
const LAYER_DEFINITIONS = [
  { id: "custom_detail", name: "✨ Eye Reflections & Detail Brush", group: "Over Subject", type: "custom", defaultVis: true },
  { id: "small_dots", name: "⚪ Small White Dots", group: "Over Subject", type: "brush_edge", seedOffset: 700, prefix: "SMALL_WHITE_DOTS" },
  { id: "outer_white", name: "⭕ Outer Frame Brush", group: "Over Subject", type: "brush_ellipse", seedOffset: 550, prefix: "OUTER_WHITE_BRUSH" },
  { id: "white_ellipse", name: "⭕ Inner Frame Brush", group: "Over Subject", type: "brush_ellipse", seedOffset: 500, prefix: "WHITE_BRUSH" },
  { id: "dark_ellipse", name: "🌘 Bottom Dark Ellipse", group: "Over Subject", type: "brush_ellipse_dark", seedOffset: 600, prefix: "DARK_ELLIPSE" },
  { id: "edge_curve", name: "📐 Edge Curve Tri-Tone", group: "Over Subject", type: "effect", prefix: "EDGE_CURVE" },
  { id: "oil_paint", name: "🖼️ Oil Paint Effect", group: "Subject & Oil", type: "oil", prefix: "OIL_PAINT" },
  { id: "subject", name: "🦁 Subject & Color Correction", group: "Subject & Oil", type: "subject", prefix: "CC" },
  { id: "shadow", name: "🌑 Bottom Shadow Brush", group: "Under Subject", type: "effect", prefix: "SHADOW_BRUSH" },
  { id: "colordrop", name: "💧 Bottom Color Drops", group: "Under Subject", type: "effect", prefix: "COLORDROP_BRUSH" },
  { id: "glow", name: "☀️ Subject Rim Glow", group: "Under Subject", type: "glow", prefix: "GLOW" },
  { id: "dark_dots", name: "⚫ Dark Splatter Dots", group: "Under Subject", type: "brush_dots", seedOffset: 400, prefix: "DARK_DOTS" },
  { id: "white_dots", name: "⚪ White Splatter Dots", group: "Under Subject", type: "brush_dots", seedOffset: 300, prefix: "WHITE_DOTS" },
  { id: "accent_strokes", name: "🔥 Accent Strokes (Smart)", group: "Under Subject", type: "accent", prefix: "ACCENT_STROKES" },
  { id: "color_brush", name: "🌈 Color Wash Brush (brush2)", group: "Under Subject", type: "brush_edge", seedOffset: 100, prefix: "COLOR_BRUSH" },
  { id: "mask_blur", name: "🌫️ Blurred Aura + Brush Mask", group: "Under Subject", type: "mask_blur", seedOffset: 0, prefix: "MASK_BRUSH" },
  { id: "sharp_brush", name: "📐 Sharp Edge Brush", group: "Under Subject", type: "brush_edge", seedOffset: 150, prefix: "SHARP_BRUSH" },
  { id: "bg_brush", name: "🎨 Large Background Wash", group: "Under Subject", type: "brush_edge", seedOffset: 200, prefix: "BG_BRUSH" },
  { id: "bg_paper", name: "📜 Paper Texture / Canvas BG", group: "Canvas Base", type: "paper", prefix: "PAPER_TEXTURE" },
];

// ============================================================================
// 3. STUDIO STATE
// ============================================================================
const STATE = {
  apiUrl: "https://autorauto--watercolor-studio-gpu-watercolorservice-api.modal.run",
  uploadedFile: null,
  originalImg: null,
  payload: null,
  brushImages: {},
  layers: {},
  selectedLayerId: "bg_brush",
  activeTool: "pan",
  maskModePaintKeep: true,
  maskCanvas: null,
  rawMaskBase64: null,
  presetCache: new Map(),
  bgFetchPromises: new Map(),
  uploadSessionId: 0,
  zoom: 0.45,
  panX: 40,
  panY: 20,
  isDragging: false,
  lastMouse: { x: 0, y: 0 },
};

const displayCanvas = document.getElementById("displayCanvas");
const displayCtx = displayCanvas.getContext("2d");
const canvasContainer = document.getElementById("canvasContainer");
const viewport = document.getElementById("viewport");
const brushCursor = document.getElementById("brushCursor");

// ============================================================================
// 4. PRE-WARMER, PROGRESS BAR & BRUSH CACHE
// ============================================================================
let _pickerKeepAliveTimer = null;
let _progressTimer = null;

window.addEventListener("DOMContentLoaded", () => {
  bindUIEvents();
  prewarmModalServer();
  loadCachedBrushes();
});

function prewarmModalServer() {
  fetch(`${STATE.apiUrl}/health`, { mode: "cors" }).catch(() => {});
}

function startFilePickerPrewarm() {
  prewarmModalServer();
  stopFilePickerPrewarm();
  let ticks = 0;
  _pickerKeepAliveTimer = setInterval(() => {
    ticks++;
    if (ticks > 4) { stopFilePickerPrewarm(); return; }
    prewarmModalServer();
  }, 10000);
}

function stopFilePickerPrewarm() {
  if (_pickerKeepAliveTimer) {
    clearInterval(_pickerKeepAliveTimer);
    _pickerKeepAliveTimer = null;
  }
}

function startProgressBar(isPresetSwitch = false) {
  const overlay = document.getElementById("loadingOverlay");
  const fill = document.getElementById("loadingBarFill");
  const pctEl = document.getElementById("loadingPercent");
  const textEl = document.getElementById("loadingText");
  const subEl = document.getElementById("loadingSubtext");

  overlay.classList.remove("hidden");
  if (_progressTimer) clearInterval(_progressTimer);

  let pct = 4;
  fill.style.width = `${pct}%`;
  pctEl.textContent = `${pct}%`;
  textEl.textContent = isPresetSwitch ? "Switching style preset..." : "Removing background & analyzing edges...";
  subEl.textContent = "Preparing high-resolution artist layers";

  const startTime = performance.now();
  _progressTimer = setInterval(() => {
    const elapsed = (performance.now() - startTime) / 1000;
    if (pct < 35) {
      pct += isPresetSwitch ? 6 : 4;
    } else if (pct < 72) {
      pct += 2.5;
      textEl.textContent = "Painting watercolor washes & accents...";
    } else if (pct < 92) {
      pct += 0.8;
      textEl.textContent = "Applying oil paint & fine details...";
    }
    pct = Math.min(94, pct);
    fill.style.width = `${Math.round(pct)}%`;
    pctEl.textContent = `${Math.round(pct)}%`;
    if (elapsed > 6 && pct > 80) {
      subEl.textContent = "Waking cloud studio & downloading layers...";
    }
  }, 140);
}

function finishProgressBar() {
  if (_progressTimer) {
    clearInterval(_progressTimer);
    _progressTimer = null;
  }
  const fill = document.getElementById("loadingBarFill");
  const pctEl = document.getElementById("loadingPercent");
  const textEl = document.getElementById("loadingText");
  fill.style.width = "100%";
  pctEl.textContent = "100%";
  textEl.textContent = "Done!";
  setTimeout(() => {
    document.getElementById("loadingOverlay").classList.add("hidden");
  }, 180);
}

async function loadCachedBrushes() {
  if (Object.keys(STATE.brushImages).length >= 7) return;
  try {
    const cachedStr = localStorage.getItem("wc_cached_brushes_v1");
    if (cachedStr) {
      const data = JSON.parse(cachedStr);
      for (const [name, b64] of Object.entries(data)) {
        STATE.brushImages[name] = await loadImage(b64);
      }
      invalidateGLBrushTextures();
      return;
    }
  } catch (_) {}
  fetchBrushTextures();
}

async function fetchBrushTextures() {
  if (Object.keys(STATE.brushImages).length >= 7) return;
  try {
    const res = await fetch(`${STATE.apiUrl}/brushes`);
    if (!res.ok) return;
    const data = await res.json();
    for (const [name, b64] of Object.entries(data)) {
      STATE.brushImages[name] = await loadImage(b64);
    }
    invalidateGLBrushTextures();
    try { localStorage.setItem("wc_cached_brushes_v1", JSON.stringify(data)); } catch (_) {}
  } catch (_) {}
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return reject(new Error("Empty image source"));
    const img = new Image();
    if (src.startsWith("http")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function createCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// ============================================================================
// 6. UPLOAD, GENERATION & FAST BOUNDING-BOX EDGE UNPACKING
// ============================================================================
async function prepareOptimizedUploadBlob(img, presetKey) {
  const isCar = presetKey.startsWith("cars");
  const maxW = isCar ? 1782 : 1260;
  const maxH = isCar ? 1260 : 1782;
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;

  if (w > maxW || h > maxH) {
    const scale = Math.min(maxW / w, maxH / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const c = createCanvas(w, h);
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
}

const SIBLING_PRESETS = {
  animals: ["animals_black"],
  animals_black: ["animals"],
  people: ["animals"],
  cars: ["cars_black", "cars_color"],
  cars_black: ["cars", "cars_color"],
  cars_color: ["cars", "cars_black"],
};

async function fetchPresetPayloadFromServer(presetKey, useEditedMask, isPresetSwitch) {
  const optimizedBlob = await prepareOptimizedUploadBlob(STATE.originalImg, presetKey);
  const formData = new FormData();
  formData.append("image_file", optimizedBlob, "upload.jpg");
  formData.append("preset_key", presetKey);

  if (useEditedMask && STATE.maskCanvas) {
    formData.append("mask_base64", STATE.maskCanvas.toDataURL("image/webp", 0.95));
  } else if (isPresetSwitch && STATE.rawMaskBase64) {
    formData.append("raw_mask_base64", STATE.rawMaskBase64);
  }

  const res = await fetch(`${STATE.apiUrl}/generate`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Server returned status ${res.status}`);
  return JSON.parse(await res.text());
}

function pregenerateSiblingPresetsInBackground(activePresetKey, sessionId) {
  const siblings = SIBLING_PRESETS[activePresetKey] || [];
  for (const sibKey of siblings) {
    if (STATE.presetCache.has(sibKey) || STATE.bgFetchPromises.has(sibKey)) continue;

    const p = fetchPresetPayloadFromServer(sibKey, Boolean(STATE.maskEditedByUser), true)
      .then((sibPayload) => {
        if (STATE.uploadSessionId === sessionId) {
          STATE.presetCache.set(sibKey, sibPayload);
          console.log(`⚡ Background preset ready: ${sibKey}`);
        }
        return sibPayload;
      })
      .catch(() => null)
      .finally(() => {
        STATE.bgFetchPromises.delete(sibKey);
      });

    STATE.bgFetchPromises.set(sibKey, p);
  }
}

async function runModalGeneration(useEditedMask = false, isPresetSwitch = false) {
  if (!STATE.uploadedFile || !STATE.originalImg) return;
  stopFilePickerPrewarm();

  const presetKey = document.getElementById("presetSelect").value;

  // Clear cache on new photo upload or manual cutout mask edit
  if (!isPresetSwitch || useEditedMask) {
    STATE.uploadSessionId++;
    STATE.presetCache.clear();
    STATE.bgFetchPromises.clear();
    STATE.maskEditedByUser = !!useEditedMask;
  }

  const currentSessionId = STATE.uploadSessionId;

  // 1. INSTANT HIT: Sibling preset is already cached in RAM (0ms network wait!)
  if (isPresetSwitch && !useEditedMask && STATE.presetCache.has(presetKey)) {
    const cachedPayload = STATE.presetCache.get(presetKey);
    await initializeStudioFromPayload(cachedPayload);
    pregenerateSiblingPresetsInBackground(presetKey, currentSessionId);
    return;
  }

  startProgressBar(isPresetSwitch);

  try {
    const t0 = performance.now();
    let payload;

    // 2. IN-FLIGHT HIT: Background fetch is already running for this preset—await it!
    if (isPresetSwitch && !useEditedMask && STATE.bgFetchPromises.has(presetKey)) {
      payload = await STATE.bgFetchPromises.get(presetKey);
    }
    if (!payload) {
      payload = await fetchPresetPayloadFromServer(presetKey, useEditedMask, isPresetSwitch);
    }

    if (payload.raw_mask_png) {
      STATE.rawMaskBase64 = payload.raw_mask_png;
    }
    if (currentSessionId === STATE.uploadSessionId) {
      STATE.presetCache.set(payload.preset_key || presetKey, payload);
    }

    await initializeStudioFromPayload(payload);
    const tDone = performance.now();

    console.table({
      "TOTAL_USER_WAIT_SEC": Number(((tDone - t0) / 1000).toFixed(2)),
      ...(payload.timings || {}),
    });

    if (Object.keys(STATE.brushImages).length === 0) fetchBrushTextures();

    // 3. Kick off sibling preset generation in the background AFTER UI is 100% ready
    setTimeout(() => {
      if (currentSessionId === STATE.uploadSessionId) {
        pregenerateSiblingPresetsInBackground(payload.preset_key || presetKey, currentSessionId);
      }
    }, 80);
  } catch (err) {
    alert("Error generating painting: " + err.message);
    console.error(err);
  } finally {
    finishProgressBar();
  }
}

const _EDGE_CHUNK_SHIFT = 6; // 64 points per bounding-box chunk
const _EDGE_CHUNK_SIZE = 1 << _EDGE_CHUNK_SHIFT;

function unpackEdgesIfNeeded(strokeData) {
  if (!strokeData) return [];
  if (strokeData.edges && strokeData.edgesX) return strokeData.edges;
  const flat = strokeData.edges_flat;
  if (!flat || !flat.length) {
    strokeData.edges = [];
    strokeData.edgesX = new Int32Array(0);
    strokeData.edgesY = new Int32Array(0);
    return [];
  }
  const count = (flat.length / 8) | 0;
  const out = new Array(count);
  const edgesX = new Int32Array(count);
  const edgesY = new Int32Array(count);
  let maxX = 0, maxY = 0;

  const numChunks = Math.ceil(count / _EDGE_CHUNK_SIZE);
  const chunkMinX = new Int32Array(numChunks).fill(0x7fffffff);
  const chunkMaxX = new Int32Array(numChunks).fill(-0x7fffffff);
  const chunkMinY = new Int32Array(numChunks).fill(0x7fffffff);
  const chunkMaxY = new Int32Array(numChunks).fill(-0x7fffffff);

  for (let i = 0, j = 0; j < count; i += 8, j++) {
    const x = flat[i] | 0;
    const y = flat[i + 1] | 0;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    edgesX[j] = x;
    edgesY[j] = y;
    const c = j >> _EDGE_CHUNK_SHIFT;
    if (x < chunkMinX[c]) chunkMinX[c] = x;
    if (x > chunkMaxX[c]) chunkMaxX[c] = x;
    if (y < chunkMinY[c]) chunkMinY[c] = y;
    if (y > chunkMaxY[c]) chunkMaxY[c] = y;
    out[j] = [
      x,
      y,
      flat[i + 2] / 10000,
      flat[i + 3] / 10000,
      flat[i + 4],
      flat[i + 5],
      flat[i + 6],
      flat[i + 7],
    ];
  }
  strokeData.edges = out;
  strokeData.edgesX = edgesX;
  strokeData.edgesY = edgesY;
  strokeData.maxX = maxX;
  strokeData.maxY = maxY;
  strokeData.numChunks = numChunks;
  strokeData.chunkMinX = chunkMinX;
  strokeData.chunkMaxX = chunkMaxX;
  strokeData.chunkMinY = chunkMinY;
  strokeData.chunkMaxY = chunkMaxY;
  strokeData.bottomCoords = null;
  return out;
}

// Reconstructs a 100% untextured color-corrected subject from subject_raw + subject_cc
// if running against a server payload that hasn't separated subject_tex yet.
function buildCleanSubjectFromRawAndTextured(rawImg, texCcImg, payload) {
  const [cw, ch] = payload.canvas_size;
  const [offX, offY] = payload.offset;
  const [subW, subH] = payload.subject_size;
  const bx = Math.max(0, offX);
  const by = Math.max(0, offY);
  const bw = Math.min(cw - bx, subW);
  const bh = Math.min(ch - by, subH);

  const outCanvas = createCanvas(cw, ch);
  if (bw <= 0 || bh <= 0) return outCanvas;

  const rawC = createCanvas(bw, bh);
  const rawCtx = rawC.getContext("2d");
  rawCtx.drawImage(rawImg, bx, by, bw, bh, 0, 0, bw, bh);
  const rawData = rawCtx.getImageData(0, 0, bw, bh).data;

  const ccC = createCanvas(bw, bh);
  const ccCtx = ccC.getContext("2d");
  ccCtx.drawImage(texCcImg, bx, by, bw, bh, 0, 0, bw, bh);
  const ccData = ccCtx.getImageData(0, 0, bw, bh).data;

  const n = bw * bh;
  const inside = new Float32Array(n);
  const diffR = new Float32Array(n);
  const diffG = new Float32Array(n);
  const diffB = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (rawData[p + 3] > 20) {
      inside[i] = 1.0;
      diffR[i] = ccData[p] - rawData[p];
      diffG[i] = ccData[p + 1] - rawData[p + 1];
      diffB[i] = ccData[p + 2] - rawData[p + 2];
    }
  }

  // Smooth the color-correction delta over a 12px radius so 100% of the watercolor
  // texture blotches are stripped while preserving exact color correction & sharp subject edges
  const den = boxBlurFloat32(inside, bw, bh, 12);
  const smDiffR = normalizedBlurFloat32(diffR, inside, bw, bh, 12, den);
  const smDiffG = normalizedBlurFloat32(diffG, inside, bw, bh, 12, den);
  const smDiffB = normalizedBlurFloat32(diffB, inside, bw, bh, 12, den);

  const cleanImg = rawCtx.createImageData(bw, bh);
  const dst = cleanImg.data;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const a = rawData[p + 3];
    if (a === 0) continue;
    dst[p] = Math.max(0, Math.min(255, Math.round(rawData[p] + smDiffR[i])));
    dst[p + 1] = Math.max(0, Math.min(255, Math.round(rawData[p + 1] + smDiffG[i])));
    dst[p + 2] = Math.max(0, Math.min(255, Math.round(rawData[p + 2] + smDiffB[i])));
    dst[p + 3] = a;
  }

  rawCtx.putImageData(cleanImg, 0, 0);
  outCanvas.getContext("2d").drawImage(rawC, bx, by);
  return outCanvas;
}

async function initializeStudioFromPayload(payload) {
  cancelPendingSchedules();
  History.clear();
  invalidateStack();
  _sampleCache.clear();
  _ellipseGeomCache.clear();
  STATE.oilDetailCache = null;
  STATE.glowCache = null; // Přidáno vedle STATE.oilDetailCache
  STATE.edgeCurveCache = null;
  destroyGLEdgeCurveResources();

  unpackEdgesIfNeeded(payload.stroke_data);
  STATE.payload = payload;
  const [w, h] = payload.canvas_size;

  document.getElementById("emptyState").classList.add("hidden");
  canvasContainer.classList.remove("hidden");
  document.getElementById("maskModeBtn").disabled = false;
  document.getElementById("exportPngBtn").disabled = false;
  document.getElementById("exportJpgBtn").disabled = false;
  document.getElementById("resetLayerBtn").disabled = false;
  document.getElementById("renderTimeBadge").textContent = `⚡ ${payload.elapsed_sec}s`;

  if (payload.average_color) {
    const hex = rgbToHex(...payload.average_color);
    const sw = document.getElementById("avgColorSwatch");
    sw.style.background = hex; sw.dataset.color = hex;
  }
  if (payload.dominant_color) {
    const hex = rgbToHex(...payload.dominant_color);
    const sw = document.getElementById("domColorSwatch");
    sw.style.background = hex; sw.dataset.color = hex;
  }

  // Použití předdekódovaného obrázku masky, pokud existuje
  const maskImg = payload._decoded ? payload._decoded.maskImg : await loadImage(payload.mask_png);
  STATE.maskCanvas = createCanvas(maskImg.width, maskImg.height);
  STATE.maskCanvas.getContext("2d", { willReadFrequently: true }).drawImage(maskImg, 0, 0);
  markMaskOverlayDirty();

  // Použití předdekódovaných obrázků vrstev, pokud existují
  let rawImgs;
  if (payload._decoded && payload._decoded.rawImgs) {
    rawImgs = { ...payload._decoded.rawImgs };
  } else {
    rawImgs = {};
    await Promise.all(
      Object.entries(payload.layers).map(async ([key, b64]) => {
        if (b64) rawImgs[key] = await loadImage(b64);
      })
    );
  }

  const cfg = payload.preset_settings;
  // Separate clean subject_cc from watercolor-textured subject_tex if needed
  if (cfg.WATERCOLOR_TEXTURE_ENABLED && !rawImgs.subject_tex && rawImgs.subject_cc && rawImgs.subject_raw) {
    rawImgs.subject_tex = rawImgs.subject_cc;
    rawImgs.subject_cc = buildCleanSubjectFromRawAndTextured(rawImgs.subject_raw, rawImgs.subject_tex, payload);
  }
  STATE.serverImages = rawImgs;

  STATE.layers = {};

  for (const def of LAYER_DEFINITIONS) {
    const baseCanvas = createCanvas(w, h);
    const baseCtx = baseCanvas.getContext("2d");

    let enabled = true;
    if (def.id === "mask_blur") {
      enabled = !!cfg.MASK_BRUSH_ENABLED;
      if (enabled && rawImgs.blur_bg && rawImgs.mask_brush) {
        baseCtx.drawImage(rawImgs.blur_bg, 0, 0);
        baseCtx.globalCompositeOperation = "destination-in";
        baseCtx.drawImage(rawImgs.mask_brush, 0, 0);
        baseCtx.globalCompositeOperation = "source-over";
      }
    } else if (def.id === "subject") {
      enabled = !!cfg.SHOW_SUBJECT;
      if (rawImgs.subject_cc) baseCtx.drawImage(rawImgs.subject_cc, 0, 0);
    } else if (def.id === "oil_paint") {
      enabled = !!cfg.OIL_PAINT_ENABLED;
      if (rawImgs.oil_paint_full) baseCtx.drawImage(rawImgs.oil_paint_full, 0, 0);
    } else if (def.id === "bg_paper") {
      enabled = true;
      if (rawImgs.bg_paper) baseCtx.drawImage(rawImgs.bg_paper, 0, 0);
    } else {
      const enKey = `${def.prefix}_ENABLED`;
      enabled = cfg[enKey] !== undefined ? !!cfg[enKey] : true;
      if (rawImgs[def.id]) baseCtx.drawImage(rawImgs[def.id], 0, 0);
    }

    STATE.layers[def.id] = {
      def,
      vis: enabled,
      origImage: rawImgs[def.id] || null,
      baseCanvas,
      paintCanvas: null,
      eraseCanvas: null,
      params: buildInitialLayerParams(def, cfg),
    };
  }

  await loadCachedBrushes();
  for (const def of LAYER_DEFINITIONS) {
    if (
      ["brush_edge", "brush_dots", "brush_ellipse", "brush_ellipse_dark", "mask_blur"].includes(
        def.type
      )
    ) {
      rerenderProceduralLayer(def.id, true);
    }
  }
  if (STATE.layers.edge_curve) {
    rerenderLiveEdgeCurveLayer(true);
    rerenderLiveOilLayer(true);
  }

  invalidateStack();
  renderLayerListUI();
  selectLayer(STATE.selectedLayerId || "bg_brush");
  if (displayCanvas.width !== w || displayCanvas.height !== h) {
    displayCanvas.width = w;
    displayCanvas.height = h;
    fitCanvasToViewport();
  }
  fitCanvasToViewport();
  compositeAllLayers();
}

function getOrCreatePaintCanvas(lyr, w, h) {
  if (!lyr.paintCanvas) lyr.paintCanvas = createCanvas(w, h);
  return lyr.paintCanvas;
}
function getOrCreateEraseCanvas(lyr, w, h) {
  if (!lyr.eraseCanvas) lyr.eraseCanvas = createCanvas(w, h);
  return lyr.eraseCanvas;
}