/**
 * 🎨 Watercolor Artist Studio — Real-Time 60 FPS Layer & Brush Engine
 * File 3 of 3: Complete Mobile & Desktop Studio Engine
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
  { id: "accent_strokes_2", name: "🔥 Accent Strokes (2nd pass)", group: "Under Subject", type: "effect", prefix: "ACCENT_STROKES" },
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
// 5. UI EVENTS & MOBILE BOTTOM SHEETS
// ============================================================================
function bindUIEvents() {
  const fileInput = document.getElementById("fileInput");
  const presetSelect = document.getElementById("presetSelect");

  document.querySelectorAll('label[for="fileInput"]').forEach((lbl) => {
    lbl.addEventListener("mousedown", startFilePickerPrewarm);
    lbl.addEventListener("touchstart", startFilePickerPrewarm, { passive: true });
  });

  fileInput.addEventListener("change", async (e) => {
    stopFilePickerPrewarm();
    const file = e.target.files[0];
    if (!file) return;
    STATE.uploadedFile = file;
    const url = URL.createObjectURL(file);
    STATE.originalImg = await loadImage(url);
    STATE.maskCanvas = null;
    STATE.rawMaskBase64 = null;
    runModalGeneration();
  });

  presetSelect.addEventListener("change", () => {
    if (STATE.uploadedFile) {
      runModalGeneration(false, true);
    }
  });

  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      setActiveTool(btn.dataset.tool);
    });
  });

  const sizeSlider = document.getElementById("manualBrushSize");
  sizeSlider.addEventListener("input", () => {
    document.getElementById("manualSizeVal").textContent = sizeSlider.value;
    updateCursorPreview();
  });

  const opSlider = document.getElementById("manualBrushOpacity");
  opSlider.addEventListener("input", () => {
    document.getElementById("manualOpacityVal").textContent = opSlider.value;
  });

  document.querySelectorAll(".swatch").forEach((sw) => {
    sw.addEventListener("click", () => {
      document.getElementById("manualBrushColor").value = sw.dataset.color;
    });
  });

  document.getElementById("maskKeepBtn").addEventListener("click", () => {
    STATE.maskModePaintKeep = true;
    document.getElementById("maskKeepBtn").className = "btn btn-sm btn-primary full-width";
    document.getElementById("maskRemoveBtn").className = "btn btn-sm btn-outline full-width";
  });

  document.getElementById("maskRemoveBtn").addEventListener("click", () => {
    STATE.maskModePaintKeep = false;
    document.getElementById("maskRemoveBtn").className = "btn btn-sm btn-primary full-width";
    document.getElementById("maskKeepBtn").className = "btn btn-sm btn-outline full-width";
  });

  document.getElementById("applyMaskRegenBtn").addEventListener("click", () => {
    setActiveTool("pan");
    closeMobileSheets();
    runModalGeneration(true);
  });

  document.getElementById("zoomInBtn").addEventListener("click", () => setZoom(STATE.zoom * 1.25));
  document.getElementById("zoomOutBtn").addEventListener("click", () => setZoom(STATE.zoom / 1.25));
  document.getElementById("zoomFitBtn").addEventListener("click", fitCanvasToViewport);

  document.getElementById("resetLayerBtn").addEventListener("click", () => {
    resetLayerToOriginal(STATE.selectedLayerId);
  });

  document.getElementById("exportPngBtn").addEventListener("click", () => exportImage("png"));
  document.getElementById("exportJpgBtn").addEventListener("click", () => exportImage("jpeg"));

  // Mobile Bottom Navigation & Sheet Controls
  document.querySelectorAll("[data-mobile-panel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchMobilePanel(btn.dataset.mobilePanel);
    });
  });

  document.querySelectorAll("[data-close-sheet]").forEach((btn) => {
    btn.addEventListener("click", closeMobileSheets);
  });

  window.addEventListener("resize", () => {
    if (STATE.payload) fitCanvasToViewport();
  });

  setupCanvasInteractions();
}

function switchMobilePanel(panel) {
  const left = document.getElementById("leftToolbar");
  const right = document.getElementById("rightInspector");
  const slidersSec = document.getElementById("slidersSection");
  const layersSec = document.getElementById("layersSection");

  document.querySelectorAll(".mobile-nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mobilePanel === panel);
  });

  if (panel === "canvas") {
    left.classList.remove("mobile-open");
    right.classList.remove("mobile-open");
  } else if (panel === "tools") {
    right.classList.remove("mobile-open");
    left.classList.add("mobile-open");
  } else if (panel === "sliders") {
    left.classList.remove("mobile-open");
    right.classList.add("mobile-open");
    slidersSec.classList.remove("hidden");
    if (window.innerWidth <= 960) layersSec.classList.add("hidden");
  } else if (panel === "layers") {
    left.classList.remove("mobile-open");
    right.classList.add("mobile-open");
    layersSec.classList.remove("hidden");
    if (window.innerWidth <= 960) slidersSec.classList.add("hidden");
  }
}

function closeMobileSheets() {
  document.getElementById("leftToolbar").classList.remove("mobile-open");
  document.getElementById("rightInspector").classList.remove("mobile-open");
  document.getElementById("slidersSection").classList.remove("hidden");
  document.getElementById("layersSection").classList.remove("hidden");
  document.querySelectorAll(".mobile-nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mobilePanel === "canvas");
  });
}

// ============================================================================
// 6. UPLOAD & GENERATION
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

async function runModalGeneration(useEditedMask = false, isPresetSwitch = false) {
  if (!STATE.uploadedFile || !STATE.originalImg) return;
  stopFilePickerPrewarm();
  startProgressBar(isPresetSwitch);

  try {
    const t0 = performance.now();
    const presetKey = document.getElementById("presetSelect").value;
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

    const rawText = await res.text();
    const payloadMB = (rawText.length / (1024 * 1024)).toFixed(2);
    const payload = JSON.parse(rawText);

    if (payload.raw_mask_png) {
      STATE.rawMaskBase64 = payload.raw_mask_png;
    }

    await initializeStudioFromPayload(payload);
    const tDone = performance.now();

    console.table({
      "TOTAL_USER_WAIT_SEC": Number(((tDone - t0) / 1000).toFixed(2)),
      "PAYLOAD_SIZE_MB": Number(payloadMB),
      ...(payload.timings || {}),
    });

    if (Object.keys(STATE.brushImages).length === 0) fetchBrushTextures();
  } catch (err) {
    alert("Error generating painting: " + err.message);
    console.error(err);
  } finally {
    finishProgressBar();
  }
}

function unpackEdgesIfNeeded(strokeData) {
  if (!strokeData) return [];
  if (strokeData.edges) return strokeData.edges;
  const flat = strokeData.edges_flat;
  if (!flat || !flat.length) return [];
  const out = [];
  for (let i = 0; i < flat.length; i += 8) {
    out.push([flat[i], flat[i+1], flat[i+2]/10000, flat[i+3]/10000, flat[i+4], flat[i+5], flat[i+6], flat[i+7]]);
  }
  strokeData.edges = out;
  return out;
}

async function initializeStudioFromPayload(payload) {
  invalidateStack();
  _sampleCache.clear();
  unpackEdgesIfNeeded(payload.stroke_data);
  STATE.payload = payload;
  const [w, h] = payload.canvas_size;
  displayCanvas.width = w;
  displayCanvas.height = h;

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

  const maskImg = await loadImage(payload.mask_png);
  STATE.maskCanvas = createCanvas(maskImg.width, maskImg.height);
  STATE.maskCanvas.getContext("2d").drawImage(maskImg, 0, 0);

  const rawImgs = {};
  await Promise.all(
    Object.entries(payload.layers).map(async ([key, b64]) => {
      if (b64) rawImgs[key] = await loadImage(b64);
    })
  );
  STATE.serverImages = rawImgs;

  const cfg = payload.preset_settings;
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

const _pendingRerender = new Set();
let _rafId = 0;
function scheduleRerender(layerId) {
  _pendingRerender.add(layerId);
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = 0;
    for (const id of _pendingRerender) rerenderProceduralLayer(id);
    _pendingRerender.clear();
  });
}

function buildInitialLayerParams(def, cfg) {
  const p = def.prefix;
  if (def.type === "brush_edge" || def.type === "brush_dots" || def.type === "brush_ellipse" || def.type === "brush_ellipse_dark") {
    return {
      opacity: cfg[`${p}_OPACITY`] ?? 0.6,
      baseOpacity: cfg[`${p}_OPACITY`] ?? 0.6,
      size: cfg[`${p}_SIZE`] ?? 600,
      spacing: cfg[`${p}_SPACING`] ?? 200,
      jiggle: cfg[`${p}_JIGGLE`] ?? cfg.BRUSH_DIRECTION_JIGGLE ?? 0.6,
      brightness: 100, contrast: 100, saturation: 100,
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
      brightness: 100, contrast: 100, saturation: 100,
      brushFile: cfg.MASK_BRUSH_FILE && cfg.MASK_BRUSH_FILE !== "square.png" ? cfg.MASK_BRUSH_FILE : "brush2.png",
    };
  }
  if (def.type === "accent") {
    return { opacity: 1.0, baseOpacity: 1.0, size: 300, spacing: 50, brightness: 100, contrast: 100, saturation: 100, brushFile: "bgbrush.png" };
  }
  if (def.type === "oil") {
    return { opacity: cfg.OIL_PAINT_OPACITY ?? 0.65, baseOpacity: 1.0, thickness: 0, detailPop: 0, brightness: 100, contrast: 100, saturation: 100 };
  }
  if (def.type === "subject") {
    return { opacity: 1.0, baseOpacity: 1.0, ccBlend: 100, brightness: 100, contrast: 100, saturation: 100 };
  }
  return { opacity: 1.0, baseOpacity: 1.0, brightness: 100, contrast: 100, saturation: 100 };
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
// 7. REAL-TIME COMPOSITOR (60 FPS)
// ============================================================================
const _tempLayerCanvas = document.createElement("canvas");
const _stack = { id: null, dirty: true, below: null, above: null };
function invalidateStack() { _stack.dirty = true; }

function drawLayerInto(ctx, def) {
  if (!def) return;
  const lyr = STATE.layers[def.id];
  if (!lyr || !lyr.vis) return;
  const p = lyr.params;
  const op = p.baseOpacity > 0 ? Math.min(2.5, p.opacity / p.baseOpacity) : p.opacity;
  if (op <= 0.001) return;
  const [w, h] = STATE.payload.canvas_size;
  if (_tempLayerCanvas.width !== w || _tempLayerCanvas.height !== h) {
    _tempLayerCanvas.width = w; _tempLayerCanvas.height = h;
  }
  const t = _tempLayerCanvas.getContext("2d");
  t.clearRect(0, 0, w, h);
  const f = p.brightness !== 100 || p.contrast !== 100 || p.saturation !== 100;
  t.filter = f ? `brightness(${p.brightness}%) contrast(${p.contrast}%) saturate(${p.saturation}%)` : "none";
  if (def.id === "subject" && p.ccBlend < 100 && STATE.serverImages.subject_raw) {
    t.drawImage(STATE.serverImages.subject_raw, 0, 0);
    t.globalAlpha = p.ccBlend / 100;
    t.drawImage(lyr.baseCanvas, 0, 0);
    t.globalAlpha = 1;
  } else {
    t.drawImage(lyr.baseCanvas, 0, 0);
  }
  t.filter = "none";
  if (lyr.paintCanvas) t.drawImage(lyr.paintCanvas, 0, 0);
  if (lyr.eraseCanvas) {
    t.globalCompositeOperation = "destination-out";
    t.drawImage(lyr.eraseCanvas, 0, 0);
    t.globalCompositeOperation = "source-over";
  }
  ctx.save();
  ctx.globalAlpha = Math.min(1, op);
  ctx.drawImage(_tempLayerCanvas, 0, 0);
  if (op > 1) { ctx.globalAlpha = Math.min(1, op - 1); ctx.drawImage(_tempLayerCanvas, 0, 0); }
  ctx.restore();
}

function rebuildStack(selId) {
  const [w, h] = STATE.payload.canvas_size;
  _stack.below = _stack.below || createCanvas(w, h);
  _stack.above = _stack.above || createCanvas(w, h);
  [_stack.below, _stack.above].forEach((c) => { c.width = w; c.height = h; });
  const bCtx = _stack.below.getContext("2d"), aCtx = _stack.above.getContext("2d");
  const selIdx = LAYER_DEFINITIONS.findIndex((d) => d.id === selId);
  for (let i = LAYER_DEFINITIONS.length - 1; i >= 0; i--) {
    if (i === selIdx) continue;
    drawLayerInto(i > selIdx ? bCtx : aCtx, LAYER_DEFINITIONS[i]);
  }
  _stack.id = selId; _stack.dirty = false;
}

function compositeAllLayers() {
  if (!STATE.payload) return;
  if (STATE.activeTool === "mask" && STATE.originalImg && STATE.maskCanvas) {
    renderMaskEditorView();
    return;
  }
  const [w, h] = STATE.payload.canvas_size;
  const sel = STATE.selectedLayerId;
  if (_stack.dirty || _stack.id !== sel) rebuildStack(sel);
  displayCtx.clearRect(0, 0, w, h);
  displayCtx.drawImage(_stack.below, 0, 0);
  drawLayerInto(displayCtx, LAYER_DEFINITIONS.find((d) => d.id === sel));
  displayCtx.drawImage(_stack.above, 0, 0);
}

// ============================================================================
// 8. PROCEDURAL BRUSH & OIL RE-RENDERERS
// ============================================================================
const _stampCanvas = document.createElement("canvas");
const _stampCtx = _stampCanvas.getContext("2d");

function colorizeAndDrawBrush(ctx, brushImg, x, y, size, angleDeg, rgbColor, opacity = 1.0) {
  if (!brushImg || size < 4) return;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bound = Math.ceil(size * (cos + sin)) + 4;

  if (_stampCanvas.width < bound || _stampCanvas.height < bound) {
    _stampCanvas.width = bound; _stampCanvas.height = bound;
  } else {
    _stampCtx.clearRect(0, 0, bound, bound);
  }

  _stampCtx.save();
  _stampCtx.translate(bound / 2, bound / 2);
  _stampCtx.rotate(-rad);
  _stampCtx.drawImage(brushImg, -size / 2, -size / 2, size, size);
  if (rgbColor) {
    _stampCtx.globalCompositeOperation = "source-in";
    _stampCtx.fillStyle = `rgb(${rgbColor[0]}, ${rgbColor[1]}, ${rgbColor[2]})`;
    _stampCtx.fillRect(-bound / 2, -bound / 2, bound, bound);
  }
  _stampCtx.restore();

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(_stampCanvas, 0, 0, bound, bound, Math.round(x - bound / 2), Math.round(y - bound / 2), bound, bound);
  ctx.restore();
}

const _sampleCache = new Map();
function sampleEdgePointsJS(edges, spacing) {
  if (!edges || edges.length === 0) return [];
  if (_sampleCache.has(spacing)) return _sampleCache.get(spacing);
  const s2 = spacing * spacing, cell = spacing / Math.SQRT2, W = 100000;
  const grid = new Map(), out = [];
  for (let i = 0; i < edges.length; i++) {
    const pt = edges[i], px = pt[0], py = pt[1];
    const gx = Math.floor(px / cell), gy = Math.floor(py / cell);
    let close = false;
    for (let dx = -2; dx <= 2 && !close; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const nb = grid.get((gx + dx) * W + (gy + dy));
        if (nb !== undefined) {
          const ex = px - nb[0], ey = py - nb[1];
          if (ex * ex + ey * ey < s2) { close = true; break; }
        }
      }
    }
    if (!close) { out.push(pt); grid.set(gx * W + gy, pt); }
  }
  _sampleCache.set(spacing, out);
  return out;
}

function rerenderLiveOilLayer() {
  const lyr = STATE.layers.oil_paint;
  if (!lyr || !STATE.serverImages.oil_paint_full) return;
  const [w, h] = STATE.payload.canvas_size;
  const p = lyr.params;
  const ctx = lyr.baseCanvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  if (p.thickness > 0) {
    const blurPx = (p.thickness / 100) * 3.5;
    ctx.filter = `blur(${blurPx.toFixed(1)}px) contrast(${100 + p.thickness * 0.25}%)`;
    ctx.drawImage(STATE.serverImages.oil_paint_full, 0, 0);
    ctx.filter = "none";
  } else if (p.thickness < 0 && STATE.serverImages.subject_cc) {
    ctx.drawImage(STATE.serverImages.oil_paint_full, 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = Math.abs(p.thickness) / 100;
    ctx.drawImage(STATE.serverImages.subject_cc, 0, 0);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = "source-over";
  } else {
    ctx.drawImage(STATE.serverImages.oil_paint_full, 0, 0);
  }

  if (p.detailPop > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = (p.detailPop / 100) * 0.55;
    ctx.filter = "contrast(165%) saturate(80%)";
    ctx.drawImage(STATE.serverImages.oil_paint_full, 0, 0);
    ctx.restore();
  }
  compositeAllLayers();
}

function rerenderProceduralLayer(layerId) {
  const lyr = STATE.layers[layerId];
  if (!lyr || !STATE.payload) return;
  const def = lyr.def;
  const p = lyr.params;
  const cfg = STATE.payload.preset_settings;
  const [w, h] = STATE.payload.canvas_size;
  const [offX, offY] = STATE.payload.offset;
  const edges = STATE.payload.stroke_data.edges;
  const brushImg = STATE.brushImages[p.brushFile] || Object.values(STATE.brushImages)[0];
  if (!brushImg) return;

  const ctx = lyr.baseCanvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  if (def.type === "brush_edge" || def.type === "brush_dots") {
    const rng = new PythonRandom((cfg.RANDOM_SEED || 42) + (def.seedOffset || 0));
    const points = sampleEdgePointsJS(edges, p.spacing);
    const avgColor = STATE.payload.average_color || [128, 128, 128];
    const domColor = STATE.payload.dominant_color;

    for (const pt of points) {
      const [x, y, nx, ny, cr, cg, cb, valid] = pt;
      if (!valid && def.type === "brush_edge" && def.id !== "small_dots") continue;
      let rgb = null;
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
      } else if (def.id === "dark_dots" && cfg.DARK_DOTS_USE_DOMINANT_COLOR && domColor) {
        const dk = cfg.DARK_DOTS_COLOR_DARKEN ?? 0.3;
        rgb = domColor.map((v) => Math.round(v * (1 - dk)));
      }

      let rotAngle = (def.id === "sharp_brush" || def.type === "brush_dots" || def.id === "small_dots")
        ? rng.uniform(0, 360)
        : (Math.atan2(-ny, nx) * 180) / Math.PI + 270 + rng.uniform(-180 * p.jiggle, 180 * p.jiggle);

      let drawX = x + offX, drawY = y + offY;
      if (def.id === "small_dots") {
        const jit = cfg.SMALL_WHITE_DOTS_DISTANCE_JITTER ?? -50;
        drawX += nx * rng.uniform(-jit, jit);
        drawY += ny * rng.uniform(-jit, jit);
      }
      const variedSize = Math.max(15, Math.floor(p.size * rng.uniform(0.7, 1.3)));
      colorizeAndDrawBrush(ctx, brushImg, drawX, drawY, variedSize, rotAngle, rgb, p.baseOpacity);
    }
  } else if (def.type === "mask_blur" && STATE.serverImages.blur_bg) {
    const rng = new PythonRandom(cfg.RANDOM_SEED || 42);
    const points = sampleEdgePointsJS(edges, p.spacing);
    const maskTemp = createCanvas(w, h);
    const mCtx = maskTemp.getContext("2d");
    for (const pt of points) {
      const [x, y, nx, ny] = pt;
      const rotAngle = (Math.atan2(-ny, nx) * 180) / Math.PI + 270 + rng.uniform(-180 * p.jiggle, 180 * p.jiggle);
      const variedSize = Math.max(20, Math.floor(p.size * rng.uniform(0.7, 1.3)));
      colorizeAndDrawBrush(mCtx, brushImg, x + offX, y + offY, variedSize, rotAngle, null, p.baseOpacity);
    }
    ctx.drawImage(STATE.serverImages.blur_bg, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskTemp, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  } else if (def.type === "accent") {
    const cands = STATE.payload.stroke_data.accent_candidates || [];
    const spots = STATE.payload.stroke_data.accent_spots || [];
    const step = Math.max(1, Math.round(p.spacing / 50));
    for (let i = 0; i < cands.length; i += step) {
      const pt = cands[i];
      const deg = (Math.atan2(-pt.ny, pt.nx) * 180) / Math.PI + 270 + (i % 5 - 2) * 25;
      const sz = Math.max(20, Math.round(p.size * (0.75 + (i % 4) * 0.15)));
      colorizeAndDrawBrush(ctx, brushImg, pt.x, pt.y, sz, deg, pt.color, Math.min(1, 0.55 * pt.interest));
    }
    for (let i = 0; i < spots.length; i += step) {
      const sp = spots[i];
      const deg = (Math.atan2(-sp.ny, sp.nx) * 180) / Math.PI + 270;
      const sz = Math.max(25, Math.round(p.size * 1.05));
      const lightRgb = sp.color.map((c) => Math.min(255, Math.round(c + (255 - c) * 0.65)));
      colorizeAndDrawBrush(ctx, brushImg, sp.x, sp.y, sz, deg, lightRgb, 0.35);
    }
  } else if (def.type === "brush_ellipse" || def.type === "brush_ellipse_dark") {
    const rng = new PythonRandom((cfg.RANDOM_SEED || 42) + (def.seedOffset || 500));
    const isOuter = def.id === "outer_white";
    const isDark = def.id === "dark_ellipse";
    const inset = isDark ? 0 : cfg[isOuter ? "OUTER_WHITE_BRUSH_ELLIPSE_INSET" : "WHITE_BRUSH_ELLIPSE_INSET"] ?? -40;
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    const rx = Math.max(10, cx - inset), ry = Math.max(10, cy - inset);
    const circum = 2 * Math.PI * Math.max(rx, ry);
    const numPts = Math.max(1, Math.floor(circum / p.spacing));
    const bottomThresh = h * (1 - (cfg.DARK_ELLIPSE_BOTTOM_PERCENT ?? 0.15));

    for (let i = 0; i < numPts; i++) {
      const angle = (2 * Math.PI * i) / numPts;
      const ex = Math.floor(cx + rx * Math.cos(angle));
      const ey = Math.floor(cy + ry * Math.sin(angle));
      if (isDark && ey < bottomThresh) continue;
      const degToCenter = (Math.atan2(-(cy - ey), cx - ex) * 180) / Math.PI;
      const rotAngle = degToCenter + 90 + 180 + rng.uniform(-180 * p.jiggle, 180 * p.jiggle);
      const variedSize = Math.max(20, Math.floor(p.size * rng.uniform(0.7, 1.3)));
      let rgb = null;
      if (isDark && edges.length > 0) {
        const near = edges[i % edges.length];
        rgb = [near[4], near[5], near[6]];
      } else if (cfg.ELLIPSE_BRUSH_MODE === "dark") {
        rgb = [0, 0, 0];
      }
      colorizeAndDrawBrush(ctx, brushImg, ex, ey, variedSize, rotAngle, rgb, p.baseOpacity);
    }
  }

  compositeAllLayers();
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

// ============================================================================
// 9. RIGHT INSPECTOR: LAYER STACK & LIVE SLIDERS UI
// ============================================================================
function renderLayerListUI() {
  const listEl = document.getElementById("layerList");
  listEl.innerHTML = "";
  let currentGroup = "";

  for (const def of LAYER_DEFINITIONS) {
    const lyr = STATE.layers[def.id];
    if (!lyr) continue;

    if (def.group !== currentGroup) {
      currentGroup = def.group;
      const gHeader = document.createElement("div");
      gHeader.className = "layer-group-header";
      gHeader.textContent = currentGroup;
      listEl.appendChild(gHeader);
    }

    const row = document.createElement("div");
    row.className = `layer-item ${STATE.selectedLayerId === def.id ? "selected" : ""}`;
    row.dataset.id = def.id;

    const visBtn = document.createElement("button");
    visBtn.className = "layer-vis-btn";
    visBtn.textContent = lyr.vis ? "👁️" : "🚫";
    visBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      lyr.vis = !lyr.vis;
      visBtn.textContent = lyr.vis ? "👁️" : "🚫";
      invalidateStack();
      compositeAllLayers();
    });

    const nameSpan = document.createElement("span");
    nameSpan.className = "layer-name";
    nameSpan.textContent = def.name;

    row.appendChild(visBtn);
    row.appendChild(nameSpan);
    row.addEventListener("click", () => {
      selectLayer(def.id);
      if (window.innerWidth <= 960) switchMobilePanel("sliders");
    });
    listEl.appendChild(row);
  }
}

function selectLayer(layerId) {
  STATE.selectedLayerId = layerId;
  document.querySelectorAll(".layer-item").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === layerId);
  });

  const tipSelect = document.getElementById("manualBrushTip");
  if (layerId === "custom_detail") {
    tipSelect.value = "round_hard";
    document.getElementById("manualBrushSize").value = 18;
    document.getElementById("manualSizeVal").textContent = "18";
  }

  const lyr = STATE.layers[layerId];
  if (!lyr) return;

  document.getElementById("activeLayerTitle").textContent = lyr.def.name;
  renderSlidersForLayer(lyr);
}

function renderSlidersForLayer(lyr) {
  const container = document.getElementById("layerSlidersContainer");
  container.innerHTML = "";
  const p = lyr.params;
  const def = lyr.def;

  addSlider(container, "Layer Opacity", Math.round(p.opacity * 100), 0, 100, "%", (val) => {
    p.opacity = val / 100;
    compositeAllLayers();
  });

  if (["brush_edge", "brush_dots", "brush_ellipse", "brush_ellipse_dark", "mask_blur", "accent"].includes(def.type)) {
    addBrushFileDropdown(container, p.brushFile, (newFile) => {
      p.brushFile = newFile;
      scheduleRerender(def.id);
    });

    addSlider(container, "Stroke Spacing (Lower = More)", p.spacing, 25, 900, "px", (val) => {
      p.spacing = val;
      scheduleRerender(def.id);
    });

    addSlider(container, "Brush Size", p.size, 40, 1600, "px", (val) => {
      p.size = val;
      scheduleRerender(def.id);
    });

    if (p.jiggle !== undefined) {
      addSlider(container, "Angle Jiggle", Math.round(p.jiggle * 100), 0, 100, "%", (val) => {
        p.jiggle = val / 100;
        scheduleRerender(def.id);
      });
    }
  }

  if (def.type === "subject") {
    addSlider(container, "Color Correction Strength", p.ccBlend, 0, 100, "%", (val) => {
      p.ccBlend = val;
      compositeAllLayers();
    });
  }

  if (def.type === "oil") {
    addSlider(container, "Oil Paint Thickness (Smoothness)", p.thickness, -50, 100, "%", (val) => {
      p.thickness = val;
      rerenderLiveOilLayer();
    });
    addSlider(container, "Bristle Relief & Detail", p.detailPop, 0, 100, "%", (val) => {
      p.detailPop = val;
      rerenderLiveOilLayer();
    });
  }

  addSlider(container, "Brightness", p.brightness, 30, 200, "%", (val) => {
    p.brightness = val;
    compositeAllLayers();
  });

  addSlider(container, "Contrast", p.contrast, 30, 200, "%", (val) => {
    p.contrast = val;
    compositeAllLayers();
  });

  addSlider(container, "Saturation", p.saturation, 0, 250, "%", (val) => {
    p.saturation = val;
    compositeAllLayers();
  });
}

function addSlider(parent, labelText, value, min, max, unit, onInput) {
  const row = document.createElement("div");
  row.className = "control-row";
  const lbl = document.createElement("label");
  const valSpan = document.createElement("span");
  valSpan.textContent = `${value}${unit}`;
  lbl.innerHTML = `<span>${labelText}</span>`;
  lbl.appendChild(valSpan);

  const input = document.createElement("input");
  input.type = "range";
  input.min = min; input.max = max; input.value = value;
  input.step = unit === "px" ? 5 : 1;
  input.addEventListener("input", () => {
    valSpan.textContent = `${input.value}${unit}`;
    onInput(Number(input.value));
  });

  row.appendChild(lbl);
  row.appendChild(input);
  parent.appendChild(row);
}

function addBrushFileDropdown(parent, currentFile, onChange) {
  const row = document.createElement("div");
  row.className = "control-row";
  const lbl = document.createElement("label");
  lbl.textContent = "Layer Brush Texture";

  const sel = document.createElement("select");
  sel.className = "select-box full-width";
  const options = [
    ["bgbrush.png", "🎨 Watercolor Wash (bgbrush)"],
    ["brush2.png", "🖌️ Color Brush (brush2)"],
    ["sharpbrush.png", "📐 Sharp Brush (sharpbrush)"],
    ["whitebrush.png", "⚪ Soft Frame (whitebrush)"],
    ["square.png", "⬛ Square Texture (square)"],
    ["whitedots.png", "💦 White Splatter (whitedots)"],
    ["darkdots.png", "⚫ Dark Splatter (darkdots)"],
  ];
  for (const [val, text] of options) {
    const opt = document.createElement("option");
    opt.value = val; opt.textContent = text;
    if (val === currentFile) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  row.appendChild(lbl);
  row.appendChild(sel);
  parent.appendChild(row);
}

function resetLayerToOriginal(layerId) {
  invalidateStack();
  const lyr = STATE.layers[layerId];
  if (!lyr || !STATE.payload) return;
  const [w, h] = STATE.payload.canvas_size;
  const cfg = STATE.payload.preset_settings;

  lyr.params = buildInitialLayerParams(lyr.def, cfg);
  lyr.paintCanvas = null;
  lyr.eraseCanvas = null;

  const bCtx = lyr.baseCanvas.getContext("2d");
  bCtx.clearRect(0, 0, w, h);
  if (layerId === "mask_blur" && STATE.serverImages.blur_bg) {
    bCtx.drawImage(STATE.serverImages.blur_bg, 0, 0);
    bCtx.globalCompositeOperation = "destination-in";
    bCtx.drawImage(STATE.serverImages.mask_brush, 0, 0);
    bCtx.globalCompositeOperation = "source-over";
  } else if (layerId === "subject" && STATE.serverImages.subject_cc) {
    bCtx.drawImage(STATE.serverImages.subject_cc, 0, 0);
  } else if (layerId === "oil_paint" && STATE.serverImages.oil_paint_full) {
    bCtx.drawImage(STATE.serverImages.oil_paint_full, 0, 0);
  } else if (lyr.origImage) {
    bCtx.drawImage(lyr.origImage, 0, 0);
  }

  renderSlidersForLayer(lyr);
  compositeAllLayers();
}

// ============================================================================
// 10. DESKTOP MOUSE & MOBILE TOUCH / PINCH-ZOOM INTERACTIONS
// ============================================================================
function setActiveTool(tool) {
  STATE.activeTool = tool;
  document.querySelectorAll(".tool-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === tool);
  });
  document.getElementById("maskEditControls").classList.toggle("hidden", tool !== "mask");
  updateCursorPreview();
  compositeAllLayers();
}

function setupCanvasInteractions() {
  let isPickingColor = false;
  let lastPinchDist = null;
  let lastPinchCenter = null;

  document.getElementById("eyedropperBtn").addEventListener("click", () => {
    isPickingColor = true;
    viewport.style.cursor = "crosshair";
    closeMobileSheets();
  });

  // Accurate Mouse Wheel Zoom at Exact Cursor Position
  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (!STATE.payload) return;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom(STATE.zoom * factor, e.clientX, e.clientY);
  }, { passive: false });

  // Desktop Mouse Events
  viewport.addEventListener("mousedown", (e) => {
    if (!STATE.payload || e.target.closest(".floating-zoom")) return;
    if (isPickingColor) {
      pickColorFromCanvas(e.clientX, e.clientY);
      isPickingColor = false;
      viewport.style.cursor = "default";
      return;
    }
    STATE.isDragging = true;
    STATE.lastMouse = { x: e.clientX, y: e.clientY };
    if (["brush", "eraser", "mask"].includes(STATE.activeTool)) {
      applyManualStrokeAtPoint(e.clientX, e.clientY);
    }
  });

  window.addEventListener("mousemove", (e) => {
    updateCursorPosition(e.clientX, e.clientY);
    if (!STATE.isDragging || !STATE.payload) return;
    if (STATE.activeTool === "pan") {
      STATE.panX += e.clientX - STATE.lastMouse.x;
      STATE.panY += e.clientY - STATE.lastMouse.y;
      STATE.lastMouse = { x: e.clientX, y: e.clientY };
      updateCanvasTransform();
    } else {
      applyManualStrokeAtPoint(e.clientX, e.clientY);
      STATE.lastMouse = { x: e.clientX, y: e.clientY };
    }
  });

  window.addEventListener("mouseup", () => {
    STATE.isDragging = false;
  });

  // Mobile & Tablet Touch Events (1-finger Paint/Pan + 2-finger Pinch-Zoom)
  viewport.addEventListener("touchstart", (e) => {
    if (!STATE.payload || e.target.closest(".floating-zoom")) return;
    closeMobileSheets();

    if (e.touches.length === 2) {
      STATE.isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.hypot(dx, dy);
      lastPinchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      if (isPickingColor) {
        pickColorFromCanvas(t.clientX, t.clientY);
        isPickingColor = false;
        return;
      }
      STATE.isDragging = true;
      STATE.lastMouse = { x: t.clientX, y: t.clientY };
      if (["brush", "eraser", "mask"].includes(STATE.activeTool)) {
        applyManualStrokeAtPoint(t.clientX, t.clientY);
      }
    }
  }, { passive: false });

  viewport.addEventListener("touchmove", (e) => {
    if (!STATE.payload) return;
    e.preventDefault();

    if (e.touches.length === 2 && lastPinchDist !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const center = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };

      const scaleFactor = dist / Math.max(1, lastPinchDist);
      STATE.panX += center.x - lastPinchCenter.x;
      STATE.panY += center.y - lastPinchCenter.y;
      setZoom(STATE.zoom * scaleFactor, center.x, center.y);

      lastPinchDist = dist;
      lastPinchCenter = center;
      return;
    }

    if (e.touches.length === 1 && STATE.isDragging) {
      const t = e.touches[0];
      if (STATE.activeTool === "pan") {
        STATE.panX += t.clientX - STATE.lastMouse.x;
        STATE.panY += t.clientY - STATE.lastMouse.y;
        STATE.lastMouse = { x: t.clientX, y: t.clientY };
        updateCanvasTransform();
      } else {
        applyManualStrokeAtPoint(t.clientX, t.clientY);
        STATE.lastMouse = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });

  viewport.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) {
      lastPinchDist = null;
      lastPinchCenter = null;
    }
    if (e.touches.length === 0) {
      STATE.isDragging = false;
    }
  });
}

function screenToCanvasCoords(clientX, clientY) {
  const rect = displayCanvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (displayCanvas.width / rect.width);
  const y = (clientY - rect.top) * (displayCanvas.height / rect.height);
  return { x, y };
}

function applyManualStrokeAtPoint(clientX, clientY) {
  const { x, y } = screenToCanvasCoords(clientX, clientY);
  const size = Number(document.getElementById("manualBrushSize").value);
  const opacity = Number(document.getElementById("manualBrushOpacity").value) / 100;
  const colorHex = document.getElementById("manualBrushColor").value;
  const tip = document.getElementById("manualBrushTip").value;
  const [w, h] = STATE.payload.canvas_size;

  if (STATE.activeTool === "mask" && STATE.maskCanvas) {
    const mx = (x / displayCanvas.width) * STATE.maskCanvas.width;
    const my = (y / displayCanvas.height) * STATE.maskCanvas.height;
    const mCtx = STATE.maskCanvas.getContext("2d");
    mCtx.save();
    mCtx.fillStyle = STATE.maskModePaintKeep ? "#ffffff" : "#000000";
    mCtx.beginPath();
    mCtx.arc(mx, my, size / 2, 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();
    renderMaskEditorView();
    return;
  }

  const lyr = STATE.layers[STATE.selectedLayerId];
  if (!lyr || !lyr.vis) return;

  const targetCanvas = STATE.activeTool === "eraser"
    ? getOrCreateEraseCanvas(lyr, w, h)
    : getOrCreatePaintCanvas(lyr, w, h);
  const ctx = targetCanvas.getContext("2d");

  if (STATE.activeTool === "eraser") {
    ctx.save();
    ctx.globalAlpha = opacity;
    const grad = ctx.createRadialGradient(x, y, size * 0.15, x, y, size / 2);
    grad.addColorStop(0, "rgba(0,0,0,1)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else {
    const rgb = hexToRgb(colorHex);
    if (tip === "round_hard") {
      ctx.save(); ctx.globalAlpha = opacity; ctx.fillStyle = colorHex;
      ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else if (tip === "round_soft") {
      ctx.save(); ctx.globalAlpha = opacity;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, size / 2);
      grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
      grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (tip === "specular_star") {
      ctx.save(); ctx.globalAlpha = opacity; ctx.fillStyle = colorHex;
      ctx.beginPath(); ctx.arc(x, y, size * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = colorHex; ctx.lineWidth = Math.max(1.5, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(x - size * 0.6, y); ctx.lineTo(x + size * 0.6, y);
      ctx.moveTo(x, y - size * 0.6); ctx.lineTo(x, y + size * 0.6);
      ctx.stroke(); ctx.restore();
    } else {
      const bImg = STATE.brushImages[tip] || Object.values(STATE.brushImages)[0];
      colorizeAndDrawBrush(ctx, bImg, x, y, size, Math.random() * 360, rgb, opacity);
    }
  }
  compositeAllLayers();
}

function renderMaskEditorView() {
  const [w, h] = STATE.payload.canvas_size;
  const [offX, offY] = STATE.payload.offset;
  const [subW, subH] = STATE.payload.subject_size;
  displayCtx.clearRect(0, 0, w, h);
  displayCtx.fillStyle = "#f8fafc"; displayCtx.fillRect(0, 0, w, h);
  displayCtx.drawImage(STATE.originalImg, offX, offY, subW, subH);
  const overlay = createCanvas(subW, subH);
  const oCtx = overlay.getContext("2d");
  oCtx.fillStyle = "rgba(239, 68, 68, 0.55)"; oCtx.fillRect(0, 0, subW, subH);
  oCtx.globalCompositeOperation = "destination-out";
  oCtx.drawImage(STATE.maskCanvas, 0, 0, subW, subH);
  displayCtx.drawImage(overlay, offX, offY);
}

function pickColorFromCanvas(clientX, clientY) {
  const { x, y } = screenToCanvasCoords(clientX, clientY);
  const pixel = displayCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  document.getElementById("manualBrushColor").value = rgbToHex(pixel[0], pixel[1], pixel[2]);
}

// ============================================================================
// 11. ACCURATE CURSOR-ANCHORED ZOOM, PAN & EXPORT
// ============================================================================
function fitCanvasToViewport() {
  if (!STATE.payload) return;
  const [w, h] = STATE.payload.canvas_size;
  const pad = window.innerWidth <= 960 ? 24 : 64;
  const vw = Math.max(100, viewport.clientWidth - pad);
  const vh = Math.max(100, viewport.clientHeight - pad - 36);
  STATE.zoom = Math.min(vw / w, vh / h);
  STATE.panX = Math.round((viewport.clientWidth - w * STATE.zoom) / 2);
  STATE.panY = Math.round((viewport.clientHeight - 20 - h * STATE.zoom) / 2);
  updateCanvasTransform();
}

function setZoom(newZoom, anchorClientX, anchorClientY) {
  if (!STATE.payload) return;
  const clamped = Math.max(0.12, Math.min(4.0, newZoom));
  const vRect = viewport.getBoundingClientRect();

  // If no cursor anchor is given (e.g., + / - buttons), zoom into the center of the viewport
  const mx = (anchorClientX !== undefined ? anchorClientX : vRect.left + vRect.width / 2) - vRect.left;
  const my = (anchorClientY !== undefined ? anchorClientY : vRect.top + vRect.height / 2) - vRect.top;

  // Keep the exact canvas point under (mx, my) stationary during scale
  const canvasX = (mx - STATE.panX) / STATE.zoom;
  const canvasY = (my - STATE.panY) / STATE.zoom;

  STATE.zoom = clamped;
  STATE.panX = mx - canvasX * clamped;
  STATE.panY = my - canvasY * clamped;
  updateCanvasTransform();
}

function updateCanvasTransform() {
  canvasContainer.style.transform = `translate3d(${STATE.panX}px, ${STATE.panY}px, 0) scale(${STATE.zoom})`;
  document.getElementById("zoomLabel").textContent = `${Math.round(STATE.zoom * 100)}%`;
  updateCursorPreview();
}

function updateCursorPosition(clientX, clientY) {
  if (STATE.activeTool === "pan" || !STATE.payload) {
    brushCursor.classList.add("hidden");
    return;
  }
  const vRect = viewport.getBoundingClientRect();
  if (clientX < vRect.left || clientX > vRect.right || clientY < vRect.top || clientY > vRect.bottom) {
    brushCursor.classList.add("hidden");
    return;
  }
  brushCursor.classList.remove("hidden");
  brushCursor.style.left = `${clientX}px`;
  brushCursor.style.top = `${clientY}px`;
  updateCursorPreview();
}

function updateCursorPreview() {
  const size = Number(document.getElementById("manualBrushSize").value) * STATE.zoom;
  brushCursor.style.width = `${Math.max(4, size)}px`;
  brushCursor.style.height = `${Math.max(4, size)}px`;
}

function exportImage(fmt = "jpeg") {
  invalidateStack();
  if (!STATE.payload) return;
  if (STATE.activeTool === "mask") setActiveTool("pan");
  compositeAllLayers();
  const mime = fmt === "png" ? "image/png" : "image/jpeg";
  const ext = fmt === "png" ? "png" : "jpg";
  const dataUrl = displayCanvas.toDataURL(mime, 0.96);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `watercolor_${STATE.payload.preset_key}_${Date.now()}.${ext}`;
  a.click();
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
}
function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}