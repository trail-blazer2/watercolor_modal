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
  aspectRatioKey: "a4",
  aspectOrientation: null, // "portrait" | "landscape"
  uncroppedPlacement: null,
  viewRect: { x: 0, y: 0, w: 1260, h: 1782 },
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
  if (window.Workflow) Workflow.init();
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
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// ============================================================================
// 5. ASPECT RATIO PARSER & NON-DESTRUCTIVE MASTER CANVAS CROPPER
// ============================================================================
const MASTER_CANVAS_DIM = 2400;

function resolveActiveProfileKey() {
  const presetEl = document.getElementById("presetSelect");
  const presetKey = presetEl ? presetEl.value : "animals";
  if (presetKey.startsWith("cars")) return "car";
  if (presetKey === "people") return "person";
  return "animal";
}

function parseAspectRatioToCm(ratioVal, profileKey, orientationOverride) {
  const prof = profileKey || resolveActiveProfileKey();
  const isDefaultLandscape = prof === "car";
  const orient = orientationOverride || STATE.aspectOrientation || (isDefaultLandscape ? "landscape" : "portrait");
  const v = String(ratioVal || "a4").trim().toLowerCase();

  let longSide = 141.421356; // ISO A2/A3/A4 (sqrt(2) * 100)
  let shortSide = 100;

  if (v.includes("4:3") || v.includes("4_3") || v.includes("3:4")) {
    longSide = 133.333333; shortSide = 100;
  } else if (v.includes("3:2") || v.includes("3_2") || v.includes("2:3")) {
    longSide = 150; shortSide = 100;
  } else if (v.includes("16:9") || v.includes("16_9") || v.includes("9:16")) {
    longSide = 177.777778; shortSide = 100;
  } else {
    longSide = 141.421356; shortSide = 100;
  }

  return orient === "landscape"
    ? { width: longSide, height: shortSide }
    : { width: shortSide, height: longSide };
}

// Computes the non-destructive viewport crop rectangle inside the 2400x2400 Master Canvas
function computeMasterViewRect(ratioVal, orientationOverride) {
  if (!STATE.payload || !STATE.payload.base_canvas_size) {
    return { x: 0, y: 0, w: 1260, h: 1782 };
  }
  const [baseW, baseH] = STATE.payload.base_canvas_size;
  const [padX, padY] = STATE.payload.pad || [0, 0];
  const [masterW, masterH] = STATE.payload.canvas_size;

  const prof = resolveActiveProfileKey();
  const cm = parseAspectRatioToCm(ratioVal || STATE.aspectRatioKey, prof, orientationOverride);
  const R = cm.width / cm.height;

  let viewW, viewH, viewX, viewY;
  if (prof === "car") {
    // Vehicle: keep reference height 1260 for landscape ratios (expands sides up to 2240 for 16:9),
    // or keep reference width 1782 for portrait ratios
    if (R >= 1) {
      viewH = baseH;
      viewW = Math.min(masterW, Math.round(viewH * R));
    } else {
      viewW = baseW;
      viewH = Math.min(masterH, Math.round(viewW / R));
    }
    viewX = Math.round(padX + (baseW - viewW) * 0.5);
    viewY = Math.round(padY + (baseH - viewH) * 0.5);
  } else {
    // Portrait bust: anchor bottom at padY + baseH and center horizontally around padX + baseW/2
    if (R <= 1.35) {
      viewH = baseH;
      viewW = Math.min(masterW, Math.round(viewH * R));
    } else {
      viewW = Math.min(masterW, Math.round(baseH * R));
      viewH = Math.min(masterH, Math.round(viewW / R));
    }
    viewX = Math.round(padX + (baseW - viewW) * 0.5);
    viewY = Math.round(padY + baseH - viewH);
  }

  viewX = Math.max(0, Math.min(masterW - viewW, viewX));
  viewY = Math.max(0, Math.min(masterH - viewH, viewY));
  return { x: viewX, y: viewY, w: viewW, h: viewH };
}

// Instant, zero-delay aspect ratio switching in Step 3: NO layer re-renders, zero brush shifting!
function applyStudioAspectRatio(ratioVal, orientationOverride) {
  if (ratioVal !== undefined && ratioVal !== null) {
    STATE.aspectRatioKey = ratioVal;
  }
  if (orientationOverride !== undefined) {
    STATE.aspectOrientation = orientationOverride;
  }

  const cropSel = document.getElementById("cropCanvasRatio");
  const studioSel = document.getElementById("studioAspectRatio");
  if (cropSel && cropSel.value !== STATE.aspectRatioKey) cropSel.value = STATE.aspectRatioKey;
  if (studioSel && studioSel.value !== STATE.aspectRatioKey) studioSel.value = STATE.aspectRatioKey;

  if (!STATE.payload) return;

  STATE.viewRect = computeMasterViewRect(STATE.aspectRatioKey, STATE.aspectOrientation);
  displayCanvas.width = STATE.viewRect.w;
  displayCanvas.height = STATE.viewRect.h;

  // If subject has bottomFade active, only composite needs to run (no procedural re-renders!)
  invalidateStack();
  fitCanvasToViewport();
  compositeAllLayers();
}

window.applyStudioAspectRatio = applyStudioAspectRatio;
window.changeStudioAspectRatio = applyStudioAspectRatio;
window.parseAspectRatioToCm = parseAspectRatioToCm;

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
    // Crop back to base_canvas_size if STATE.maskCanvas is on the master canvas
    const b64 = exportBaseMaskDataURL();
    formData.append("mask_base64", b64);
  } else if (STATE.rawMaskBase64) {
    formData.append("raw_mask_base64", STATE.rawMaskBase64);
  }

  const res = await fetch(`${STATE.apiUrl}/generate`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Server returned status ${res.status}`);
  return JSON.parse(await res.text());
}

function exportBaseMaskDataURL() {
  if (!STATE.maskCanvas) return null;
  return STATE.maskCanvas.toDataURL("image/webp", 0.95);
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

  if (!isPresetSwitch || useEditedMask) {
    STATE.uploadSessionId++;
    STATE.presetCache.clear();
    STATE.bgFetchPromises.clear();
    STATE.maskEditedByUser = !!useEditedMask;
  }

  const currentSessionId = STATE.uploadSessionId;
  startProgressBar(isPresetSwitch);

  try {
    const t0 = performance.now();
    let payload = null;

    if (isPresetSwitch && !useEditedMask) {
      if (STATE.presetCache.has(presetKey)) {
        payload = STATE.presetCache.get(presetKey);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      } else if (STATE.bgFetchPromises.has(presetKey)) {
        payload = await STATE.bgFetchPromises.get(presetKey);
      }
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

const _EDGE_CHUNK_SHIFT = 6;
const _EDGE_CHUNK_SIZE = 1 << _EDGE_CHUNK_SHIFT;

function rebuildEdgeSpatialIndex(strokeData) {
  if (!strokeData || !strokeData.edges) return;
  const edges = strokeData.edges;
  const count = edges.length;
  const edgesX = new Int32Array(count);
  const edgesY = new Int32Array(count);
  let maxX = 0, maxY = 0;

  const numChunks = Math.ceil(count / _EDGE_CHUNK_SIZE);
  const chunkMinX = new Int32Array(numChunks).fill(0x7fffffff);
  const chunkMaxX = new Int32Array(numChunks).fill(-0x7fffffff);
  const chunkMinY = new Int32Array(numChunks).fill(0x7fffffff);
  const chunkMaxY = new Int32Array(numChunks).fill(-0x7fffffff);

  for (let j = 0; j < count; j++) {
    const pt = edges[j];
    const x = pt[0] | 0;
    const y = pt[1] | 0;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    edgesX[j] = x;
    edgesY[j] = y;
    const c = j >> _EDGE_CHUNK_SHIFT;
    if (x < chunkMinX[c]) chunkMinX[c] = x;
    if (x > chunkMaxX[c]) chunkMaxX[c] = x;
    if (y < chunkMinY[c]) chunkMinY[c] = y;
    if (y > chunkMaxY[c]) chunkMaxY[c] = y;
  }

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
}

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
  for (let i = 0, j = 0; j < count; i += 8, j++) {
    out[j] = [
      flat[i] | 0,
      flat[i + 1] | 0,
      flat[i + 2] / 10000,
      flat[i + 3] / 10000,
      flat[i + 4],
      flat[i + 5],
      flat[i + 6],
      flat[i + 7],
    ];
  }
  strokeData.edges = out;
  rebuildEdgeSpatialIndex(strokeData);
  return out;
}

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

// Places a base [baseW, baseH] server image onto the [masterW, masterH] Master Canvas at [padX, padY]
function liftServerImageToMaster(srcImg, baseW, baseH, masterW, masterH, padX, padY, mode = "normal") {
  if (!srcImg) return null;
  const c = createCanvas(masterW, masterH);
  const ctx = c.getContext("2d");

  if (mode === "paper") {
    // Mirror-tile the paper texture into the overscan borders while keeping (padX, padY) 100% exact
    for (let ty = -1; ty <= 1; ty++) {
      for (let tx = -1; tx <= 1; tx++) {
        ctx.save();
        const dx = padX + tx * baseW;
        const dy = padY + ty * baseH;
        ctx.translate(dx + (tx !== 0 ? baseW : 0), dy + (ty !== 0 ? baseH : 0));
        ctx.scale(tx !== 0 ? -1 : 1, ty !== 0 ? -1 : 1);
        ctx.drawImage(srcImg, 0, 0, baseW, baseH);
        ctx.restore();
      }
    }
    return c;
  }

  if (mode === "blur_bg") {
    ctx.save();
    ctx.filter = "blur(28px)";
    ctx.drawImage(srcImg, 0, 0, masterW, masterH);
    ctx.restore();
    ctx.drawImage(srcImg, padX, padY, baseW, baseH);
    return c;
  }

  ctx.drawImage(srcImg, padX, padY, baseW, baseH);
  return c;
}

// Appends extra subject pixels & contour edges in the overscan zone (outside [baseW, baseH])
// to the END of stroke_data.edges so original strokes never shift while wider ratios have full edges!
function populateOverscanSubjectAndEdges(payload, rawImgs, baseW, baseH, masterW, masterH, padX, padY) {
  const up = STATE.uncroppedPlacement;
  if (!up || !up.cutoutCanvas || !up.maskCanvas) return;
  if (up.refSize[0] !== baseW || up.refSize[1] !== baseH) return;

  const fullX = Math.round(padX + up.px.x);
  const fullY = Math.round(padY + up.px.y);
  const fullW = Math.round(up.px.w);
  const fullH = Math.round(up.px.h);

  // Fill overscan subject pixels outside the central [padX, padY, baseW, baseH] box
  for (const key of ["subject_raw", "subject_cc", "subject_tex", "oil_paint_full"]) {
    const targetC = rawImgs[key];
    if (!targetC) continue;
    const overC = createCanvas(masterW, masterH);
    const oCtx = overC.getContext("2d");
    oCtx.drawImage(up.cutoutCanvas, fullX, fullY, fullW, fullH);
    oCtx.clearRect(padX + 2, padY + 2, baseW - 4, baseH - 4);
    const tCtx = targetC.getContext("2d");
    tCtx.save();
    tCtx.globalCompositeOperation = "destination-over";
    tCtx.drawImage(overC, 0, 0);
    tCtx.restore();
  }

  // Extract contour edges strictly in the overscan zone and append them to the END of edges
  const sd = payload.stroke_data;
  if (!sd || !sd.edges) return;
  const [offX, offY] = payload.offset; // already shifted by padX, padY

  const scaleDown = 4;
  const gw = Math.round(masterW / scaleDown);
  const gh = Math.round(masterH / scaleDown);
  const mC = createCanvas(gw, gh);
  const mCtx = mC.getContext("2d");
  mCtx.fillStyle = "#000";
  mCtx.fillRect(0, 0, gw, gh);
  mCtx.drawImage(up.maskCanvas, fullX / scaleDown, fullY / scaleDown, fullW / scaleDown, fullH / scaleDown);
  const mData = mCtx.getImageData(0, 0, gw, gh).data;

  const pC = createCanvas(gw, gh);
  const pCtx = pC.getContext("2d");
  pCtx.drawImage(up.sourceCanvas, fullX / scaleDown, fullY / scaleDown, fullW / scaleDown, fullH / scaleDown);
  const pData = pCtx.getImageData(0, 0, gw, gh).data;

  const ix0 = Math.floor(padX / scaleDown);
  const ix1 = Math.ceil((padX + baseW) / scaleDown);
  const iy0 = Math.floor(padY / scaleDown);
  const iy1 = Math.ceil((padY + baseH) / scaleDown);

  for (let y = 2; y < gh - 2; y++) {
    for (let x = 2; x < gw - 2; x++) {
      if (x >= ix0 && x <= ix1 && y >= iy0 && y <= iy1) continue;
      const idx = (y * gw + x) * 4;
      if (mData[idx] < 128) continue;
      const l = mData[idx - 4] < 128;
      const r = mData[idx + 4] < 128;
      const u = mData[idx - gw * 4] < 128;
      const d = mData[idx + gw * 4] < 128;
      if (!l && !r && !u && !d) continue;

      const gx = (mData[idx + 4] - mData[idx - 4]) || 0;
      const gy = (mData[idx + gw * 4] - mData[idx - gw * 4]) || 0;
      const len = Math.hypot(gx, gy) || 1;
      const nx = -gx / len;
      const ny = -gy / len;

      const mx = x * scaleDown - offX;
      const my = y * scaleDown - offY;
      sd.edges.push([mx, my, nx, ny, pData[idx], pData[idx + 1], pData[idx + 2], 1]);
    }
  }
}

async function initializeStudioFromPayload(payload) {
  cancelPendingSchedules();
  History.clear();
  invalidateStack();
  _sampleCache.clear();
  _ellipseGeomCache.clear();
  STATE.oilDetailCache = null;
  STATE.edgeCurveCache = null;
  STATE.glowCache = null;
  destroyGLEdgeCurveResources();

  // Clone payload coordinates so cached presets remain pristine
  const workPayload = {
    ...payload,
    canvas_size: [...payload.canvas_size],
    offset: [...payload.offset],
    subject_size: [...payload.subject_size],
    stroke_data: {
      ...payload.stroke_data,
      edges: null,
      edgesX: null,
    },
  };
  unpackEdgesIfNeeded(workPayload.stroke_data);
  workPayload.stroke_data.edges = workPayload.stroke_data.edges.map((e) => [...e]);

  const [baseW, baseH] = workPayload.canvas_size;
  const masterW = MASTER_CANVAS_DIM;
  const masterH = MASTER_CANVAS_DIM;
  const padX = Math.round((masterW - baseW) * 0.5);
  const padY = Math.round((masterH - baseH) * 0.5);

  workPayload.base_canvas_size = [baseW, baseH];
  workPayload.pad = [padX, padY];
  workPayload.canvas_size = [masterW, masterH];
  workPayload.offset = [workPayload.offset[0] + padX, workPayload.offset[1] + padY];
  workPayload.stroke_data.accent_candidates = (workPayload.stroke_data.accent_candidates || []).map((c) => ({
    ...c,
    x: c.x + padX,
    y: c.y + padY,
    color: [...c.color],
  }));
  workPayload.stroke_data.accent_spots = (workPayload.stroke_data.accent_spots || []).map((s) => ({
    ...s,
    x: s.x + padX,
    y: s.y + padY,
    color: [...s.color],
  }));

  STATE.payload = workPayload;

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

  const maskImg = payload._decoded ? payload._decoded.maskImg : await loadImage(payload.mask_png);
  STATE.maskCanvas = createCanvas(maskImg.width, maskImg.height);
  STATE.maskCanvas.getContext("2d", { willReadFrequently: true }).drawImage(maskImg, 0, 0);
  markMaskOverlayDirty();

  let decodedImgs = {};
  if (payload._decoded && payload._decoded.rawImgs) {
    decodedImgs = { ...payload._decoded.rawImgs };
  } else {
    await Promise.all(
      Object.entries(payload.layers).map(async ([key, b64]) => {
        if (b64) decodedImgs[key] = await loadImage(b64);
      })
    );
  }

  // Lift all server images onto the 2400x2400 Master Canvas at [padX, padY]
  const rawImgs = {};
  for (const [key, img] of Object.entries(decodedImgs)) {
    if (!img) continue;
    const mode = key === "bg_paper" ? "paper" : key === "blur_bg" ? "blur_bg" : "normal";
    rawImgs[key] = liftServerImageToMaster(img, baseW, baseH, masterW, masterH, padX, padY, mode);
  }

  const cfg = workPayload.preset_settings;
  if (cfg.WATERCOLOR_TEXTURE_ENABLED && !rawImgs.subject_tex && rawImgs.subject_cc && rawImgs.subject_raw) {
    rawImgs.subject_tex = rawImgs.subject_cc;
    rawImgs.subject_cc = buildCleanSubjectFromRawAndTextured(rawImgs.subject_raw, rawImgs.subject_tex, workPayload);
  }

  // Add overscan subject pixels & append overscan edges at the end of stroke_data.edges
  populateOverscanSubjectAndEdges(workPayload, rawImgs, baseW, baseH, masterW, masterH, padX, padY);
  rebuildEdgeSpatialIndex(workPayload.stroke_data);

  STATE.serverImages = rawImgs;
  STATE.layers = {};

  for (const def of LAYER_DEFINITIONS) {
    const baseCanvas = createCanvas(masterW, masterH);
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
      ["brush_edge", "brush_dots", "brush_ellipse", "brush_ellipse_dark", "mask_blur", "accent"].includes(
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
  if (STATE.layers.glow) {
    rerenderLiveGlowLayer(true);
  }

  STATE.viewRect = computeMasterViewRect(STATE.aspectRatioKey, STATE.aspectOrientation);
  displayCanvas.width = STATE.viewRect.w;
  displayCanvas.height = STATE.viewRect.h;

  invalidateStack();
  renderLayerListUI();
  selectLayer(STATE.selectedLayerId || "bg_brush");
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