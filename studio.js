/**
 * 🎨 Watercolor Artist Studio — Real-Time 60 FPS Layer & Brush Engine
 * File 3 of 3: Complete Mobile & Desktop Studio Engine (WebGL2 GPU Accelerated)
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

async function initializeStudioFromPayload(payload) {
  cancelPendingSchedules();
  invalidateStack();
  _sampleCache.clear();
  _ellipseGeomCache.clear();
  STATE.oilDetailCache = null;
  STATE.edgeCurveCache = null;
  destroyGLEdgeCurveResources();

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
  }

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

// ============================================================================
// 6B. UNIFIED SINGLE-PASS 60 FPS SCHEDULER (100% FULL RESOLUTION)
// ============================================================================
const _pendingRerender = new Set();
let _pendingOil = false;
let _pendingEdgeCurve = false;
let _pendingComposite = false;
let _rafId = 0;

function cancelPendingSchedules() {
  _pendingRerender.clear();
  _pendingOil = false;
  _pendingEdgeCurve = false;
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
      needsComp = true;
    }
    if (_pendingEdgeCurve) {
      _pendingEdgeCurve = false;
      rerenderLiveEdgeCurveLayer(true);
      needsComp = true;
    }
    if (_pendingOil) {
      _pendingOil = false;
      rerenderLiveOilLayer(true);
      needsComp = true;
    }
    if (needsComp) {
      compositeAllLayers();
    }
  });
}

function scheduleRerender(layerId) {
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
  _pendingComposite = true;
  _ensureRaf();
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
      opacity: 1.65,
      baseOpacity: 1.0,
      size: 300,
      spacing: 50,
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
      maskDetail: 65,
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
    return {
      opacity: 1.0,
      baseOpacity: 1.0,
      ccBlend: 100,
      brightness: 100,
      contrast: 100,
      saturation: 100,
    };
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
// 7. REAL-TIME COMPOSITOR (60 FPS, ZERO UNNECESSARY STACK REBUILDS)
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

  const hasFilter = p.brightness !== 100 || p.contrast !== 100 || p.saturation !== 100;
  const hasSubjectBlend = def.id === "subject" && p.ccBlend < 100 && STATE.serverImages.subject_raw;
  const hasPaintOrErase = !!(lyr.paintCanvas || lyr.eraseCanvas);

  // Fast path: draw baseCanvas directly into ctx without intermediate full-screen copy
  if (!hasFilter && !hasSubjectBlend && !hasPaintOrErase) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, op);
    ctx.drawImage(lyr.baseCanvas, 0, 0);
    if (op > 1) {
      ctx.globalAlpha = Math.min(1, op - 1);
      ctx.drawImage(lyr.baseCanvas, 0, 0);
    }
    ctx.restore();
    return;
  }

  const [w, h] = STATE.payload.canvas_size;
  if (_tempLayerCanvas.width !== w || _tempLayerCanvas.height !== h) {
    _tempLayerCanvas.width = w; _tempLayerCanvas.height = h;
  }
  const t = _tempLayerCanvas.getContext("2d");
  t.clearRect(0, 0, w, h);
  t.filter = hasFilter ? `brightness(${p.brightness}%) contrast(${p.contrast}%) saturate(${p.saturation}%)` : "none";
  if (hasSubjectBlend) {
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
  if (!_stack.below) _stack.below = createCanvas(w, h);
  if (!_stack.above) _stack.above = createCanvas(w, h);
  if (_stack.below.width !== w || _stack.below.height !== h) {
    _stack.below.width = w; _stack.below.height = h;
  }
  if (_stack.above.width !== w || _stack.above.height !== h) {
    _stack.above.width = w; _stack.above.height = h;
  }
  const bCtx = _stack.below.getContext("2d");
  const aCtx = _stack.above.getContext("2d");
  bCtx.clearRect(0, 0, w, h);
  aCtx.clearRect(0, 0, w, h);

  const selIdx = LAYER_DEFINITIONS.findIndex((d) => d.id === selId);
  for (let i = LAYER_DEFINITIONS.length - 1; i >= 0; i--) {
    if (i === selIdx) continue;
    drawLayerInto(i > selIdx ? bCtx : aCtx, LAYER_DEFINITIONS[i]);
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
  const [w, h] = STATE.payload.canvas_size;
  const sel = STATE.selectedLayerId;
  if (_stack.dirty || _stack.id !== sel) rebuildStack(sel);
  displayCtx.clearRect(0, 0, w, h);
  displayCtx.drawImage(_stack.below, 0, 0);
  drawLayerInto(displayCtx, LAYER_DEFINITIONS.find((d) => d.id === sel));
  displayCtx.drawImage(_stack.above, 0, 0);
}

// ============================================================================
// 8. WEBGL2 HARDWARE BRUSH BATCH RENDERER + 2D FALLBACK
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

let _glBrush = null;

function invalidateGLBrushTextures() {
  if (!_glBrush) return;
  const { gl, textures } = _glBrush;
  for (const tex of textures.values()) gl.deleteTexture(tex);
  textures.clear();
}

function getGLBrushRenderer(w, h) {
  if (_glBrush === false) return null;
  if (!_glBrush) {
    const canvas = createCanvas(w, h);
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      _glBrush = false;
      return null;
    }

    const vsSrc = `#version 300 es
      layout(location = 0) in vec2 a_pos;
      layout(location = 1) in vec2 a_uv;
      layout(location = 2) in vec4 a_color;
      out vec2 v_uv;
      out vec4 v_color;
      void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
        v_uv = a_uv;
        v_color = a_color;
      }
    `;
    const fsSrc = `#version 300 es
      precision mediump float;
      in vec2 v_uv;
      in vec4 v_color;
      uniform sampler2D u_tex;
      out vec4 outColor;
      void main() {
        float maskA = texture(u_tex, v_uv).a;
        float a = maskA * v_color.a;
        outColor = vec4(v_color.rgb * a, a);
      }
    `;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) {
      _glBrush = false;
      return null;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      _glBrush = false;
      return null;
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

    const stride = 8 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 4 * 4);

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, "u_tex"), 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    _glBrush = {
      canvas,
      gl,
      prog,
      vao,
      vbo,
      textures: new Map(),
      vertBuf: new Float32Array(2048 * 6 * 8),
    };
  }

  if (_glBrush.canvas.width !== w || _glBrush.canvas.height !== h) {
    _glBrush.canvas.width = w;
    _glBrush.canvas.height = h;
  }
  return _glBrush;
}

function getOrUploadGLBrushTexture(r, brushKey, brushImg) {
  let tex = r.textures.get(brushKey);
  if (tex) return tex;
  const { gl } = r;
  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, brushImg);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  r.textures.set(brushKey, tex);
  return tex;
}

// Renders all strokes for a layer in a single WebGL2 draw call at 100% full resolution
function drawStrokesWebGL(w, h, brushKey, brushImg, strokes) {
  const r = getGLBrushRenderer(w, h);
  if (!r) return null;
  const { gl, prog, vao, vbo, canvas } = r;
  const count = strokes.length;

  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (count === 0) return canvas;

  const neededFloats = count * 6 * 8;
  if (r.vertBuf.length < neededFloats) {
    r.vertBuf = new Float32Array(Math.max(neededFloats, r.vertBuf.length * 2));
  }
  const v = r.vertBuf;
  const invW2 = 2.0 / w;
  const invH2 = 2.0 / h;
  const inv255 = 1.0 / 255.0;

  let ptr = 0;
  for (let i = 0; i < count; i++) {
    const s = strokes[i];
    const half = s.size * 0.5;
    const rad = (s.rot * Math.PI) / 180.0;
    const cos = Math.cos(rad) * half;
    const sin = Math.sin(rad) * half;
    const cx = s.x;
    const cy = s.y;

    // Exact match to colorizeAndDrawBrush(-rad rotation around stroke center)
    const x0 = (cx - cos - sin) * invW2 - 1.0;
    const y0 = 1.0 - (cy + sin - cos) * invH2;
    const x1 = (cx + cos - sin) * invW2 - 1.0;
    const y1 = 1.0 - (cy - sin - cos) * invH2;
    const x2 = (cx + cos + sin) * invW2 - 1.0;
    const y2 = 1.0 - (cy - sin + cos) * invH2;
    const x3 = (cx - cos + sin) * invW2 - 1.0;
    const y3 = 1.0 - (cy + sin + cos) * invH2;

    const cr = s.rgb[0] * inv255;
    const cg = s.rgb[1] * inv255;
    const cb = s.rgb[2] * inv255;
    const ca = s.op;

    // Triangle 1: TL (0), TR (1), BR (2)
    v[ptr++] = x0; v[ptr++] = y0; v[ptr++] = 0; v[ptr++] = 0; v[ptr++] = cr; v[ptr++] = cg; v[ptr++] = cb; v[ptr++] = ca;
    v[ptr++] = x1; v[ptr++] = y1; v[ptr++] = 1; v[ptr++] = 0; v[ptr++] = cr; v[ptr++] = cg; v[ptr++] = cb; v[ptr++] = ca;
    v[ptr++] = x2; v[ptr++] = y2; v[ptr++] = 1; v[ptr++] = 1; v[ptr++] = cr; v[ptr++] = cg; v[ptr++] = cb; v[ptr++] = ca;
    // Triangle 2: TL (0), BR (2), BL (3)
    v[ptr++] = x0; v[ptr++] = y0; v[ptr++] = 0; v[ptr++] = 0; v[ptr++] = cr; v[ptr++] = cg; v[ptr++] = cb; v[ptr++] = ca;
    v[ptr++] = x2; v[ptr++] = y2; v[ptr++] = 1; v[ptr++] = 1; v[ptr++] = cr; v[ptr++] = cg; v[ptr++] = cb; v[ptr++] = ca;
    v[ptr++] = x3; v[ptr++] = y3; v[ptr++] = 0; v[ptr++] = 1; v[ptr++] = cr; v[ptr++] = cg; v[ptr++] = cb; v[ptr++] = ca;
  }

  const tex = getOrUploadGLBrushTexture(r, brushKey, brushImg);
  gl.useProgram(prog);
  gl.bindVertexArray(vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, v.subarray(0, ptr), gl.STREAM_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, count * 6);

  return canvas;
}

// Fast O(1) Center-First Int32Array Spatial Grid for Edge Sampling
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

  const maxX = (sd && sd.maxX) || 2000;
  const maxY = (sd && sd.maxY) || 2000;
  const gW = ((maxX * invCell) | 0) + 6;
  const gH = ((maxY * invCell) | 0) + 6;
  const gLen = gW * gH;
  if (_gridBuf.length < gLen) {
    _gridBuf = new Int32Array(gLen);
  }
  _gridBuf.fill(-1, 0, gLen);

  const out = [];
  for (let i = 0; i < n; i++) {
    const px = edgesX ? edgesX[i] : edges[i][0];
    const py = edgesY ? edgesY[i] : edges[i][1];
    const gx = ((px * invCell) | 0) + 2;
    const gy = ((py * invCell) | 0) + 2;
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
  const [offX, offY] = STATE.payload.offset;
  const [subW, subH] = STATE.payload.subject_size;
  const bx = Math.max(0, offX);
  const by = Math.max(0, offY);
  const bw = Math.min(cw - bx, subW);
  const bh = Math.min(ch - by, subH);
  if (bw <= 0 || bh <= 0) return null;

  const popCanvas = createCanvas(bw, bh);
  const pCtx = popCanvas.getContext("2d");
  pCtx.filter = "contrast(165%) saturate(80%)";
  pCtx.drawImage(STATE.serverImages.oil_paint_full, bx, by, bw, bh, 0, 0, bw, bh);
  pCtx.filter = "none";

  STATE.oilDetailCache = { bx, by, bw, bh, popCanvas };
  return STATE.oilDetailCache;
}

function rerenderLiveOilLayer(skipComposite = false) {
  const lyr = STATE.layers.oil_paint;
  if (!lyr || !STATE.serverImages.oil_paint_full) return;
  const [w, h] = STATE.payload.canvas_size;
  const p = lyr.params;
  const ctx = lyr.baseCanvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const cache = getOrBuildOilDetailCache();
  if (p.thickness > 0 && cache) {
    const { bx, by, bw, bh } = cache;
    const blurPx = (p.thickness / 100) * 3.5;
    ctx.filter = `blur(${blurPx.toFixed(1)}px) contrast(${100 + p.thickness * 0.25}%)`;
    ctx.drawImage(STATE.serverImages.oil_paint_full, bx, by, bw, bh, bx, by, bw, bh);
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

  if (p.detailPop > 0 && cache) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = (p.detailPop / 100) * 0.55;
    ctx.drawImage(cache.popCanvas, cache.bx, cache.by);
    ctx.restore();
  }
  if (_stack.id !== "oil_paint") invalidateStack();
  if (!skipComposite) {
    compositeAllLayers();
  }
}

// ============================================================================
// 8B. WEBGL2 GPU SHADER PIPELINE + CPU CACHE FOR EDGE CURVE
// ============================================================================
let _blurTmpA = new Float32Array(0);
let _colSumA = new Float32Array(0);

// Fast stride-1 row-wise box blur for initial cache construction & CPU fallback
function boxBlurFloat32(src, w, h, radius, outBuf) {
  const r = Math.max(1, Math.round(radius));
  const n = w * h;
  if (_blurTmpA.length < n) _blurTmpA = new Float32Array(n);
  if (_colSumA.length < w) _colSumA = new Float32Array(w);
  const tmp = _blurTmpA;
  const colSum = _colSumA;
  const dst = outBuf || new Float32Array(n);
  const inv = 1 / (2 * r + 1);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = src[row] * (r + 1);
    for (let x = 1; x <= r && x < w; x++) sum += src[row + x];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * inv;
      const addIdx = x + r + 1 < w ? x + r + 1 : w - 1;
      const subIdx = x - r > 0 ? x - r : 0;
      sum += src[row + addIdx] - src[row + subIdx];
    }
  }

  const r1 = r + 1;
  for (let x = 0; x < w; x++) colSum[x] = tmp[x] * r1;
  for (let y = 1; y <= r && y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) colSum[x] += tmp[row + x];
  }
  for (let y = 0; y < h; y++) {
    const dstRow = y * w;
    const addRow = (y + r + 1 < h ? y + r + 1 : h - 1) * w;
    const subRow = (y - r > 0 ? y - r : 0) * w;
    for (let x = 0; x < w; x++) {
      dst[dstRow + x] = colSum[x] * inv;
      colSum[x] += tmp[addRow + x] - tmp[subRow + x];
    }
  }
  return dst;
}

function normalizedBlurFloat32(src, insideMask, w, h, radius, cachedDen, outBuf) {
  const n = w * h;
  const dst = outBuf || new Float32Array(n);
  for (let i = 0; i < n; i++) dst[i] = src[i] * insideMask[i];
  boxBlurFloat32(dst, w, h, radius, dst);
  const den = cachedDen || boxBlurFloat32(insideMask, w, h, radius);
  for (let i = 0; i < n; i++) {
    dst[i] = den[i] > 1e-4 ? dst[i] / den[i] : src[i];
  }
  return dst;
}

function getOrBuildEdgeCurveCache() {
  if (STATE.edgeCurveCache) return STATE.edgeCurveCache;
  const subImg = STATE.serverImages.subject_cc;
  const ecImg = STATE.serverImages.edge_curve;
  if (!subImg || !ecImg) return null;

  const [cw, ch] = STATE.payload.canvas_size;
  const [offX, offY] = STATE.payload.offset;
  const [subW, subH] = STATE.payload.subject_size;
  const bx = Math.max(0, offX);
  const by = Math.max(0, offY);
  const bw = Math.min(cw - bx, subW);
  const bh = Math.min(ch - by, subH);
  if (bw <= 0 || bh <= 0) return null;

  const subC = createCanvas(bw, bh);
  const subCtx = subC.getContext("2d");
  subCtx.drawImage(subImg, bx, by, bw, bh, 0, 0, bw, bh);
  const subData = subCtx.getImageData(0, 0, bw, bh).data;

  const ecC = createCanvas(bw, bh);
  const ecCtx = ecC.getContext("2d");
  ecCtx.drawImage(ecImg, bx, by, bw, bh, 0, 0, bw, bh);
  const ecData = ecCtx.getImageData(0, 0, bw, bh).data;

  const n = bw * bh;
  const rChan = new Float32Array(n);
  const gChan = new Float32Array(n);
  const bChan = new Float32Array(n);
  const rawLum = new Float32Array(n);
  const alpha = new Uint8Array(n);
  const insideMask = new Float32Array(n);
  const outerSil = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = subData[p], g = subData[p + 1], b = subData[p + 2], a = subData[p + 3];
    alpha[i] = a;
    rChan[i] = r;
    gChan[i] = g;
    bChan[i] = b;
    insideMask[i] = a > 240 ? 1.0 : 0.0;
    outerSil[i] = a < 250 ? 1.0 : 0.0;
    rawLum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const den5 = boxBlurFloat32(insideMask, bw, bh, 5);
  const den4 = boxBlurFloat32(insideMask, bw, bh, 4);
  const den2 = boxBlurFloat32(insideMask, bw, bh, 2);

  const smoothR = normalizedBlurFloat32(normalizedBlurFloat32(rChan, insideMask, bw, bh, 5, den5), insideMask, bw, bh, 4, den4);
  const smoothG = normalizedBlurFloat32(normalizedBlurFloat32(gChan, insideMask, bw, bh, 5, den5), insideMask, bw, bh, 4, den4);
  const smoothB = normalizedBlurFloat32(normalizedBlurFloat32(bChan, insideMask, bw, bh, 5, den5), insideMask, bw, bh, 4, den4);

  let lum = normalizedBlurFloat32(rawLum, insideMask, bw, bh, 2, den2);
  lum = normalizedBlurFloat32(lum, insideMask, bw, bh, 2, den2);

  let silDist = boxBlurFloat32(outerSil, bw, bh, 6);
  silDist = boxBlurFloat32(silDist, bw, bh, 6);
  const outerEdgeFade = new Float32Array(n);
  const interiorWeight = new Float32Array(n);
  const texRatio = new Float32Array(n);
  const darkRaw = new Float32Array(n);
  const lightRaw = new Float32Array(n);

  // Packed RGBA8 buffers for WebGL2 GPU pipeline
  const smoothRgba = new Uint8Array(n * 4);
  const rawZonesRgba = new Uint8Array(n * 4);
  const staticWeightsRgba = new Uint8Array(n * 4);

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (alpha[i] > 0) {
      outerEdgeFade[i] = Math.max(0, Math.min(1, (0.35 - silDist[i]) / 0.30));
      interiorWeight[i] = Math.max(0, Math.min(1, (0.12 - silDist[i]) / 0.10));
    }
    if (ecData[p + 3] > 245 && outerEdgeFade[i] > 0.5) {
      const ecLum = 0.299 * ecData[p] + 0.587 * ecData[p + 1] + 0.114 * ecData[p + 2];
      const smLum = 0.299 * smoothR[i] + 0.587 * smoothG[i] + 0.114 * smoothB[i];
      const rawRatio = smLum > 15 ? Math.max(0.88, Math.min(1.12, ecLum / smLum)) : 1.0;
      texRatio[i] = 1.0 + (rawRatio - 1.0) * outerEdgeFade[i];
    } else {
      texRatio[i] = 1.0;
    }

    const ins = insideMask[i];
    if (ins > 0) {
      const l = lum[i];
      if (l < 72) darkRaw[i] = Math.min(1.0, (72 - l) / 12.0);
      if (l > 164) lightRaw[i] = Math.min(1.0, (l - 164) / 12.0);
    }

    smoothRgba[p] = Math.max(0, Math.min(255, Math.round(smoothR[i])));
    smoothRgba[p + 1] = Math.max(0, Math.min(255, Math.round(smoothG[i])));
    smoothRgba[p + 2] = Math.max(0, Math.min(255, Math.round(smoothB[i])));
    smoothRgba[p + 3] = 255;

    // Pre-multiplied by insideMask in .rg, with insideMask in .b
    rawZonesRgba[p] = Math.round(darkRaw[i] * ins * 255);
    rawZonesRgba[p + 1] = Math.round(lightRaw[i] * ins * 255);
    rawZonesRgba[p + 2] = Math.round(ins * 255);
    rawZonesRgba[p + 3] = 255;

    staticWeightsRgba[p] = Math.round(outerEdgeFade[i] * 255);
    staticWeightsRgba[p + 1] = Math.round(interiorWeight[i] * 255);
    staticWeightsRgba[p + 2] = Math.max(0, Math.min(255, Math.round(((texRatio[i] - 0.88) / 0.24) * 255)));
    staticWeightsRgba[p + 3] = Math.round(ins * 255);
  }

  STATE.edgeCurveCache = {
    bx, by, bw, bh,
    subData, smoothR, smoothG, smoothB, lum, alpha, insideMask,
    outerEdgeFade, interiorWeight, texRatio, darkRaw, lightRaw,
    smoothRgba, rawZonesRgba, staticWeightsRgba,
  };
  return STATE.edgeCurveCache;
}

// WebGL2 GPU Pipeline for Edge Curve
let _glEC = null;

function destroyGLEdgeCurveResources() {
  if (!_glEC) return;
  const { gl } = _glEC;
  for (const k of ["texOrig", "texSmooth", "texRawZones", "texStatic", "texPing", "texPong", "texMasks", "texRim"]) {
    if (_glEC[k]) { gl.deleteTexture(_glEC[k]); _glEC[k] = null; }
  }
  for (const k of ["fboPing", "fboPong", "fboMasks", "fboRim"]) {
    if (_glEC[k]) { gl.deleteFramebuffer(_glEC[k]); _glEC[k] = null; }
  }
  _glEC.uploadedCache = null;
  _glEC.lastR1 = -1;
  _glEC.lastRimR1 = -1;
  _glEC.lastRimRadius = -1;
}

function initGLEdgeCurveContext() {
  if (_glEC === false) return null;
  if (_glEC) return _glEC;

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
    _glEC = false;
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

  // Horizontal 1D box blur of pre-masked (dark*mask, light*mask, mask)
  const fsBlurH = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    uniform sampler2D u_tex;
    uniform float u_stepX;
    uniform int u_radius;
    uniform int u_premask;
    out vec4 outColor;
    void main() {
      vec3 sum = vec3(0.0);
      for (int i = -18; i <= 18; i++) {
        if (i < -u_radius || i > u_radius) continue;
        vec2 uv = clamp(v_uv + vec2(float(i) * u_stepX, 0.0), vec2(0.0), vec2(1.0));
        vec4 s = texture(u_tex, uv);
        if (u_premask == 1) {
          sum += vec3(s.rg * s.b, s.b);
        } else {
          sum += s.rgb;
        }
      }
      float inv = 1.0 / float(2 * u_radius + 1);
      outColor = vec4(sum * inv, 1.0);
    }
  `;

  // Vertical 1D box blur + insideMask division + optional threshold
  const fsBlurVNorm = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    uniform sampler2D u_texH;
    uniform sampler2D u_texStatic;
    uniform float u_stepY;
    uniform int u_radius;
    uniform int u_doThresh;
    out vec4 outColor;
    void main() {
      vec3 sum = vec3(0.0);
      for (int i = -18; i <= 18; i++) {
        if (i < -u_radius || i > u_radius) continue;
        vec2 uv = clamp(v_uv + vec2(0.0, float(i) * u_stepY), vec2(0.0), vec2(1.0));
        sum += texture(u_texH, uv).rgb;
      }
      float inv = 1.0 / float(2 * u_radius + 1);
      vec3 blurred = sum * inv;
      float inside = texture(u_texStatic, v_uv).a;
      vec2 res = blurred.b > 1e-4 ? (blurred.rg / blurred.b) : vec2(0.0);
      if (u_doThresh == 1) {
        res = clamp((res - 0.42) / 0.16, 0.0, 1.0);
      }
      outColor = vec4(res, inside, 1.0);
    }
  `;

  // Final Tri-Tone Composite Shader (flips Y so canvas matches 2D top-down orientation)
  const fsComposite = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    uniform sampler2D u_orig;
    uniform sampler2D u_smooth;
    uniform sampler2D u_static;
    uniform sampler2D u_masks;
    uniform sampler2D u_rim;
    uniform float u_rimStrength;
    uniform int u_hasRim;
    out vec4 outColor;
    void main() {
      vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
      vec4 orig = texture(u_orig, uv);
      if (orig.a == 0.0) {
        outColor = vec4(0.0);
        return;
      }
      vec4 st = texture(u_static, uv);
      float fade = st.r;
      if (fade <= 0.001) {
        outColor = orig;
        return;
      }
      vec3 sm = texture(u_smooth, uv).rgb;
      vec2 masks = texture(u_masks, uv).rg;
      float dm = masks.r;
      float lm = masks.g * (1.0 - dm);
      float mm = max(0.0, 1.0 - dm - lm);

      vec3 dr = sm * 0.66;
      vec3 lr = 1.0 - (1.0 - sm) * 0.78;
      float tex = 0.88 + st.b * 0.24;
      vec3 col = (dr * dm + sm * mm + lr * lm) * tex;

      if (u_hasRim == 1 && st.g > 0.0) {
        vec2 rVal = texture(u_rim, uv).rg;
        float drim = 4.0 * rVal.r * (1.0 - rVal.r);
        float lrim = 4.0 * rVal.g * (1.0 - rVal.g);
        float rim = max(drim, lrim) * st.g;
        col *= (1.0 - rim * u_rimStrength);
      }

      vec3 finalRgb = clamp(mix(orig.rgb, col, fade), 0.0, 1.0);
      outColor = vec4(finalRgb, orig.a);
    }
  `;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
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
  const fH = compile(gl.FRAGMENT_SHADER, fsBlurH);
  const fV = compile(gl.FRAGMENT_SHADER, fsBlurVNorm);
  const fC = compile(gl.FRAGMENT_SHADER, fsComposite);
  if (!vs || !fH || !fV || !fC) { _glEC = false; return null; }

  const progH = link(vs, fH);
  const progV = link(vs, fV);
  const progC = link(vs, fC);
  if (!progH || !progV || !progC) { _glEC = false; return null; }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(progH);
  gl.uniform1i(gl.getUniformLocation(progH, "u_tex"), 0);

  gl.useProgram(progV);
  gl.uniform1i(gl.getUniformLocation(progV, "u_texH"), 0);
  gl.uniform1i(gl.getUniformLocation(progV, "u_texStatic"), 1);

  gl.useProgram(progC);
  gl.uniform1i(gl.getUniformLocation(progC, "u_orig"), 0);
  gl.uniform1i(gl.getUniformLocation(progC, "u_smooth"), 1);
  gl.uniform1i(gl.getUniformLocation(progC, "u_static"), 2);
  gl.uniform1i(gl.getUniformLocation(progC, "u_masks"), 3);
  gl.uniform1i(gl.getUniformLocation(progC, "u_rim"), 4);

  _glEC = {
    canvas, gl, vao,
    progH, progV, progC,
    uH_stepX: gl.getUniformLocation(progH, "u_stepX"),
    uH_radius: gl.getUniformLocation(progH, "u_radius"),
    uH_premask: gl.getUniformLocation(progH, "u_premask"),
    uV_stepY: gl.getUniformLocation(progV, "u_stepY"),
    uV_radius: gl.getUniformLocation(progV, "u_radius"),
    uV_doThresh: gl.getUniformLocation(progV, "u_doThresh"),
    uC_rimStrength: gl.getUniformLocation(progC, "u_rimStrength"),
    uC_hasRim: gl.getUniformLocation(progC, "u_hasRim"),
    uploadedCache: null,
    lastR1: -1,
    lastRimR1: -1,
    lastRimRadius: -1,
  };
  return _glEC;
}

function createGLTexRGBA8(gl, w, h, data) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createGLFbo(gl, tex) {
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return fbo;
}

function renderEdgeCurveWebGL(cache, p) {
  const ec = initGLEdgeCurveContext();
  if (!ec) return null;
  const { gl, canvas, vao } = ec;
  const { bw, bh } = cache;

  if (ec.uploadedCache !== cache) {
    destroyGLEdgeCurveResources();
    canvas.width = bw;
    canvas.height = bh;
    ec.texOrig = createGLTexRGBA8(gl, bw, bh, new Uint8Array(cache.subData.buffer, cache.subData.byteOffset, cache.subData.byteLength));
    ec.texSmooth = createGLTexRGBA8(gl, bw, bh, cache.smoothRgba);
    ec.texRawZones = createGLTexRGBA8(gl, bw, bh, cache.rawZonesRgba);
    ec.texStatic = createGLTexRGBA8(gl, bw, bh, cache.staticWeightsRgba);

    ec.texPing = createGLTexRGBA8(gl, bw, bh, null);
    ec.texPong = createGLTexRGBA8(gl, bw, bh, null);
    ec.texMasks = createGLTexRGBA8(gl, bw, bh, null);
    ec.texRim = createGLTexRGBA8(gl, bw, bh, null);

    ec.fboPing = createGLFbo(gl, ec.texPing);
    ec.fboPong = createGLFbo(gl, ec.texPong);
    ec.fboMasks = createGLFbo(gl, ec.texMasks);
    ec.fboRim = createGLFbo(gl, ec.texRim);
    ec.uploadedCache = cache;
  }

  gl.disable(gl.BLEND);
  gl.bindVertexArray(vao);
  gl.viewport(0, 0, bw, bh);

  const stepX = 1.0 / bw;
  const stepY = 1.0 / bh;

  const runNormalizedBlurPass = (srcTex, dstFbo, radius, premask, doThresh) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, ec.fboPing);
    gl.useProgram(ec.progH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1f(ec.uH_stepX, stepX);
    gl.uniform1i(ec.uH_radius, radius);
    gl.uniform1i(ec.uH_premask, premask ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
    gl.useProgram(ec.progV);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ec.texPing);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ec.texStatic);
    gl.uniform1f(ec.uV_stepY, stepY);
    gl.uniform1i(ec.uV_radius, radius);
    gl.uniform1i(ec.uV_doThresh, doThresh ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const detailFrac = (p.maskDetail ?? 65) / 100;
  const r1 = Math.max(1, Math.round(2 + Math.pow(1 - detailFrac, 1.3) * 16));
  const r2 = Math.max(1, Math.round(r1 * 0.75));
  const r3 = Math.max(1, Math.round(r1 * 0.5));

  if (ec.lastR1 !== r1) {
    runNormalizedBlurPass(ec.texRawZones, ec.fboPong, r1, false, false);
    runNormalizedBlurPass(ec.texPong, ec.fboMasks, r2, true, false);
    runNormalizedBlurPass(ec.texMasks, ec.fboPong, r3, true, true);
    runNormalizedBlurPass(ec.texPong, ec.fboMasks, 2, true, false);
    runNormalizedBlurPass(ec.texMasks, ec.fboPong, 1, true, false);
    // Swap fboPong & fboMasks so texMasks holds final anti-aliased masks
    const tmpTex = ec.texMasks, tmpFbo = ec.fboMasks;
    ec.texMasks = ec.texPong; ec.fboMasks = ec.fboPong;
    ec.texPong = tmpTex; ec.fboPong = tmpFbo;

    ec.lastR1 = r1;
    ec.lastRimR1 = -1;
  }

  const edgeThick = p.edgeThickness ?? 0;
  const rimStrength = Math.min(0.65, (edgeThick / 100) * 0.55);
  if (edgeThick > 0) {
    const rimRadius = Math.max(1, Math.round(1 + (edgeThick / 100) * 5));
    if (ec.lastRimR1 !== r1 || ec.lastRimRadius !== rimRadius) {
      runNormalizedBlurPass(ec.texMasks, ec.fboRim, rimRadius, true, false);
      ec.lastRimR1 = r1;
      ec.lastRimRadius = rimRadius;
    }
  }

  // Final Composite to Default Framebuffer (ec.canvas)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(ec.progC);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ec.texOrig);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ec.texSmooth);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, ec.texStatic);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, ec.texMasks);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, ec.texRim);
  gl.uniform1f(ec.uC_rimStrength, rimStrength);
  gl.uniform1i(ec.uC_hasRim, edgeThick > 0 ? 1 : 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  return canvas;
}

function rerenderLiveEdgeCurveLayer(skipComposite = false) {
  const lyr = STATE.layers.edge_curve;
  if (!lyr || !STATE.serverImages.edge_curve) return;
  const cache = getOrBuildEdgeCurveCache();
  if (!cache) return;

  const [cw, ch] = STATE.payload.canvas_size;
  const p = lyr.params;

  // Fast path: WebGL2 GPU shader pipeline (~0.8 ms on mobile & desktop)
  const glCanvas = renderEdgeCurveWebGL(cache, p);
  if (glCanvas) {
    const ctx = lyr.baseCanvas.getContext("2d");
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(glCanvas, cache.bx, cache.by);
    if (_stack.id !== "edge_curve") invalidateStack();
    if (!skipComposite) compositeAllLayers();
    return;
  }

  // Fallback path if WebGL2 is unavailable
  const {
    bx, by, bw, bh,
    subData, smoothR, smoothG, smoothB, alpha, insideMask,
    outerEdgeFade, interiorWeight, texRatio, darkRaw, lightRaw,
  } = cache;
  const n = bw * bh;

  const detailFrac = (p.maskDetail ?? 65) / 100;
  const r1 = Math.max(1, Math.round(2 + Math.pow(1 - detailFrac, 1.3) * 16));
  const r2 = Math.max(1, Math.round(r1 * 0.75));
  const r3 = Math.max(1, Math.round(r1 * 0.5));

  let darkBlur = normalizedBlurFloat32(darkRaw, insideMask, bw, bh, r1);
  darkBlur = normalizedBlurFloat32(darkBlur, insideMask, bw, bh, r2);
  darkBlur = normalizedBlurFloat32(darkBlur, insideMask, bw, bh, r3);

  let lightBlur = normalizedBlurFloat32(lightRaw, insideMask, bw, bh, r1);
  lightBlur = normalizedBlurFloat32(lightBlur, insideMask, bw, bh, r2);
  lightBlur = normalizedBlurFloat32(lightBlur, insideMask, bw, bh, r3);

  const darkThresh = new Float32Array(n);
  const lightThresh = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    darkThresh[i] = Math.max(0, Math.min(1, (darkBlur[i] - 0.42) / 0.16));
    lightThresh[i] = Math.max(0, Math.min(1, (lightBlur[i] - 0.42) / 0.16));
  }

  let darkMask = normalizedBlurFloat32(darkThresh, insideMask, bw, bh, 2);
  darkMask = normalizedBlurFloat32(darkMask, insideMask, bw, bh, 1);

  let lightMask = normalizedBlurFloat32(lightThresh, insideMask, bw, bh, 2);
  lightMask = normalizedBlurFloat32(lightMask, insideMask, bw, bh, 1);

  let dRim = null, lRim = null;
  const edgeThick = p.edgeThickness ?? 0;
  if (edgeThick > 0) {
    const rimRadius = Math.max(1, Math.round(1 + (edgeThick / 100) * 5));
    dRim = normalizedBlurFloat32(darkMask, insideMask, bw, bh, rimRadius);
    lRim = normalizedBlurFloat32(lightMask, insideMask, bw, bh, rimRadius);
  }
  const rimStrength = Math.min(0.65, (edgeThick / 100) * 0.55);

  const outImg = new ImageData(bw, bh);
  const out = outImg.data;

  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    if (a === 0) continue;
    const idx = i * 4;
    const origR = subData[idx], origG = subData[idx + 1], origB = subData[idx + 2];
    const fade = outerEdgeFade[i];
    if (fade <= 0.001) {
      out[idx] = origR; out[idx + 1] = origG; out[idx + 2] = origB; out[idx + 3] = a;
      continue;
    }

    const sr = smoothR[i], sg = smoothG[i], sb = smoothB[i];
    const dm = darkMask[i];
    const lm = lightMask[i] * (1 - dm);
    const mm = Math.max(0, 1 - dm - lm);

    const dr = sr * 0.66, dg = sg * 0.66, db = sb * 0.66;
    const lr = 255 - (255 - sr) * 0.78;
    const lg = 255 - (255 - sg) * 0.78;
    const lb = 255 - (255 - sb) * 0.78;

    const tex = texRatio[i];
    let r = (dr * dm + sr * mm + lr * lm) * tex;
    let g = (dg * dm + sg * mm + lg * lm) * tex;
    let b = (db * dm + sb * mm + lb * lm) * tex;

    if (edgeThick > 0 && interiorWeight[i] > 0) {
      const drimVal = 4 * dRim[i] * (1 - dRim[i]);
      const lrimVal = 4 * lRim[i] * (1 - lRim[i]);
      const rim = Math.max(drimVal, lrimVal) * interiorWeight[i];
      const darkenFactor = 1 - rim * rimStrength;
      r *= darkenFactor; g *= darkenFactor; b *= darkenFactor;
    }

    out[idx] = Math.max(0, Math.min(255, origR * (1 - fade) + r * fade));
    out[idx + 1] = Math.max(0, Math.min(255, origG * (1 - fade) + g * fade));
    out[idx + 2] = Math.max(0, Math.min(255, origB * (1 - fade) + b * fade));
    out[idx + 3] = a;
  }

  const tempC = createCanvas(bw, bh);
  tempC.getContext("2d").putImageData(outImg, 0, 0);
  const ctx = lyr.baseCanvas.getContext("2d");
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(tempC, bx, by);

  if (_stack.id !== "edge_curve") invalidateStack();
  if (!skipComposite) compositeAllLayers();
}

// ============================================================================
// 8C. 25x FASTER BOUNDING-BOX CONTOUR SEARCH & PROCEDURAL BRUSH ENGINE
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
  const key = `${layerId}_${spacing}`;
  let cached = _ellipseGeomCache.get(key);
  if (cached) return cached;

  const isOuter = def.id === "outer_white";
  const isDark = def.id === "dark_ellipse";
  const prefix = isDark ? "DARK_ELLIPSE" : isOuter ? "OUTER_WHITE_BRUSH" : "WHITE_BRUSH";
  const inset = isDark ? 0 : cfg[`${prefix}_ELLIPSE_INSET`] ?? (isOuter ? -200 : -40);
  const falloff = isDark ? 0 : cfg[`${prefix}_OPACITY_FALLOFF`] ?? (isOuter ? 0.0 : 0.8);
  const blendAmt = isDark ? 0 : cfg[`${prefix}_OUTLINE_BLEND`] ?? (isOuter ? 0.0 : 0.25);
  const rotOffset = cfg[`${prefix}_ROTATION_OFFSET`] ?? 180;

  const cx = Math.trunc(w / 2), cy = Math.trunc(h / 2);
  const maxDist = Math.hypot(cx, cy);
  const rx = Math.max(10, cx - inset), ry = Math.max(10, cy - inset);
  const circum = 2 * Math.PI * Math.max(rx, ry);
  const numPts = Math.max(1, Math.trunc(circum / spacing));
  const bottomThresh = h * (1 - (cfg.DARK_ELLIPSE_BOTTOM_PERCENT ?? 0.15));

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

function rerenderProceduralLayer(layerId, skipComposite = false) {
  const lyr = STATE.layers[layerId];
  if (!lyr || !STATE.payload) return;
  const def = lyr.def;
  const p = lyr.params;
  const cfg = STATE.payload.preset_settings;
  const [w, h] = STATE.payload.canvas_size;
  const [offX, offY] = STATE.payload.offset;
  const edges = STATE.payload.stroke_data.edges;
  const brushKey = STATE.brushImages[p.brushFile] ? p.brushFile : Object.keys(STATE.brushImages)[0];
  const brushImg = STATE.brushImages[brushKey];
  if (!brushImg) return;

  const ctx = lyr.baseCanvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

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

    const glCanvas = drawStrokesWebGL(w, h, brushKey, brushImg, strokes);
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
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }
  } else if (def.type === "mask_blur" && STATE.serverImages.blur_bg) {
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
    const glCanvas = drawStrokesWebGL(w, h, brushKey, brushImg, strokes);
    if (glCanvas) {
      ctx.drawImage(STATE.serverImages.blur_bg, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      ctx.globalAlpha = p.baseOpacity;
      ctx.drawImage(glCanvas, 0, 0);
      ctx.restore();
    } else {
      const maskTemp = createCanvas(w, h);
      const mCtx = maskTemp.getContext("2d");
      for (const s of strokes) colorizeAndDrawBrush(mCtx, brushImg, s.x, s.y, s.size, s.rot, s.rgb, 1.0);
      ctx.drawImage(STATE.serverImages.blur_bg, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      ctx.globalAlpha = p.baseOpacity;
      ctx.drawImage(maskTemp, 0, 0);
      ctx.restore();
    }
  } else if (def.type === "accent") {
    const cands = STATE.payload.stroke_data.accent_candidates || [];
    const spots = STATE.payload.stroke_data.accent_spots || [];
    const step = Math.max(1, Math.round(p.spacing / 50));
    for (let i = 0; i < cands.length; i += step) {
      const pt = cands[i];
      const deg = (Math.atan2(-pt.ny, pt.nx) * 180) / Math.PI + 270 + (i % 5 - 2) * 25;
      const sz = Math.max(20, Math.round(p.size * (0.75 + (i % 4) * 0.15)));
      strokes.push({ x: pt.x, y: pt.y, size: sz, rot: deg, rgb: pt.color, op: Math.min(1, 0.55 * pt.interest) });
    }
    for (let i = 0; i < spots.length; i += step) {
      const sp = spots[i];
      const deg = (Math.atan2(-sp.ny, sp.nx) * 180) / Math.PI + 270;
      const sz = Math.max(25, Math.round(p.size * 1.05));
      const lightRgb = sp.color.map((c) => Math.min(255, Math.round(c + (255 - c) * 0.65)));
      strokes.push({ x: sp.x, y: sp.y, size: sz, rot: deg, rgb: lightRgb, op: 0.35 });
    }
    const glCanvas = drawStrokesWebGL(w, h, brushKey, brushImg, strokes);
    if (glCanvas) {
      ctx.drawImage(glCanvas, 0, 0);
    } else {
      for (const s of strokes) colorizeAndDrawBrush(ctx, brushImg, s.x, s.y, s.size, s.rot, s.rgb, s.op);
    }
  } else if (def.type === "brush_ellipse" || def.type === "brush_ellipse_dark") {
    const rng = new PythonRandom((cfg.RANDOM_SEED || 42) + (def.seedOffset || 500));
    const geom = getOrBuildEllipseGeometry(layerId, def, p.spacing, w, h, offX, offY, edges, cfg);

    for (let i = 0; i < geom.length; i++) {
      const g = geom[i];
      let rotAngle = g.baseRot;
      if (p.jiggle > 0) {
        rotAngle += rng.uniform(-180 * p.jiggle, 180 * p.jiggle);
      }
      const variedSize = Math.max(20, Math.trunc(p.size * rng.uniform(0.7, 1.3)));
      strokes.push({ x: g.ex, y: g.ey, size: variedSize, rot: rotAngle, rgb: g.rgb, op: g.ptOp });
    }

    const glCanvas = drawStrokesWebGL(w, h, brushKey, brushImg, strokes);
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
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }
  }

  if (_stack.id !== layerId) {
    invalidateStack();
  }
  if (!skipComposite) {
    compositeAllLayers();
  }
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
      if (STATE.selectedLayerId !== def.id) invalidateStack();
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

  const maxOp = def.type === "accent" ? 200 : 100;
  addSlider(container, "Layer Opacity", Math.round(p.opacity * 100), 0, maxOp, "%", (val) => {
    p.opacity = val / 100;
    if (_stack.id !== def.id) invalidateStack();
    scheduleComposite();
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
      scheduleComposite();
    });
  }

  if (def.type === "oil") {
    addSlider(container, "Oil Paint Thickness (Smoothness)", p.thickness, -50, 100, "%", (val) => {
      p.thickness = val;
      scheduleOilRerender();
    });
    addSlider(container, "Bristle Relief & Detail", p.detailPop, 0, 100, "%", (val) => {
      p.detailPop = val;
      scheduleOilRerender();
    });
  }

  if (def.id === "edge_curve") {
    addSlider(container, "Mask Detail (Coarse ↔ Fine)", p.maskDetail, 0, 100, "%", (val) => {
      p.maskDetail = val;
      scheduleEdgeCurveRerender();
    });
    addSlider(container, "Segment Edge Thickness", p.edgeThickness, 0, 100, "%", (val) => {
      p.edgeThickness = val;
      scheduleEdgeCurveRerender();
    });
  }

  addSlider(container, "Brightness", p.brightness, 30, 200, "%", (val) => {
    p.brightness = val;
    scheduleComposite();
  });

  addSlider(container, "Contrast", p.contrast, 30, 200, "%", (val) => {
    p.contrast = val;
    scheduleComposite();
  });

  addSlider(container, "Saturation", p.saturation, 0, 250, "%", (val) => {
    p.saturation = val;
    scheduleComposite();
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
  cancelPendingSchedules();
  if (_stack.id !== layerId) invalidateStack();
  const lyr = STATE.layers[layerId];
  if (!lyr || !STATE.payload) return;
  const [w, h] = STATE.payload.canvas_size;
  const cfg = STATE.payload.preset_settings;

  lyr.params = buildInitialLayerParams(lyr.def, cfg);
  lyr.paintCanvas = null;
  lyr.eraseCanvas = null;

  const bCtx = lyr.baseCanvas.getContext("2d");
  bCtx.clearRect(0, 0, w, h);
  if (
    ["brush_edge", "brush_dots", "brush_ellipse", "brush_ellipse_dark", "mask_blur"].includes(
      lyr.def.type
    )
  ) {
    rerenderProceduralLayer(layerId, true);
  } else if (layerId === "edge_curve") {
    rerenderLiveEdgeCurveLayer(true);
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

  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (!STATE.payload) return;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom(STATE.zoom * factor, e.clientX, e.clientY);
  }, { passive: false });

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
    scheduleComposite();
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
  scheduleComposite();
}

const _maskOverlayCanvas = document.createElement("canvas");
function renderMaskEditorView() {
  const [w, h] = STATE.payload.canvas_size;
  const [offX, offY] = STATE.payload.offset;
  const [subW, subH] = STATE.payload.subject_size;
  displayCtx.clearRect(0, 0, w, h);
  displayCtx.fillStyle = "#f8fafc"; displayCtx.fillRect(0, 0, w, h);
  displayCtx.drawImage(STATE.originalImg, offX, offY, subW, subH);
  if (_maskOverlayCanvas.width !== subW || _maskOverlayCanvas.height !== subH) {
    _maskOverlayCanvas.width = subW;
    _maskOverlayCanvas.height = subH;
  }
  const oCtx = _maskOverlayCanvas.getContext("2d");
  oCtx.clearRect(0, 0, subW, subH);
  oCtx.globalCompositeOperation = "source-over";
  oCtx.fillStyle = "rgba(239, 68, 68, 0.55)";
  oCtx.fillRect(0, 0, subW, subH);
  oCtx.globalCompositeOperation = "destination-out";
  oCtx.drawImage(STATE.maskCanvas, 0, 0, subW, subH);
  oCtx.globalCompositeOperation = "source-over";
  displayCtx.drawImage(_maskOverlayCanvas, offX, offY);
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

  const mx = (anchorClientX !== undefined ? anchorClientX : vRect.left + vRect.width / 2) - vRect.left;
  const my = (anchorClientY !== undefined ? anchorClientY : vRect.top + vRect.height / 2) - vRect.top;

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
  if (!STATE.payload) return;
  cancelPendingSchedules();
  invalidateStack();
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