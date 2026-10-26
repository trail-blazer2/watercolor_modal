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
const IS_MOBILE =
  typeof window !== "undefined" &&
  (window.innerWidth <= 960 || /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent));

const OVERSCAN_PAD = 400;
const OVERSCAN_PAD_X = 500;
const OVERSCAN_PAD_Y = 300;

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
  presetCache: new Map(),      // Lightweight compressed payload cache (~1.5 MB/preset)
  presetUserEdits: new Map(),  // Remembers per-preset layer slider/visibility tweaks
  bgFetchPromises: new Map(),
  uploadSessionId: 0,
  aspectRatioKey: "a4",
  aspectOrientation: null,
  uncroppedPlacement: null,
  viewRect: { x: OVERSCAN_PAD, y: OVERSCAN_PAD, w: 1260, h: 1782 },
  subjectTransform: { dx: 0, dy: 0, scale: 1.0 },
  hasViewportPosition: false,
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

const BRUSH_CACHE_KEY = "wc_cached_brushes_v5";

// ============================================================================
// 4. PRE-WARMER, PROGRESS BAR & LIGHTWEIGHT BRUSH CACHE
// ============================================================================
let _pickerKeepAliveTimer = null;
let _progressTimer = null;

window.addEventListener("DOMContentLoaded", () => {
  bindUIEvents();
  if (window.Workflow) Workflow.init();
  setTimeout(() => {
    prewarmModalServer();
    loadCachedBrushes();
  }, 600);
});

function prewarmModalServer() {
  fetch(`${STATE.apiUrl}/health`, { mode: "cors" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d && d.presets) STATE.serverPresets = d.presets;
    })
    .catch(() => {});
}

function startFilePickerPrewarm() {
  prewarmModalServer();
  loadCachedBrushes();
  if (!IS_MOBILE && window.SubjectVision && window.SubjectVision.init) {
    window.SubjectVision.init();
  }
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
  if (Object.keys(STATE.brushImages).length >= 9) return;
  try {
    const cachedStr = localStorage.getItem(BRUSH_CACHE_KEY);
    if (cachedStr) {
      const data = JSON.parse(cachedStr);
      for (const [name, b64] of Object.entries(data)) {
        STATE.brushImages[name] = await loadImage(b64);
      }
      invalidateGLBrushTextures();
      if (Object.keys(STATE.brushImages).length >= 9) return;
    }
  } catch (_) {}
  await fetchBrushTextures();
}

async function fetchBrushTextures() {
  if (Object.keys(STATE.brushImages).length >= 9) return;
  try {
    const res = await fetch(`${STATE.apiUrl}/brushes`);
    if (!res.ok) return;
    const data = await res.json();
    for (const [name, b64] of Object.entries(data)) {
      STATE.brushImages[name] = await loadImage(b64);
    }
    invalidateGLBrushTextures();
    try { localStorage.setItem(BRUSH_CACHE_KEY, JSON.stringify(data)); } catch (_) {}
  } catch (_) {}
}

function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  try {
    const comma = dataUrl.indexOf(",");
    const meta = dataUrl.slice(0, comma);
    const b64 = dataUrl.slice(comma + 1);
    const mime = (meta.match(/data:([^;]+)/) || [null, "image/webp"])[1];
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (_) {
    return null;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return reject(new Error("Empty image source"));
    let objectUrl = null;
    const img = new Image();

    if (src instanceof Blob) {
      objectUrl = URL.createObjectURL(src);
    } else if (typeof src === "string" && src.startsWith("data:")) {
      const blob = dataUrlToBlob(src);
      if (blob) objectUrl = URL.createObjectURL(blob);
    } else if (typeof src === "string" && src.startsWith("http")) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (e) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(e);
    };
    img.src = objectUrl || src;
  });
}

function createCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// ============================================================================
// 5. ASPECT RATIO PARSER & ZERO-JUMP VIEWPORT CROP
// ============================================================================

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
  }

  return orient === "landscape"
    ? { width: longSide, height: shortSide }
    : { width: shortSide, height: longSide };
}

function resolveActiveProfileKey() {
  const presetEl = document.getElementById("presetSelect");
  let presetKey = presetEl ? presetEl.value : "animals";
  if (presetKey === "auto" && STATE.payload && STATE.payload.preset_key) {
    presetKey = STATE.payload.preset_key;
  }
  if (presetKey.startsWith("cars")) return "car";
  if (presetKey === "people") return "person";
  return "animal";
}

// Computes the exact viewport crop rectangle inside Overscan Space while strictly preserving aspect ratio R
function computeViewRectInOverscanSpace(ratioVal, orientationOverride) {
  if (!STATE.payload || !STATE.payload.base_canvas_size) {
    return { x: OVERSCAN_PAD_X, y: OVERSCAN_PAD_Y, w: 1260, h: 1782 };
  }
  const [baseW, baseH] = STATE.payload.base_canvas_size;
  const [padX, padY] = STATE.payload.pad || [OVERSCAN_PAD_X, OVERSCAN_PAD_Y];
  const [overW, overH] = STATE.payload.canvas_size;

  const prof = resolveActiveProfileKey();
  const cm = parseAspectRatioToCm(ratioVal || STATE.aspectRatioKey, prof, orientationOverride);
  const R = cm.width / cm.height;

  const baseLong = Math.max(baseW, baseH);  // 1782
  const baseShort = Math.min(baseW, baseH); // 1260

  let viewW, viewH;
  if (R >= 1) {
    // Landscape: keep short side 1260, expand width by R (e.g. 2240x1260 for 16:9)
    viewH = baseShort;
    viewW = Math.round(viewH * R);
  } else {
    // Portrait: keep long side 1782, set width by R (e.g. 1002x1782 for 9:16) — never clamps into a square!
    viewH = baseLong;
    viewW = Math.round(viewH * R);
  }

  // Uniform safety scale if ever needed so aspect ratio R is 100% preserved
  const fitScale = Math.min(1, overW / Math.max(1, viewW), overH / Math.max(1, viewH));
  if (fitScale < 1) {
    viewW = Math.max(1, Math.round(viewW * fitScale));
    viewH = Math.max(1, Math.round(viewH * fitScale));
  }

  let viewX = Math.round(padX + (baseW - viewW) * 0.5);
  let viewY;
  if (prof === "car") {
    viewY = Math.round(padY + (baseH - viewH) * 0.5);
  } else {
    // Portrait bust: anchor bottom floor at padY + baseH
    viewY = Math.round(padY + baseH - viewH);
  }

  viewX = Math.max(0, Math.min(overW - viewW, viewX));
  viewY = Math.max(0, Math.min(overH - viewH, viewY));
  return { x: viewX, y: viewY, w: viewW, h: viewH };
}

function resizeDisplayCanvasKeepViewportPosition(newW, newH) {
  const oldW = displayCanvas.width || newW;
  const oldH = displayCanvas.height || newH;
  displayCanvas.width = newW;
  displayCanvas.height = newH;

  if (STATE.hasViewportPosition) {
    STATE.panX = Math.round(STATE.panX + ((oldW - newW) * 0.5) * STATE.zoom);
    STATE.panY = Math.round(STATE.panY + ((oldH - newH) * 0.5) * STATE.zoom);
    updateCanvasTransform();
  } else {
    fitCanvasToViewport();
  }
}

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

  STATE.viewRect = computeViewRectInOverscanSpace(STATE.aspectRatioKey, STATE.aspectOrientation);
  resizeDisplayCanvasKeepViewportPosition(STATE.viewRect.w, STATE.viewRect.h);

  if (typeof invalidateMoveFastStack === "function") invalidateMoveFastStack();
  invalidateStack();
  compositeAllLayers();
}

window.applyStudioAspectRatio = applyStudioAspectRatio;
window.changeStudioAspectRatio = applyStudioAspectRatio;
window.parseAspectRatioToCm = parseAspectRatioToCm;

// ============================================================================
// 6. UPLOAD, LIGHTWEIGHT PRESET MEMORY CACHE & GENERATION
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

function compactifyPayloadForCache(rawPayload) {
  if (!rawPayload) return null;
  if (rawPayload._isCompact) return rawPayload;

  unpackEdgesIfNeeded(rawPayload.stroke_data);
  const layerBlobs = {};
  if (rawPayload.layers) {
    for (const [k, b64] of Object.entries(rawPayload.layers)) {
      if (b64) layerBlobs[k] = b64 instanceof Blob ? b64 : dataUrlToBlob(b64);
    }
  }
  const maskBlob = rawPayload.mask_png
    ? (rawPayload.mask_png instanceof Blob ? rawPayload.mask_png : dataUrlToBlob(rawPayload.mask_png))
    : null;

  return {
    _isCompact: true,
    preset_key: rawPayload.preset_key,
    canvas_size: [...rawPayload.canvas_size],
    offset: [...rawPayload.offset],
    subject_size: [...rawPayload.subject_size],
    preset_settings: { ...rawPayload.preset_settings },
    average_color: rawPayload.average_color ? [...rawPayload.average_color] : null,
    dominant_color: rawPayload.dominant_color ? [...rawPayload.dominant_color] : null,
    elapsed_sec: rawPayload.elapsed_sec,
    timings: rawPayload.timings || {},
    maskBlob,
    layerBlobs,
    stroke_data: {
      edges: (rawPayload.stroke_data.edges || []).map((e) => [...e]),
      accent_candidates: (rawPayload.stroke_data.accent_candidates || []).map((c) => ({ ...c, color: [...c.color] })),
      accent_spots: (rawPayload.stroke_data.accent_spots || []).map((s) => ({ ...s, color: [...s.color] })),
    },
  };
}

function storePresetInMemoryCache(presetKey, compactPayload) {
  if (!presetKey || !compactPayload) return;
  if (STATE.presetCache.has(presetKey)) STATE.presetCache.delete(presetKey);
  STATE.presetCache.set(presetKey, compactPayload);
  const maxCached = IS_MOBILE ? 3 : 6;
  while (STATE.presetCache.size > maxCached) {
    const oldestKey = STATE.presetCache.keys().next().value;
    STATE.presetCache.delete(oldestKey);
  }
}

function saveCurrentPresetUserEdits() {
  if (!STATE.payload || !STATE.payload.preset_key || !STATE.layers) return;
  const key = STATE.payload.preset_key;
  const snapshot = {};
  for (const [id, lyr] of Object.entries(STATE.layers)) {
    snapshot[id] = {
      vis: lyr.vis,
      params: { ...lyr.params },
    };
  }
  STATE.presetUserEdits.set(key, snapshot);
}

const SIBLING_PRESETS = {
  animals: ["animals_black"],
  animals_black: ["animals"],
  people: ["animals"],
  cars: ["cars_black", "cars_color"],
  cars_black: ["cars", "cars_color"],
  cars_color: ["cars", "cars_black"],
};

async function fetchPresetPayloadFromServer(presetKey, useEditedMask) {
  // 1. POKUS O KLIENTSKÉ GENEROVÁNÍ (WatercolorEngine)
  try {
    await loadCachedBrushes();
    if (window.ClientWatercolorEngine && typeof window.ClientWatercolorEngine.generate === 'function') {
      const rawPayload = await window.ClientWatercolorEngine.generate(presetKey, useEditedMask);
      return compactifyPayloadForCache(rawPayload);
    }
  } catch (error) {
    console.warn("Klientský WatercolorEngine selhal, přecházím na server:", error);
    // Kód nepadá, try/catch zachytí chybu a funkce pokračuje na serverový fallback níže
  }

  // 2. SERVEROVÝ FALLBACK (Původní logika)
  const optimizedBlob = await prepareOptimizedUploadBlob(STATE.originalImg, presetKey);
  const formData = new FormData();
  formData.append("image_file", optimizedBlob, "upload.jpg");
  formData.append("preset_key", presetKey);

  if (useEditedMask && STATE.maskCanvas) {
    formData.append("mask_base64", STATE.maskCanvas.toDataURL("image/webp", 0.95));
  } else if (STATE.rawMaskBase64) {
    formData.append("raw_mask_base64", STATE.rawMaskBase64);
  }

  const res = await fetch(`${STATE.apiUrl}/generate`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Server returned status ${res.status}`);
  
  const rawPayload = JSON.parse(await res.text());
  if (rawPayload.raw_mask_png) {
    STATE.rawMaskBase64 = rawPayload.raw_mask_png;
    delete rawPayload.raw_mask_png;
  }
  
  return compactifyPayloadForCache(rawPayload);
}

function pregenerateSiblingPresetsInBackground(activePresetKey, sessionId) {
  if (IS_MOBILE) return;
  const siblings = (SIBLING_PRESETS[activePresetKey] || []).slice(0, 1);
  for (const sibKey of siblings) {
    if (STATE.presetCache.has(sibKey) || STATE.bgFetchPromises.has(sibKey)) continue;

    const p = fetchPresetPayloadFromServer(sibKey, Boolean(STATE.maskEditedByUser))
      .then((compactSib) => {
        if (STATE.uploadSessionId === sessionId && compactSib) {
          storePresetInMemoryCache(sibKey, compactSib);
        }
        return compactSib;
      })
      .catch(() => null)
      .finally(() => {
        STATE.bgFetchPromises.delete(sibKey);
      });

    STATE.bgFetchPromises.set(sibKey, p);
  }
}

async function runModalGeneration(useEditedMask = false, isPresetSwitch = false, isHistoryRestore = false) {
  if (!STATE.uploadedFile || !STATE.originalImg) return;
  stopFilePickerPrewarm();

  const presetKey = document.getElementById("presetSelect").value;
  const prevPresetKey = STATE.payload ? STATE.payload.preset_key : null;

  if (isPresetSwitch && !useEditedMask) {
    saveCurrentPresetUserEdits();
    if (!isHistoryRestore && prevPresetKey && prevPresetKey !== presetKey && History.recordPresetSwitch) {
      History.recordPresetSwitch(prevPresetKey, presetKey);
    }
  } else if (!isHistoryRestore) {
    STATE.uploadSessionId++;
    STATE.presetCache.clear();
    STATE.presetUserEdits.clear();
    STATE.bgFetchPromises.clear();
    STATE.maskEditedByUser = !!useEditedMask;
  }

  const currentSessionId = STATE.uploadSessionId;

  // Always show loading popup (including fast cached preset switches & undo/redo preset switches)
  startProgressBar(isPresetSwitch || isHistoryRestore);
  // Yield 2 animation frames so the browser paints the loading popup before synchronous canvas work begins
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const t0 = performance.now();
    let compactPayload = null;

    if ((isPresetSwitch || isHistoryRestore) && !useEditedMask) {
      if (STATE.presetCache.has(presetKey)) {
        compactPayload = STATE.presetCache.get(presetKey);
      } else if (STATE.bgFetchPromises.has(presetKey)) {
        compactPayload = await STATE.bgFetchPromises.get(presetKey);
      }
    }

    if (!compactPayload) {
      compactPayload = await fetchPresetPayloadFromServer(presetKey, useEditedMask);
    }

    if (currentSessionId === STATE.uploadSessionId && compactPayload) {
      storePresetInMemoryCache(compactPayload.preset_key || presetKey, compactPayload);
    }

    await initializeStudioFromPayload(compactPayload, isPresetSwitch || isHistoryRestore);
    const tDone = performance.now();

    console.table({
      "TOTAL_USER_WAIT_SEC": Number(((tDone - t0) / 1000).toFixed(2)),
      ...(compactPayload.timings || {}),
    });

    if (Object.keys(STATE.brushImages).length === 0) fetchBrushTextures();

    if (!IS_MOBILE) {
      setTimeout(() => {
        if (currentSessionId === STATE.uploadSessionId) {
          pregenerateSiblingPresetsInBackground(compactPayload.preset_key || presetKey, currentSessionId);
        }
      }, 250);
    }
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
  let minX = 0, minY = 0, maxX = 0, maxY = 0;

  const numChunks = Math.ceil(count / _EDGE_CHUNK_SIZE);
  const chunkMinX = new Int32Array(numChunks).fill(0x7fffffff);
  const chunkMaxX = new Int32Array(numChunks).fill(-0x7fffffff);
  const chunkMinY = new Int32Array(numChunks).fill(0x7fffffff);
  const chunkMaxY = new Int32Array(numChunks).fill(-0x7fffffff);

  for (let j = 0; j < count; j++) {
    const pt = edges[j];
    const x = pt[0] | 0;
    const y = pt[1] | 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
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
  strokeData.minX = minX;
  strokeData.minY = minY;
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
  delete strokeData.edges_flat;
  strokeData.edges = out;
  rebuildEdgeSpatialIndex(strokeData);
  return out;
}

function buildCleanSubjectFromRawAndTextured(rawImg, texCcImg, payload) {
  const [cw, ch] = payload.canvas_size;
  const [bx, by, bw, bh] = payload.full_subject_box || [
    Math.max(0, payload.offset[0]),
    Math.max(0, payload.offset[1]),
    payload.subject_size[0],
    payload.subject_size[1],
  ];

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

// ============================================================================
// 6A. EXACT 256-BIN LUT + CRISP OIL RELIEF + SEAMLESS EFFECT OVERSCAN
// ============================================================================

// Computes an exact 256-entry per-channel cumulative histogram LUT from rawImg -> targetImg (~1.5 ms)
function buildHistogramMatchLUT(rawImg, targetImg, baseW, baseH) {
  const sw = 240, sh = 240;
  const c1 = createCanvas(sw, sh);
  const ctx1 = c1.getContext("2d");
  ctx1.drawImage(rawImg, 0, 0, baseW, baseH, 0, 0, sw, sh);
  const d1 = ctx1.getImageData(0, 0, sw, sh).data;

  const c2 = createCanvas(sw, sh);
  const ctx2 = c2.getContext("2d");
  ctx2.drawImage(targetImg, 0, 0, baseW, baseH, 0, 0, sw, sh);
  const d2 = ctx2.getImageData(0, 0, sw, sh).data;

  const hist1R = new Uint32Array(256), hist1G = new Uint32Array(256), hist1B = new Uint32Array(256);
  const hist2R = new Uint32Array(256), hist2G = new Uint32Array(256), hist2B = new Uint32Array(256);
  let count = 0;

  for (let i = 0; i < d1.length; i += 4) {
    if (d1[i + 3] < 220 || d2[i + 3] < 220) continue;
    hist1R[d1[i]]++; hist1G[d1[i + 1]]++; hist1B[d1[i + 2]]++;
    hist2R[d2[i]]++; hist2G[d2[i + 1]]++; hist2B[d2[i + 2]]++;
    count++;
  }

  const makeChannelLUT = (h1, h2) => {
    const lut = new Uint8Array(256);
    if (count < 30) {
      for (let v = 0; v < 256; v++) lut[v] = v;
      return lut;
    }
    const cdf1 = new Float64Array(256);
    const cdf2 = new Float64Array(256);
    let s1 = 0, s2 = 0;
    for (let v = 0; v < 256; v++) {
      s1 += h1[v];
      s2 += h2[v];
      cdf1[v] = s1 / count;
      cdf2[v] = s2 / count;
    }
    let j = 0;
    for (let v = 0; v < 256; v++) {
      const p = cdf1[v];
      while (j < 255 && cdf2[j] < p) j++;
      lut[v] = j;
    }
    // Light 3-tap smoothing on LUT so quantization never bands
    const sm = new Uint8Array(256);
    sm[0] = lut[0];
    sm[255] = lut[255];
    for (let v = 1; v < 255; v++) {
      sm[v] = (lut[v - 1] + lut[v] * 2 + lut[v + 1] + 2) >> 2;
    }
    return sm;
  };

  return {
    r: makeChannelLUT(hist1R, hist2R),
    g: makeChannelLUT(hist1G, hist2G),
    b: makeChannelLUT(hist1B, hist2B),
  };
}

function applyRGBLutToCutout(cutoutCanvas, lut) {
  const w = cutoutCanvas.width, h = cutoutCanvas.height;
  const outC = createCanvas(w, h);
  const ctx = outC.getContext("2d");
  ctx.drawImage(cutoutCanvas, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const { r: lr, g: lg, b: lb } = lut;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] = lr[d[i]];
    d[i + 1] = lg[d[i + 1]];
    d[i + 2] = lb[d[i + 2]];
  }
  ctx.putImageData(img, 0, 0);
  return outC;
}

// Generates a true painterly oil finish (smooth base + zero-mean band-pass oil ridges + subtle directional relief)
// without shifting shadow or midtone brightness by even 1 level
function buildOilStyledUncroppedCutout(lutMatchedCutout) {
  const w = lutMatchedCutout.width, h = lutMatchedCutout.height;
  const outC = createCanvas(w, h);
  const ctx = outC.getContext("2d");

  // 1. Fine-feature canvas (1px smooth to remove sensor grain)
  const fineC = createCanvas(w, h);
  const fCtx = fineC.getContext("2d");
  fCtx.filter = "blur(1px)";
  fCtx.drawImage(lutMatchedCutout, 0, 0);
  const fineData = fCtx.getImageData(0, 0, w, h).data;

  // 2. Broad painterly base canvas (3.2px smooth for oil brush body)
  const smoothC = createCanvas(w, h);
  const sCtx = smoothC.getContext("2d");
  sCtx.filter = "blur(3.2px)";
  sCtx.drawImage(lutMatchedCutout, 0, 0);
  const sImg = sCtx.getImageData(0, 0, w, h);
  const sData = sImg.data;

  // 3. Original alpha & pixel data so silhouette edges stay 100% crisp
  const origC = createCanvas(w, h);
  origC.getContext("2d").drawImage(lutMatchedCutout, 0, 0);
  const origData = origC.getContext("2d").getImageData(0, 0, w, h).data;

  const ridgeGain = 1.45;
  const embossGain = 0.35;
  const stride = w * 4;

  for (let y = 1; y < h - 1; y++) {
    const row = y * stride;
    for (let x = 1; x < w - 1; x++) {
      const p = row + x * 4;
      const a = origData[p + 3];
      if (a === 0) {
        sData[p + 3] = 0;
        continue;
      }

      // If near transparent silhouette border, use unblurred LUT color so edge never halos
      const aL = origData[p - 4 + 3], aR = origData[p + 4 + 3];
      const aU = origData[p - stride + 3], aD = origData[p + stride + 3];
      if (aL < 220 || aR < 220 || aU < 220 || aD < 220) {
        sData[p] = origData[p];
        sData[p + 1] = origData[p + 1];
        sData[p + 2] = origData[p + 2];
        sData[p + 3] = a;
        continue;
      }

      // Zero-mean directional emboss + band-pass oil bristle ridge
      const pNW = p - stride - 4;
      const pSE = p + stride + 4;
      const emboss =
        ((fineData[pSE] - fineData[pNW]) +
         (fineData[pSE + 1] - fineData[pNW + 1]) +
         (fineData[pSE + 2] - fineData[pNW + 2])) * 0.333 * embossGain;

      const r = sData[p] + (fineData[p] - sData[p]) * ridgeGain + emboss;
      const g = sData[p + 1] + (fineData[p + 1] - sData[p + 1]) * ridgeGain + emboss;
      const b = sData[p + 2] + (fineData[p + 2] - sData[p + 2]) * ridgeGain + emboss;

      sData[p] = r < 0 ? 0 : r > 255 ? 255 : r | 0;
      sData[p + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
      sData[p + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
      sData[p + 3] = a;
    }
  }

  ctx.putImageData(sImg, 0, 0);
  return outC;
}

function buildOverscanServerImages(decodedImgs, workPayload, origOffset, baseW, baseH, overW, overH, padX, padY) {
  const up = STATE.uncroppedPlacement;
  const hasUncropped = !!(
    up &&
    up.cutoutCanvas &&
    up.sourceCanvas &&
    up.refSize &&
    up.refSize[0] > 0 &&
    up.refSize[1] > 0
  );

  const [origOffX, origOffY] = origOffset || [0, 0];
  const [subW, subH] = workPayload.subject_size || [baseW, baseH];

  // Where the server placed STATE.originalImg (`framedPhotoC`) in Overscan Space:
  const imgBoxX = padX + origOffX;
  const imgBoxY = padY + origOffY;
  const imgBoxW = subW;
  const imgBoxH = subH;

  // Actual non-clipped bounding box of server images inside [padX, padY, baseW, baseH]:
  const validX0 = Math.max(padX, imgBoxX);
  const validY0 = Math.max(padY, imgBoxY);
  const validX1 = Math.min(padX + baseW, imgBoxX + imgBoxW);
  const validY1 = Math.min(padY + baseH, imgBoxY + imgBoxH);
  const validW = Math.max(1, validX1 - validX0);
  const validH = Math.max(1, validY1 - validY0);

  // Exact mapping of the uncropped subject `up.cutoutCanvas` into Overscan Space:
  const scaleX = hasUncropped ? imgBoxW / up.refSize[0] : 1;
  const scaleY = hasUncropped ? imgBoxH / up.refSize[1] : 1;
  const fullX = hasUncropped ? Math.round(imgBoxX + up.px.x * scaleX) : imgBoxX;
  const fullY = hasUncropped ? Math.round(imgBoxY + up.px.y * scaleY) : imgBoxY;
  const fullW = hasUncropped ? Math.round(up.px.w * scaleX) : imgBoxW;
  const fullH = hasUncropped ? Math.round(up.px.h * scaleY) : imgBoxH;

  workPayload._overscanFullRect = {
    fullX, fullY, fullW, fullH,
    serverBoxX: validX0,
    serverBoxY: validY0,
    serverBoxW: validW,
    serverBoxH: validH,
  };

  const extX0 = Math.max(0, Math.min(validX0, fullX));
  const extY0 = Math.max(0, Math.min(validY0, fullY));
  const extX1 = Math.min(overW, Math.max(validX1, fullX + fullW));
  const extY1 = Math.min(overH, Math.max(validY1, fullY + fullH));
  workPayload.full_subject_box = [extX0, extY0, Math.max(1, extX1 - extX0), Math.max(1, extY1 - extY0)];

  let ccUncropped = null;
  let oilUncropped = null;
  if (hasUncropped && decodedImgs.subject_raw && decodedImgs.subject_cc) {
    const ccLut = buildHistogramMatchLUT(decodedImgs.subject_raw, decodedImgs.subject_cc, baseW, baseH);
    ccUncropped = applyRGBLutToCutout(up.cutoutCanvas, ccLut);
  }
  if (hasUncropped && decodedImgs.subject_raw && decodedImgs.oil_paint_full) {
    const oilLut = buildHistogramMatchLUT(decodedImgs.subject_raw, decodedImgs.oil_paint_full, baseW, baseH);
    const oilToned = applyRGBLutToCutout(up.cutoutCanvas, oilLut);
    oilUncropped = buildOilStyledUncroppedCutout(oilToned);
  } else if (ccUncropped) {
    oilUncropped = buildOilStyledUncroppedCutout(ccUncropped);
  }

  const liftSubjectLayer = (serverImg, overscanFillCanvas) => {
    if (!serverImg) return null;
    const c = createCanvas(overW, overH);
    const ctx = c.getContext("2d");

    ctx.drawImage(serverImg, padX, padY, baseW, baseH);

    if (overscanFillCanvas && hasUncropped) {
      const clipLeft = fullX < validX0 - 1;
      const clipRight = fullX + fullW > validX1 + 1;
      const clipTop = fullY < validY0 - 1;
      const clipBottom = fullY + fullH > validY1 + 1;

      if (clipLeft || clipRight || clipTop || clipBottom) {
        const feather = 64;
        const trim = 3;
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";

        if (clipLeft) {
          const g = ctx.createLinearGradient(validX0 + trim, 0, validX0 + trim + feather, 0);
          g.addColorStop(0, "rgba(0,0,0,1)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, validX0 + trim + feather, overH);
        }
        if (clipRight) {
          const rx = validX1 - trim;
          const g = ctx.createLinearGradient(rx - feather, 0, rx, 0);
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(1, "rgba(0,0,0,1)");
          ctx.fillStyle = g;
          ctx.fillRect(rx - feather, 0, overW - (rx - feather), overH);
        }
        if (clipTop) {
          const g = ctx.createLinearGradient(0, validY0 + trim, 0, validY0 + trim + feather);
          g.addColorStop(0, "rgba(0,0,0,1)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, overW, validY0 + trim + feather);
        }
        if (clipBottom) {
          const by = validY1 - trim;
          const g = ctx.createLinearGradient(0, by - feather, 0, by);
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(1, "rgba(0,0,0,1)");
          ctx.fillStyle = g;
          ctx.fillRect(0, by - feather, overW, overH - (by - feather));
        }
        ctx.restore();

        // Draw overscanFillCanvas ONLY in the outer border regions that were actually clipped by the frame
        // so it NEVER adds an untrimmed halo around the subject inside the frame!
        ctx.save();
        ctx.beginPath();
        if (clipLeft) ctx.rect(0, 0, validX0 + trim + feather, overH);
        if (clipRight) ctx.rect(validX1 - trim - feather, 0, overW - (validX1 - trim - feather), overH);
        if (clipTop) ctx.rect(0, 0, overW, validY0 + trim + feather);
        if (clipBottom) ctx.rect(0, validY1 - trim - feather, overW, overH - (validY1 - trim - feather));
        ctx.clip();
        ctx.globalCompositeOperation = "destination-over";
        ctx.drawImage(overscanFillCanvas, fullX, fullY, fullW, fullH);
        ctx.restore();
      }
    }
    return c;
  };

  const out = {};
  for (const [key, img] of Object.entries(decodedImgs)) {
    if (!img) continue;
    if (key === "bg_paper") {
      out[key] = img;
    } else if (key === "subject_raw") {
      out[key] = liftSubjectLayer(img, hasUncropped ? up.cutoutCanvas : null);
    } else if (key === "subject_cc") {
      out[key] = liftSubjectLayer(img, ccUncropped || (hasUncropped ? up.cutoutCanvas : null));
    } else if (key === "oil_paint_full") {
      out[key] = liftSubjectLayer(img, oilUncropped || ccUncropped || (hasUncropped ? up.cutoutCanvas : null));
    } else if (key === "edge_curve") {
      out[key] = liftSubjectLayer(img, ccUncropped || (hasUncropped ? up.cutoutCanvas : null));
    } else if (key === "blur_bg") {
      out[key] = buildSeamlessOverscanBlurBg(img, baseW, baseH, overW, overH, padX, padY);
    } else if (key === "shadow" || key === "colordrop") {
      out[key] = buildSeamlessOverscanEffectLayer(img, baseW, baseH, overW, overH, padX, padY, key);
    } else {
      const c = createCanvas(overW, overH);
      c.getContext("2d").drawImage(img, padX, padY, baseW, baseH);
      out[key] = c;
    }
  }
  return out;
}

function buildSeamlessOverscanBlurBg(blurImg, baseW, baseH, overW, overH, padX, padY) {
  const rawC = createCanvas(overW, overH);
  const rCtx = rawC.getContext("2d");
  const edgeStrip = 4;

  rCtx.drawImage(blurImg, 0, 0, edgeStrip, edgeStrip, 0, 0, padX + 2, padY + 2);
  rCtx.drawImage(blurImg, baseW - edgeStrip, 0, edgeStrip, edgeStrip, padX + baseW - 2, 0, padX + 2, padY + 2);
  rCtx.drawImage(blurImg, 0, baseH - edgeStrip, edgeStrip, edgeStrip, 0, padY + baseH - 2, padX + 2, padY + 2);
  rCtx.drawImage(blurImg, baseW - edgeStrip, baseH - edgeStrip, edgeStrip, edgeStrip, padX + baseW - 2, padY + baseH - 2, padX + 2, padY + 2);

  rCtx.drawImage(blurImg, 0, 0, baseW, edgeStrip, padX, 0, baseW, padY + 2);
  rCtx.drawImage(blurImg, 0, baseH - edgeStrip, baseW, edgeStrip, padX, padY + baseH - 2, baseW, padY + 2);
  rCtx.drawImage(blurImg, 0, 0, edgeStrip, baseH, 0, padY, padX + 2, baseH);
  rCtx.drawImage(blurImg, baseW - edgeStrip, 0, edgeStrip, baseH, padX + baseW - 2, padY, padX + 2, baseH);
  rCtx.drawImage(blurImg, padX, padY, baseW, baseH);

  const outC = createCanvas(overW, overH);
  const oCtx = outC.getContext("2d");
  oCtx.drawImage(rawC, 0, 0);
  oCtx.save();
  oCtx.filter = "blur(36px)";
  oCtx.drawImage(rawC, 0, 0);
  oCtx.restore();

  oCtx.drawImage(blurImg, padX, padY, baseW, baseH);
  return outC;
}

// Seamlessly extends `shadow` and `colordrop` beyond [padX, padY, baseW, baseH] if they touch the frame edges
function buildSeamlessOverscanEffectLayer(effectImg, baseW, baseH, overW, overH, padX, padY, kind) {
  const outC = createCanvas(overW, overH);
  const ctx = outC.getContext("2d");

  const extC = createCanvas(overW, overH);
  const eCtx = extC.getContext("2d");
  const reach = kind === "shadow" ? 260 : 190;
  const strip = kind === "shadow" ? 18 : 96;

  // Left & Right extensions
  eCtx.save();
  eCtx.translate(padX + 2, padY);
  eCtx.scale(-1, 1);
  eCtx.drawImage(effectImg, 0, 0, strip, baseH, 0, 0, reach, baseH);
  eCtx.restore();

  eCtx.save();
  eCtx.translate(padX + baseW - 2 + reach, padY);
  eCtx.scale(-1, 1);
  eCtx.drawImage(effectImg, baseW - strip, 0, strip, baseH, 0, 0, reach, baseH);
  eCtx.restore();

  // Bottom extension
  eCtx.save();
  eCtx.translate(padX, padY + baseH - 2 + reach);
  eCtx.scale(1, -1);
  eCtx.drawImage(effectImg, 0, baseH - strip, baseW, strip, 0, 0, baseW, reach);
  eCtx.restore();

  // Soften and fade the extended margins outward from the [padX, padY, baseW, baseH] box
  const blurredExt = createCanvas(overW, overH);
  const bCtx = blurredExt.getContext("2d");
  bCtx.save();
  bCtx.filter = kind === "shadow" ? "blur(18px)" : "blur(4px)";
  bCtx.drawImage(extC, 0, 0);
  bCtx.restore();

  // Fade outer edges of the extension to 0% alpha so it tapers off naturally
  bCtx.save();
  bCtx.globalCompositeOperation = "destination-in";
  // Horizontal fade mask
  const hMask = createCanvas(overW, overH);
  const hmCtx = hMask.getContext("2d");
  const gL = hmCtx.createLinearGradient(Math.max(0, padX - reach), 0, padX, 0);
  gL.addColorStop(0, "rgba(0,0,0,0)");
  gL.addColorStop(1, "rgba(0,0,0,1)");
  hmCtx.fillStyle = gL;
  hmCtx.fillRect(0, 0, padX, overH);

  hmCtx.fillStyle = "rgba(0,0,0,1)";
  hmCtx.fillRect(padX, 0, baseW, overH);

  const gR = hmCtx.createLinearGradient(padX + baseW, 0, Math.min(overW, padX + baseW + reach), 0);
  gR.addColorStop(0, "rgba(0,0,0,1)");
  gR.addColorStop(1, "rgba(0,0,0,0)");
  hmCtx.fillStyle = gR;
  hmCtx.fillRect(padX + baseW, 0, overW - (padX + baseW), overH);

  // Vertical bottom fade mask
  const gB = hmCtx.createLinearGradient(0, padY + baseH, 0, Math.min(overH, padY + baseH + reach));
  gB.addColorStop(0, "rgba(0,0,0,1)");
  gB.addColorStop(1, "rgba(0,0,0,0)");
  hmCtx.globalCompositeOperation = "destination-in";
  const vMask = createCanvas(overW, overH);
  const vmCtx = vMask.getContext("2d");
  vmCtx.fillStyle = "rgba(0,0,0,1)";
  vmCtx.fillRect(0, 0, overW, padY + baseH);
  vmCtx.fillStyle = gB;
  vmCtx.fillRect(0, padY + baseH, overW, overH - (padY + baseH));
  hmCtx.drawImage(vMask, 0, 0);

  bCtx.drawImage(hMask, 0, 0);
  bCtx.restore();

  // Clear interior of blurredExt so original [padX, padY, baseW, baseH] stays 100% untouched
  bCtx.clearRect(padX + 2, padY + 2, baseW - 4, baseH - 4);

  ctx.drawImage(blurredExt, 0, 0);
  ctx.drawImage(effectImg, padX, padY, baseW, baseH);
  return outC;
}

function appendOverscanEdges(workPayload, overW, overH) {
  const up = STATE.uncroppedPlacement;
  const rect = workPayload._overscanFullRect;
  if (!up || !up.sourceCanvas || !up.maskCanvas || !rect) return;

  const sd = workPayload.stroke_data;
  if (!sd || !sd.edges) return;

  const { fullX, fullY, fullW, fullH, serverBoxX, serverBoxY, serverBoxW, serverBoxH } = rect;
  const [offX, offY] = workPayload.offset;
  const scaleDown = 4;
  const gw = Math.round(overW / scaleDown);
  const gh = Math.round(overH / scaleDown);

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

  const ix0 = Math.floor(serverBoxX / scaleDown);
  const ix1 = Math.ceil((serverBoxX + serverBoxW) / scaleDown);
  const iy0 = Math.floor(serverBoxY / scaleDown);
  const iy1 = Math.ceil((serverBoxY + serverBoxH) / scaleDown);

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

      const canvasX = x * scaleDown;
      const canvasY = y * scaleDown;
      sd.edges.push([canvasX - offX, canvasY - offY, nx, ny, pData[idx], pData[idx + 1], pData[idx + 2], 1]);
    }
  }
}

// Stream-decodes only the required server raster layers one-by-one so RAM never spikes
async function decodeAndBuildOverscanServerImages(
  layerBlobs,
  workPayload,
  origOffset,
  baseW,
  baseH,
  overW,
  overH,
  padX,
  padY
) {
  if (!layerBlobs) return {};
  const cfg = workPayload.preset_settings || {};

  // Only decode raster layers that are actually used (procedural brush layers are built from stroke_data!)
  const neededKeys = ["bg_paper", "subject_raw", "subject_cc"];
  if (cfg.MASK_BRUSH_ENABLED !== false) neededKeys.push("blur_bg");
  if (cfg.OIL_PAINT_ENABLED !== false) neededKeys.push("oil_paint_full");
  if (cfg.EDGE_CURVE_ENABLED) neededKeys.push("edge_curve");
  if (cfg.SHADOW_BRUSH_ENABLED) neededKeys.push("shadow");
  if (cfg.COLORDROP_BRUSH_ENABLED) neededKeys.push("colordrop");

  const decodedImgs = {};
  for (const key of neededKeys) {
    const blob = layerBlobs[key];
    if (blob) {
      decodedImgs[key] = await loadImage(blob);
    }
  }

  const rawImgs = buildOverscanServerImages(
    decodedImgs,
    workPayload,
    origOffset,
    baseW,
    baseH,
    overW,
    overH,
    padX,
    padY
  );

  // Immediately release temporary HTMLImageElements (except bg_paper which is kept at native size)
  for (const [key, img] of Object.entries(decodedImgs)) {
    if (key !== "bg_paper" && img) {
      try { img.src = ""; } catch (_) {}
    }
  }
  return rawImgs;
}

// On-demand decoder if the user toggles on a disabled raster layer (like edge_curve) later in the session
async function ensureServerRasterLayerDecoded(layerId) {
  if (!STATE.payload || !STATE.ServerLayerBlobs) return;
  if (STATE.serverImages && STATE.serverImages[layerId]) return;
  const blob = STATE.ServerLayerBlobs[layerId];
  if (!blob) return;

  const [baseW, baseH] = STATE.payload.base_canvas_size;
  const [padX, padY] = STATE.payload.pad;
  const [overW, overH] = STATE.payload.canvas_size;
  const origOffset = [STATE.payload.offset[0] - padX, STATE.payload.offset[1] - padY];

  const img = await loadImage(blob);
  const partial = buildOverscanServerImages(
    { [layerId]: img },
    STATE.payload,
    origOffset,
    baseW,
    baseH,
    overW,
    overH,
    padX,
    padY
  );
  try { img.src = ""; } catch (_) {}
  if (partial[layerId]) {
    STATE.serverImages[layerId] = partial[layerId];
  }
}

async function initializeStudioFromPayload(sourcePayload, isPresetSwitch = false) {
  cancelPendingSchedules();
  if (!isPresetSwitch) {
    History.clear();
    STATE.subjectTransform = { dx: 0, dy: 0, scale: 1.0 };
  }
  if (typeof releaseMoveFastStack === "function") releaseMoveFastStack();
  else if (typeof invalidateMoveFastStack === "function") invalidateMoveFastStack();
  invalidateStack();
  _sampleCache.clear();
  _ellipseGeomCache.clear();
  STATE.oilDetailCache = null;
  STATE.edgeCurveCache = null;
  STATE.glowCache = null;
  destroyGLEdgeCurveResources();
  _blurTmpA = new Float32Array(0);
  _colSumA = new Float32Array(0);

  // Free previous session canvases explicitly before allocating new ones
  if (STATE.serverImages) {
    for (const k of Object.keys(STATE.serverImages)) {
      const c = STATE.serverImages[k];
      if (c && c.tagName === "CANVAS") { c.width = 1; c.height = 1; }
    }
    STATE.serverImages = {};
  }
  if (STATE.layers) {
    for (const lyr of Object.values(STATE.layers)) {
      if (lyr.baseCanvas) { lyr.baseCanvas.width = 1; lyr.baseCanvas.height = 1; lyr.baseCanvas = null; }
    }
  }

  const compact = compactifyPayloadForCache(sourcePayload);
  const [baseW, baseH] = compact.canvas_size;
  const padX = OVERSCAN_PAD_X;
  const padY = OVERSCAN_PAD_Y;
  const overW = baseW + padX * 2;
  const overH = baseH + padY * 2;

  const workPayload = {
    preset_key: compact.preset_key,
    base_canvas_size: [baseW, baseH],
    pad: [padX, padY],
    canvas_size: [overW, overH],
    offset: [compact.offset[0] + padX, compact.offset[1] + padY],
    subject_size: [...compact.subject_size],
    preset_settings: { ...compact.preset_settings },
    average_color: compact.average_color ? [...compact.average_color] : null,
    dominant_color: compact.dominant_color ? [...compact.dominant_color] : null,
    elapsed_sec: compact.elapsed_sec,
    stroke_data: {
      edges: compact.stroke_data.edges.map((e) => [...e]),
      accent_candidates: compact.stroke_data.accent_candidates.map((c) => ({
        ...c,
        x: c.x + padX,
        y: c.y + padY,
        color: [...c.color],
      })),
      accent_spots: compact.stroke_data.accent_spots.map((s) => ({
        ...s,
        x: s.x + padX,
        y: s.y + padY,
        color: [...s.color],
      })),
    },
  };

  STATE.payload = workPayload;
  STATE.ServerLayerBlobs = compact.layerBlobs || {};

  document.getElementById("emptyState").classList.add("hidden");
  canvasContainer.classList.remove("hidden");
  document.getElementById("maskModeBtn").disabled = false;
  const moveSubBtn = document.getElementById("moveSubjectToolBtn");
  if (moveSubBtn) moveSubBtn.disabled = false;
  if (typeof syncMoveSubjectUI === "function") syncMoveSubjectUI();
  document.getElementById("exportPngBtn").disabled = false;
  document.getElementById("exportJpgBtn").disabled = false;
  document.getElementById("resetLayerBtn").disabled = false;
  document.getElementById("renderTimeBadge").textContent = `⚡ ${compact.elapsed_sec}s`;

  if (compact.average_color) {
    const hex = rgbToHex(...compact.average_color);
    const sw = document.getElementById("avgColorSwatch");
    sw.style.background = hex; sw.dataset.color = hex;
  }
  if (compact.dominant_color) {
    const hex = rgbToHex(...compact.dominant_color);
    const sw = document.getElementById("domColorSwatch");
    sw.style.background = hex; sw.dataset.color = hex;
  }

  if (compact.maskBlob) {
    const maskImg = await loadImage(compact.maskBlob);
    STATE.maskCanvas = createCanvas(maskImg.width, maskImg.height);
    STATE.maskCanvas.getContext("2d", { willReadFrequently: true }).drawImage(maskImg, 0, 0);
    try { maskImg.src = ""; } catch (_) {}
    markMaskOverlayDirty();
  }

  const rawImgs = await decodeAndBuildOverscanServerImages(
    compact.layerBlobs,
    workPayload,
    compact.offset,
    baseW,
    baseH,
    overW,
    overH,
    padX,
    padY
  );

  const cfg = workPayload.preset_settings;
  if (cfg.WATERCOLOR_TEXTURE_ENABLED && !rawImgs.subject_tex && rawImgs.subject_cc && rawImgs.subject_raw) {
    rawImgs.subject_tex = rawImgs.subject_cc;
    rawImgs.subject_cc = buildCleanSubjectFromRawAndTextured(rawImgs.subject_raw, rawImgs.subject_tex, workPayload);
  }

  appendOverscanEdges(workPayload, overW, overH);
  // Free redundant 21.5 MB subject_raw canvas (it will be decoded on-demand from ServerLayerBlobs if ccBlend < 100)
  if (rawImgs.subject_raw) {
    if (rawImgs.subject_raw.tagName === "CANVAS") {
      rawImgs.subject_raw.width = 1;
      rawImgs.subject_raw.height = 1;
    }
    delete rawImgs.subject_raw;
  }

  // Free Step 2 temporary canvases (~30 MB) now that overscan layers and edges are built
  if (STATE.uncroppedPlacement) {
    for (const k of ["sourceCanvas", "maskCanvas", "cutoutCanvas"]) {
      const c = STATE.uncroppedPlacement[k];
      if (c && c.tagName === "CANVAS") { c.width = 1; c.height = 1; }
      STATE.uncroppedPlacement[k] = null;
    }
  }
  rebuildEdgeSpatialIndex(workPayload.stroke_data);

  STATE.serverImages = rawImgs;
  STATE.viewRect = computeViewRectInOverscanSpace(STATE.aspectRatioKey, STATE.aspectOrientation);
  resizeDisplayCanvasKeepViewportPosition(STATE.viewRect.w, STATE.viewRect.h);

  const savedEdits = STATE.presetUserEdits.get(compact.preset_key);
  STATE.layers = {};

  for (const def of LAYER_DEFINITIONS) {
    let enabled = true;
    if (def.id === "mask_blur") {
      enabled = !!cfg.MASK_BRUSH_ENABLED;
    } else if (def.id === "subject") {
      enabled = !!cfg.SHOW_SUBJECT;
    } else if (def.id === "oil_paint") {
      enabled = !!cfg.OIL_PAINT_ENABLED;
    } else if (def.id === "bg_paper") {
      enabled = true;
    } else {
      const enKey = `${def.prefix}_ENABLED`;
      enabled = cfg[enKey] !== undefined ? !!cfg[enKey] : true;
    }

    const defaultParams = buildInitialLayerParams(def, cfg);
    if (savedEdits && savedEdits[def.id]) {
      enabled = savedEdits[def.id].vis;
      Object.assign(defaultParams, savedEdits[def.id].params);
    }

    let baseCanvas = null;
    if (enabled && ["edge_curve", "oil_paint", "glow"].includes(def.id)) {
      baseCanvas = createCanvas(overW, overH);
    }

    // Only keep origImage for true static effect layers (shadow, colordrop)
    const staticOrig = def.id === "shadow" || def.id === "colordrop" ? (rawImgs[def.id] || null) : null;

    STATE.layers[def.id] = {
      def,
      vis: enabled,
      origImage: staticOrig,
      baseCanvas,
      cachedStrokes: null,
      strokesDirty: true,
      paintCanvas: null,
      eraseCanvas: null,
      params: defaultParams,
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
  if (STATE.layers.edge_curve && STATE.layers.edge_curve.vis) {
    await ensureServerRasterLayerDecoded("edge_curve");
    rerenderLiveEdgeCurveLayer(true);
    freeEdgeCurveCpuUploadBuffers();
  }
  if (STATE.layers.oil_paint && STATE.layers.oil_paint.vis) {
    rerenderLiveOilLayer(true);
  }
  if (STATE.layers.glow && STATE.layers.glow.vis) {
    rerenderLiveGlowLayer(true);
  }

  // Free temporary blur scratch arrays after initialization
  _blurTmpA = new Float32Array(0);
  _colSumA = new Float32Array(0);

  invalidateStack();
  renderLayerListUI();
  selectLayer(STATE.selectedLayerId || "bg_brush");
  compositeAllLayers();
}

function freeEdgeCurveCpuUploadBuffers() {
  if (typeof _glEC !== "undefined" && _glEC && STATE.edgeCurveCache && _glEC.uploadedCache === STATE.edgeCurveCache) {
    STATE.edgeCurveCache.smoothRgba = null;
    STATE.edgeCurveCache.rawZonesRgba = null;
    STATE.edgeCurveCache.staticWeightsRgba = null;
    if (STATE.serverImages && STATE.serverImages.edge_curve) {
      if (STATE.serverImages.edge_curve.tagName === "CANVAS") {
        STATE.serverImages.edge_curve.width = 1;
        STATE.serverImages.edge_curve.height = 1;
      }
      STATE.serverImages.edge_curve = null;
    }
  }
}

function getOrCreatePaintCanvas(lyr, w, h) {
  if (!lyr.paintCanvas) lyr.paintCanvas = createCanvas(w, h);
  return lyr.paintCanvas;
}
function getOrCreateEraseCanvas(lyr, w, h) {
  if (!lyr.eraseCanvas) lyr.eraseCanvas = createCanvas(w, h);
  return lyr.eraseCanvas;
}