/**
 * 🧭 Watercolor Studio — Modular Multi-Step Workflow & Smart Crop Controller
 * Steps: "upload" -> "crop" (Smart Move, Zoom & Mask Edit) -> "studio" (60 FPS Layer Editor)
 */

const Workflow = (() => {
  let _initialized = false;
  let currentStep = "upload";

  const CROP = {
    sourceImg: null,
    sourceCanvas: null,
    sourcePhotoData: null,
    maskArr: null,
    maskCanvas: null,
    maskTintCanvas: null,
    cutoutCanvas: null,
    visionResult: null,
    analysis: null,
    lastFraming: null,
    zoomPct: 97,
    dxPct: 0,
    dyPct: 0,
    showGuides: true,
    maskEditMode: false,
    maskPaintKeep: true,
    maskBrushSize: 48,
    maskViewZoom: 1.0,
    maskViewPanX: 0,
    maskViewPanY: 0,
    isPanningMaskView: false,
    spacePressed: false,
    isDragging: false,
    lastMaskPt: null,
    dragStart: { x: 0, y: 0, dxPct: 0, dyPct: 0 },
    pinchStartDist: null,
    pinchStartZoom: 97,
  };

  function init() {
    if (_initialized) return;
    _initialized = true;
    syncConfigToFramingEngine();
    bindStepButtons();
    bindCropControls();
    goTo("upload");
  }

  function syncConfigToFramingEngine() {
    if (!window.WatercolorFraming || !window.STUDIO_CONFIG) return;
    const F = window.WatercolorFraming;
    const m = window.STUDIO_CONFIG.FRAMING_TARGETS_METERS;
    if (m && m.animal && F.PROFILES.animal) {
      const a = m.animal;
      const hw = 1 - 2 * (a.sideMargin / a.canvasW);
      F.PROFILES.animal.sideMargin = a.sideMargin / a.canvasW;
      F.PROFILES.animal.headTop = a.headTop / a.canvasH;
      F.PROFILES.animal.eyeTargetY = a.eyeY / a.canvasH;
      F.PROFILES.animal.eyeRatio = (a.eyeY - a.headTop) / (hw * a.canvasW);
      Object.assign(F.PROFILES.person, F.PROFILES.animal);
    }
    if (m && m.car && F.PROFILES.car) {
      const c = m.car;
      F.PROFILES.car.margins = {
        left: c.left / c.canvasW,
        right: c.right / c.canvasW,
        top: c.top / c.canvasH,
        bottom: c.bottom / c.canvasH,
      };
    }
  }

  function goTo(stepId) {
    currentStep = stepId;
    document.body.dataset.step = stepId;

    const emptyState = document.getElementById("emptyState");
    const cropStage = document.getElementById("cropStage");
    const canvasContainer = document.getElementById("canvasContainer");
    const floatingZoom = document.getElementById("floatingZoom");
    const floatingHistory = document.getElementById("floatingHistory");
    const leftToolbar = document.getElementById("leftToolbar");
    const rightInspector = document.getElementById("rightInspector");
    const mobileNav = document.getElementById("mobileNav");

    if (emptyState) emptyState.classList.toggle("hidden", stepId !== "upload");
    if (cropStage) cropStage.classList.toggle("hidden", stepId !== "crop");
    if (canvasContainer) canvasContainer.classList.toggle("hidden", stepId !== "studio");
    if (floatingZoom) floatingZoom.classList.toggle("hidden", stepId !== "studio");
    // Show Undo/Redo history pill in both Step 2 ("crop") and Step 3 ("studio")
    if (floatingHistory) floatingHistory.classList.toggle("hidden", stepId === "upload");

    if (leftToolbar) leftToolbar.classList.toggle("step-disabled", stepId !== "studio");
    if (rightInspector) rightInspector.classList.toggle("step-disabled", stepId !== "studio");
    if (mobileNav) mobileNav.classList.toggle("hidden", stepId !== "studio");

    document.querySelectorAll("[data-step-btn]").forEach((btn) => {
      const s = btn.dataset.stepBtn;
      btn.classList.toggle("active", s === stepId);
      if (s === "crop") btn.disabled = !CROP.sourceCanvas;
      if (s === "studio") btn.disabled = !STATE.payload;
    });

    if (stepId === "crop" && CROP.analysis) {
      syncOrientationButtonsUI();
      requestAnimationFrame(() => renderCropPreview());
    } else if (stepId === "studio" && STATE.payload) {
      fitCanvasToViewport();
      compositeAllLayers();
    }
  }

  function bindStepButtons() {
    document.querySelectorAll("[data-step-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!btn.disabled) goTo(btn.dataset.stepBtn);
      });
    });
  }

  async function startFromUploadedFile(file) {
    if (!file) return;
    init();
    STATE.uploadedFile = file;
    STATE.maskEditedByUser = false;
    History.clear();

    const url = URL.createObjectURL(file);
    const rawImg = await loadImage(url);

    const maxDim = IS_MOBILE ? 1024 : 1400;
    const scale = Math.min(1, maxDim / Math.max(rawImg.naturalWidth || rawImg.width, rawImg.naturalHeight || rawImg.height));
    const sw = Math.max(1, Math.round((rawImg.naturalWidth || rawImg.width) * scale));
    const sh = Math.max(1, Math.round((rawImg.naturalHeight || rawImg.height) * scale));

    const srcC = createCanvas(sw, sh);
    const srcCtx = srcC.getContext("2d");
    srcCtx.drawImage(rawImg, 0, 0, sw, sh);
    const photoData = srcCtx.getImageData(0, 0, sw, sh);

    CROP.sourceImg = rawImg;
    CROP.sourceCanvas = srcC;
    CROP.sourcePhotoData = photoData;

    let transparentPx = 0;
    for (let i = 3; i < photoData.data.length; i += 16) {
      if (photoData.data[i] < 245) transparentPx++;
    }
    const isTransparentPng = transparentPx > ((sw * sh) / 4) * 0.01;

    startProgressBar(false);
    const loadingText = document.getElementById("loadingText");
    const loadingSub = document.getElementById("loadingSubtext");
    if (loadingText) loadingText.textContent = "Removing background & detecting subject...";
    if (loadingSub) loadingSub.textContent = "Running AI face/eye & vehicle recognition in parallel";

    try {
      const visionPromise = window.SubjectVision
        ? window.SubjectVision.detect(srcC, { timeoutMs: 4500 })
        : Promise.resolve(null);

      let maskArr;
      if (isTransparentPng) {
        maskArr = window.WatercolorFraming.maskFromImageData(photoData, "alpha");
        CROP.visionResult = await visionPromise;
      } else {
        const [maskImg, visionRes] = await Promise.all([
          fetchSubjectMaskFromBackend(rawImg),
          visionPromise,
        ]);
        CROP.visionResult = visionRes;
        const mc = createCanvas(sw, sh);
        const mCtx = mc.getContext("2d");
        mCtx.drawImage(maskImg, 0, 0, sw, sh);
        const mData = mCtx.getImageData(0, 0, sw, sh);
        maskArr = window.WatercolorFraming.maskFromImageData(mData, "luma");
      }

      finalizeCropMask(maskArr, sw, sh);
    } catch (err) {
      alert("Error analyzing subject: " + err.message);
      console.error(err);
    } finally {
      finishProgressBar();
    }
  }

  async function fetchSubjectMaskFromBackend(img) {
    const presetKey = document.getElementById("presetSelect").value;
    const blob = await prepareOptimizedUploadBlob(img, presetKey);
    const fd = new FormData();
    fd.append("image_file", blob, "upload.jpg");
    fd.append("preset_key", presetKey);

    try {
      const resCut = await fetch(`${STATE.apiUrl}/cutout`, { method: "POST", body: fd });
      if (resCut.ok) {
        const data = await resCut.json();
        if (data.presets) STATE.serverPresets = data.presets;
        if (data.raw_mask_png) return await loadImage(data.raw_mask_png);
      }
    } catch (_) {}

    const fdGen = new FormData();
    fdGen.append("image_file", blob, "upload.jpg");
    fdGen.append("preset_key", presetKey);
    const res = await fetch(`${STATE.apiUrl}/generate`, { method: "POST", body: fdGen });
    if (!res.ok) throw new Error(`Server status ${res.status}`);
    const payload = await res.json();
    return await loadImage(payload.raw_mask_png || payload.mask_png);
  }

  // Builds CROP.cutoutCanvas and CROP.maskTintCanvas (solid black where removed; drawn at 0.5 alpha)
  function rebuildCutoutAndTintFromMaskCanvas() {
    if (!CROP.sourceCanvas || !CROP.maskCanvas) return;
    const sw = CROP.sourceCanvas.width;
    const sh = CROP.sourceCanvas.height;
    const mData = CROP.maskCanvas.getContext("2d").getImageData(0, 0, sw, sh).data;

    if (!CROP.maskArr || CROP.maskArr.length !== sw * sh) {
      CROP.maskArr = new Uint8Array(sw * sh);
    }
    if (!CROP.cutoutCanvas || CROP.cutoutCanvas.width !== sw || CROP.cutoutCanvas.height !== sh) {
      CROP.cutoutCanvas = createCanvas(sw, sh);
    }
    if (!CROP.maskTintCanvas || CROP.maskTintCanvas.width !== sw || CROP.maskTintCanvas.height !== sh) {
      CROP.maskTintCanvas = createCanvas(sw, sh);
    }

    const cCtx = CROP.cutoutCanvas.getContext("2d");
    cCtx.clearRect(0, 0, sw, sh);
    cCtx.drawImage(CROP.sourceCanvas, 0, 0);
    const cImg = cCtx.getImageData(0, 0, sw, sh);
    const cData = cImg.data;

    const tCtx = CROP.maskTintCanvas.getContext("2d");
    const tImg = tCtx.createImageData(sw, sh);
    const tData = tImg.data;

    for (let i = 0; i < CROP.maskArr.length; i++) {
      const p = i * 4;
      const v = mData[p];
      CROP.maskArr[i] = v;
      cData[p + 3] = Math.min(cData[p + 3], v);
      // Store full black with alpha = (255 - v), then composite at globalAlpha = 0.5
      tData[p] = 0;
      tData[p + 1] = 0;
      tData[p + 2] = 0;
      tData[p + 3] = 255 - v;
    }
    cCtx.putImageData(cImg, 0, 0);
    tCtx.putImageData(tImg, 0, 0);
  }

  function finalizeCropMask(maskArr, sw, sh) {
    CROP.maskArr = maskArr;

    const mc = createCanvas(sw, sh);
    const mCtx = mc.getContext("2d", { willReadFrequently: true });
    const mImg = mCtx.createImageData(sw, sh);
    for (let i = 0; i < maskArr.length; i++) {
      const v = maskArr[i];
      const p = i * 4;
      mImg.data[p] = v; mImg.data[p + 1] = v; mImg.data[p + 2] = v; mImg.data[p + 3] = 255;
    }
    mCtx.putImageData(mImg, 0, 0);
    CROP.maskCanvas = mc;

    rebuildCutoutAndTintFromMaskCanvas();
    rebuildAnalysisWithVision(true);

    const presetSelect = document.getElementById("presetSelect");
    if (presetSelect && CROP.analysis && !CROP.analysis.empty) {
      if (window.SubjectVision && window.SubjectVision.recommendPreset) {
        presetSelect.value = window.SubjectVision.recommendPreset(
          CROP.analysis,
          CROP.visionResult,
          CROP.sourcePhotoData,
          CROP.maskArr
        );
      } else {
        const resolved = window.WatercolorFraming.resolveProfile(CROP.analysis, "auto");
        if (resolved.key === "car") presetSelect.value = "cars_black";
        else if (resolved.key === "person") presetSelect.value = "people";
        else presetSelect.value = "animals";
      }
    }

    const profKey = getActiveProfileKey();
    STATE.aspectOrientation = profKey === "car" ? "landscape" : "portrait";
    syncOrientationButtonsUI();
    toggleStep2MaskMode(false);

    resetCropToSmartDefault();
    goTo("crop");
  }

  function rebuildAnalysisWithVision(isNewUpload = false) {
    if (!CROP.maskArr || !CROP.sourceCanvas) return;
    const F = window.WatercolorFraming;
    const sw = CROP.sourceCanvas.width;
    const sh = CROP.sourceCanvas.height;
    const presetKey = isNewUpload ? "auto" : document.getElementById("presetSelect").value;
    const forcedCar = !isNewUpload && presetKey.startsWith("cars");

    let an = F.analyzeMask(CROP.maskArr, sw, sh, {
      photoImageData: CROP.sourcePhotoData,
      isCarHint: forcedCar,
    });

    if (window.SubjectVision) {
      an = window.SubjectVision.fuse(an, CROP.visionResult, { presetKey });
    }
    CROP.analysis = an;
  }

  function getActiveProfileKey() {
    const presetKey = document.getElementById("presetSelect").value;
    if (presetKey.startsWith("cars")) return "car";
    if (presetKey === "people") return "person";
    if (presetKey.startsWith("animals")) return "animal";
    if (CROP.analysis && !CROP.analysis.empty) {
      if (CROP.analysis.subjects && CROP.analysis.subjects.kind) {
        return CROP.analysis.subjects.kind;
      }
      return window.WatercolorFraming.resolveProfile(CROP.analysis, "auto").key;
    }
    return "animal";
  }

  function getTargetCanvasCm() {
    const profileKey = getActiveProfileKey();
    const ratioSel = document.getElementById("cropCanvasRatio");
    const val = ratioSel ? ratioSel.value : STATE.aspectRatioKey || "a4";
    STATE.aspectRatioKey = val;
    if (typeof window.parseAspectRatioToCm === "function") {
      return window.parseAspectRatioToCm(val, profileKey, STATE.aspectOrientation);
    }
    return profileKey === "car" ? { width: 141.42, height: 100 } : { width: 100, height: 141.42 };
  }

  function syncOrientationButtonsUI() {
    const profKey = getActiveProfileKey();
    const orient = STATE.aspectOrientation || (profKey === "car" ? "landscape" : "portrait");
    const pBtn = document.getElementById("cropOrientPortraitBtn");
    const lBtn = document.getElementById("cropOrientLandscapeBtn");
    if (pBtn) pBtn.className = orient === "portrait" ? "btn btn-sm btn-primary full-width" : "btn btn-sm btn-outline full-width";
    if (lBtn) lBtn.className = orient === "landscape" ? "btn btn-sm btn-primary full-width" : "btn btn-sm btn-outline full-width";

    const topOrientBtn = document.getElementById("topOrientBtn");
    if (topOrientBtn) {
      topOrientBtn.textContent = orient === "landscape" ? "↔️ Landscape" : "↕️ Portrait";
    }
  }

  function setOrientation(orient) {
    STATE.aspectOrientation = orient;
    syncOrientationButtonsUI();
    if (currentStep === "crop") {
      renderCropPreview();
    } else if (currentStep === "studio" && STATE.payload) {
      window.applyStudioAspectRatio(STATE.aspectRatioKey, orient);
    }
  }

  function setAspectRatio(ratioKey) {
    STATE.aspectRatioKey = ratioKey;
    const cropSel = document.getElementById("cropCanvasRatio");
    const studioSel = document.getElementById("studioAspectRatio");
    if (cropSel && cropSel.value !== ratioKey) cropSel.value = ratioKey;
    if (studioSel && studioSel.value !== ratioKey) studioSel.value = ratioKey;
    if (currentStep === "crop") {
      renderCropPreview();
    } else if (currentStep === "studio" && STATE.payload) {
      window.applyStudioAspectRatio(ratioKey, STATE.aspectOrientation);
    }
  }

  function resetCropToSmartDefault() {
    rebuildCutoutAndTintFromMaskCanvas();
    rebuildAnalysisWithVision(false);
    const presetKey = document.getElementById("presetSelect").value;
    const profileKey = getActiveProfileKey();
    const defaultZoom = window.STUDIO_CONFIG
      ? window.STUDIO_CONFIG.getDefaultZoomPercent(presetKey, profileKey)
      : profileKey === "car" ? 100 : 97;

    CROP.zoomPct = defaultZoom;
    CROP.dxPct = 0;
    CROP.dyPct = 0;
    syncCropSlidersUI();
    renderCropPreview();
  }

  function syncCropSlidersUI() {
    const zSlider = document.getElementById("cropZoomSlider");
    const xSlider = document.getElementById("cropDxSlider");
    const ySlider = document.getElementById("cropDySlider");
    if (zSlider) zSlider.value = Math.round(CROP.zoomPct);
    if (xSlider) xSlider.value = Math.round(CROP.dxPct);
    if (ySlider) ySlider.value = Math.round(CROP.dyPct);

    const zVal = document.getElementById("cropZoomVal");
    const xVal = document.getElementById("cropDxVal");
    const yVal = document.getElementById("cropDyVal");
    if (zVal) zVal.textContent = `${Math.round(CROP.zoomPct)}%`;
    if (xVal) xVal.textContent = `${Math.round(CROP.dxPct)}%`;
    if (yVal) yVal.textContent = `${Math.round(CROP.dyPct)}%`;
  }

  function clampMaskViewPan(cvW, cvH) {
    const z = CROP.maskViewZoom || 1.0;
    if (z <= 1.001) {
      CROP.maskViewZoom = 1.0;
      CROP.maskViewPanX = 0;
      CROP.maskViewPanY = 0;
      return;
    }
    const minX = cvW - cvW * z;
    const minY = cvH - cvH * z;
    CROP.maskViewPanX = Math.max(minX, Math.min(0, CROP.maskViewPanX));
    CROP.maskViewPanY = Math.max(minY, Math.min(0, CROP.maskViewPanY));
  }

  function renderCropPreview() {
    if (!CROP.analysis || CROP.analysis.empty) return;
    const F = window.WatercolorFraming;
    const cv = document.getElementById("cropPreviewCanvas");
    if (!cv) return;
    const g = cv.getContext("2d");

    const cm = getTargetCanvasCm();
    const profileKey = getActiveProfileKey();
    const stageEl = document.getElementById("cropStage");
    const isNarrow = window.innerWidth <= 960;
    const availW = stageEl && stageEl.clientWidth > 100 ? (isNarrow ? stageEl.clientWidth - 32 : stageEl.clientWidth - 380) : 520;
    const availH = stageEl && stageEl.clientHeight > 100 ? (isNarrow ? stageEl.clientHeight * 0.48 : stageEl.clientHeight - 80) : 520;
    const maxW = Math.max(240, Math.min(580, availW));
    const maxH = Math.max(240, Math.min(560, availH));
    // Never force a minimum k that exceeds maxW or maxH so wide/tall 16:9 ratios stay 100% proportional
    const k = Math.min(maxW / cm.width, maxH / cm.height);

    cv.width = Math.max(120, Math.round(cm.width * k));
    cv.height = Math.max(120, Math.round(cm.height * k));
    cv.style.width = `${cv.width}px`;
    cv.style.height = `${cv.height}px`;
    clampMaskViewPan(cv.width, cv.height);
    cv.style.cursor = CROP.maskEditMode ? (CROP.spacePressed || CROP.isPanningMaskView ? "grab" : "none") : "grab";

    const presetKey = document.getElementById("presetSelect").value;
    const isDarkBg = presetKey.endsWith("_black");
    g.fillStyle = CROP.maskEditMode ? "#121212" : isDarkBg ? "#141414" : "#f5efe4";
    g.fillRect(0, 0, cv.width, cv.height);

    const fr = F.computeFraming(CROP.analysis, cm, {
      profile: profileKey,
      adjust: {
        zoom: CROP.zoomPct / 100,
        dx: CROP.dxPct / 100,
        dy: CROP.dyPct / 100,
      },
    });
    CROP.lastFraming = fr;

    const px = (u) => u * k;
    const r = fr.rectUnits;

    g.save();
    if (CROP.maskEditMode && CROP.maskViewZoom > 1.0) {
      g.translate(CROP.maskViewPanX, CROP.maskViewPanY);
      g.scale(CROP.maskViewZoom, CROP.maskViewZoom);
    }

    if (CROP.maskEditMode) {
      g.drawImage(CROP.sourceCanvas, px(r.x), px(r.y), px(r.w), px(r.h));
      if (CROP.maskTintCanvas) {
        g.globalAlpha = 0.5;
        g.drawImage(CROP.maskTintCanvas, px(r.x), px(r.y), px(r.w), px(r.h));
      }
    } else {
      g.globalAlpha = 0.14;
      g.drawImage(CROP.sourceCanvas, px(r.x), px(r.y), px(r.w), px(r.h));
      g.globalAlpha = 1.0;
      g.drawImage(CROP.cutoutCanvas, px(r.x), px(r.y), px(r.w), px(r.h));
    }
    g.restore();

    if (CROP.showGuides && !CROP.maskEditMode) {
      const W = cm.width, H = cm.height, t = fr.targets, m = fr.metrics;
      const drawLine = (x0, y0, x1, y1, col, dash) => {
        g.strokeStyle = col; g.lineWidth = 1.5; g.setLineDash(dash || []);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
      };

      if (fr.mode === "bleed") {
        drawLine(px(t.headLeft), 0, px(t.headLeft), cv.height, "rgba(37,99,235,0.65)", [6, 4]);
        drawLine(px(W - t.headRight), 0, px(W - t.headRight), cv.height, "rgba(37,99,235,0.65)", [6, 4]);
        drawLine(0, px(t.headTop), cv.width, px(t.headTop), "rgba(37,99,235,0.65)", [6, 4]);
        drawLine(px(W * 0.5), 0, px(W * 0.5), cv.height, "rgba(37,99,235,0.3)", [2, 4]);
        if (m.eyeLine != null) {
          drawLine(0, px(m.eyeLine), cv.width, px(m.eyeLine), "#16a34a", [3, 3]);
        }
        if (fr.eyes && fr.eyes.length > 0) {
          for (const e of fr.eyes) {
            const ex = px(e.x), ey = px(e.y), er = Math.max(5, px(e.r));
            g.strokeStyle = "#16a34a"; g.lineWidth = 2;
            g.beginPath(); g.arc(ex, ey, er, 0, Math.PI * 2); g.stroke();
            g.fillStyle = "#22c55e";
            g.beginPath(); g.arc(ex, ey, 2.5, 0, Math.PI * 2); g.fill();
          }
        }
      } else if (t) {
        g.strokeStyle = "rgba(37,99,235,0.65)"; g.lineWidth = 1.5; g.setLineDash([6, 4]);
        g.strokeRect(px(t.bboxLeft), px(t.bboxTop), px(W - t.bboxLeft - t.bboxRight), px(H - t.bboxTop - t.bboxBottom));
        g.setLineDash([]);
      }
    }

    g.strokeStyle = CROP.maskEditMode ? "#22c55e" : "#b8935a";
    g.lineWidth = 2;
    g.strokeRect(1, 1, cv.width - 2, cv.height - 2);

    const badge = document.getElementById("cropInfoBadge");
    if (badge) {
      if (CROP.maskEditMode) {
        const zTxt = Math.round(CROP.maskViewZoom * 100);
        badge.textContent = `✂️ Mask Brush (${CROP.maskPaintKeep ? "➕ Keep" : "➖ Remove"}) · View ${zTxt}% (Wheel to zoom${zTxt > 100 ? ", Space+Drag to pan" : ""})`;
      } else if (fr.mode === "bleed") {
        const eyeCount = (fr.eyes || []).length;
        const subInfo = CROP.analysis.subjects && CROP.analysis.subjects.faces > 1
          ? `${CROP.analysis.subjects.faces} people (${eyeCount} eyes)`
          : `${eyeCount} eye(s)`;
        badge.textContent = `Head ${(fr.metrics.headWidth / cm.width * 100).toFixed(0)}% width · ${subInfo} · Zoom ${Math.round(CROP.zoomPct)}%`;
      } else {
        badge.textContent = `Vehicle Margin Fit · Zoom ${Math.round(CROP.zoomPct)}%`;
      }
    }
  }

  function getCropMaskCursorDiameter(clientX, clientY) {
    if (currentStep !== "crop" || !CROP.maskEditMode || CROP.spacePressed || CROP.isPanningMaskView) return 0;
    const cv = document.getElementById("cropPreviewCanvas");
    if (!cv) return 0;
    const rect = cv.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return 0;
    }
    return CROP.maskBrushSize * (rect.width / Math.max(1, cv.width)) * (CROP.maskViewZoom || 1.0);
  }

  function paintCropMaskAtClientPoint(clientX, clientY) {
    const cv = document.getElementById("cropPreviewCanvas");
    if (!cv || !CROP.lastFraming || !CROP.maskCanvas) return;
    const rect = cv.getBoundingClientRect();
    const rawCx = (clientX - rect.left) * (cv.width / Math.max(1, rect.width));
    const rawCy = (clientY - rect.top) * (cv.height / Math.max(1, rect.height));

    // Map inverse of maskViewZoom & maskViewPan so zoomed-in painting hits the exact pixel under cursor
    const z = CROP.maskViewZoom || 1.0;
    const cx = (rawCx - (CROP.maskViewPanX || 0)) / z;
    const cy = (rawCy - (CROP.maskViewPanY || 0)) / z;

    const r = CROP.lastFraming.rect;
    const subX = r.x * cv.width;
    const subY = r.y * cv.height;
    const subW = Math.max(1, r.w * cv.width);
    const subH = Math.max(1, r.h * cv.height);

    const sw = CROP.maskCanvas.width;
    const sh = CROP.maskCanvas.height;
    const mx = ((cx - subX) / subW) * sw;
    const my = ((cy - subY) / subH) * sh;
    const radius = Math.max(1.5, (CROP.maskBrushSize * 0.5) * (sw / subW));

    const hasPrev = !!CROP.lastMaskPt;
    const px = hasPrev ? CROP.lastMaskPt.x : mx;
    const py = hasPrev ? CROP.lastMaskPt.y : my;
    const keep = CROP.maskPaintKeep;

    History.touch(
      CROP.maskCanvas,
      Math.min(px, mx) - radius - 2,
      Math.min(py, my) - radius - 2,
      Math.max(px, mx) + radius + 2,
      Math.max(py, my) + radius + 2
    );

    const drawStroke = (ctx) => {
      ctx.lineWidth = radius * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (hasPrev) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(mx, my);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(mx, my, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    const mCtx = CROP.maskCanvas.getContext("2d");
    mCtx.save();
    mCtx.globalCompositeOperation = "source-over";
    mCtx.fillStyle = mCtx.strokeStyle = keep ? "#ffffff" : "#000000";
    drawStroke(mCtx);
    mCtx.restore();

    if (CROP.maskTintCanvas) {
      const tCtx = CROP.maskTintCanvas.getContext("2d");
      tCtx.save();
      tCtx.globalCompositeOperation = keep ? "destination-out" : "source-over";
      tCtx.fillStyle = tCtx.strokeStyle = "#000000";
      drawStroke(tCtx);
      tCtx.restore();
    }

    CROP.lastMaskPt = { x: mx, y: my };
    STATE.maskEditedByUser = true;
    renderCropPreview();
  }

  function onCropMaskHistorySwap() {
    rebuildCutoutAndTintFromMaskCanvas();
    renderCropPreview();
  }

  async function confirmCropAndGenerate() {
    if (!CROP.sourceCanvas || !CROP.maskCanvas || !CROP.lastFraming) return;

    if (CROP.maskEditMode) {
      toggleStep2MaskMode(false);
    } else {
      rebuildCutoutAndTintFromMaskCanvas();
    }

    const presetKey = document.getElementById("presetSelect").value;
    const isCar = presetKey.startsWith("cars");
    const profileKey = getActiveProfileKey();

    const refCm = isCar ? { width: 141.421356, height: 100 } : { width: 100, height: 141.421356 };
    const outW = isCar ? 1782 : 1260;
    const outH = isCar ? 1260 : 1782;

    const refFraming = window.WatercolorFraming.computeFraming(CROP.analysis, refCm, {
      profile: profileKey,
      adjust: {
        zoom: CROP.zoomPct / 100,
        dx: CROP.dxPct / 100,
        dy: CROP.dyPct / 100,
      },
    });
    const px = window.WatercolorFraming.toPixels(refFraming, outW, outH);

    STATE.uncroppedPlacement = {
      sourceImg: CROP.sourceImg,
      sourceCanvas: CROP.sourceCanvas,
      maskCanvas: CROP.maskCanvas,
      cutoutCanvas: CROP.cutoutCanvas,
      refSize: [outW, outH],
      px: { x: px.x, y: px.y, w: px.w, h: px.h },
    };

    const framedPhotoC = createCanvas(outW, outH);
    const fpCtx = framedPhotoC.getContext("2d");
    fpCtx.fillStyle = isCar ? "#ffffff" : "#faf8f4";
    fpCtx.fillRect(0, 0, outW, outH);
    fpCtx.save();
    fpCtx.filter = "blur(24px)";
    fpCtx.drawImage(CROP.sourceImg, 0, 0, outW, outH);
    fpCtx.restore();
    fpCtx.drawImage(CROP.sourceImg, px.x, px.y, px.w, px.h);

    const framedMaskC = createCanvas(outW, outH);
    const fmCtx = framedMaskC.getContext("2d");
    fmCtx.fillStyle = "#000000";
    fmCtx.fillRect(0, 0, outW, outH);
    fmCtx.drawImage(CROP.maskCanvas, px.x, px.y, px.w, px.h);

    // Pass framed canvases directly to ClientWatercolorEngine (saves ~250 ms of base64 encode/decode!)
    STATE.framedPhotoCanvas = framedPhotoC;
    STATE.framedMaskCanvas = framedMaskC;
    STATE.originalImg = framedPhotoC;
    STATE.detectedEyes = px.eyes || [];
    STATE.detectedEyesRefSize = [outW, outH];

    if (profileKey === "animal" || (STATE.detectedEyes && STATE.detectedEyes.length > 0 && profileKey !== "car")) {
      STATE.isAnimalPhoto = true;
    }

    STATE.maskCanvas = null;
    CROP.maskTintCanvas = null;

    if (window.SubjectVision && window.SubjectVision.releaseMemory) {
      await window.SubjectVision.releaseMemory();
    }

    STATE.hasViewportPosition = false;
    goTo("studio");
    await runModalGeneration(false, false);
  }

  function toggleStep2MaskMode(forceState) {
    CROP.maskEditMode = forceState !== undefined ? forceState : !CROP.maskEditMode;
    const btn = document.getElementById("cropMaskToggleBtn");
    const sub = document.getElementById("cropMaskSubPanel");
    if (btn) {
      btn.className = CROP.maskEditMode ? "btn btn-sm btn-primary full-width" : "btn btn-sm btn-outline full-width";
      btn.textContent = CROP.maskEditMode ? "✅ Done Editing Mask" : "✂️ Edit Cutout Mask";
    }
    if (sub) sub.classList.toggle("hidden", !CROP.maskEditMode);
    if (!CROP.maskEditMode) {
      CROP.maskViewZoom = 1.0;
      CROP.maskViewPanX = 0;
      CROP.maskViewPanY = 0;
      brushCursor.classList.add("hidden");
      if (CROP.maskCanvas) {
        rebuildCutoutAndTintFromMaskCanvas();
      }
    }
    if (CROP.analysis) renderCropPreview();
  }

  function bindCropControls() {
    const zSlider = document.getElementById("cropZoomSlider");
    const xSlider = document.getElementById("cropDxSlider");
    const ySlider = document.getElementById("cropDySlider");
    const guidesChk = document.getElementById("cropGuidesChk");
    const ratioSel = document.getElementById("cropCanvasRatio");
    const resetBtn = document.getElementById("cropResetBtn");
    const genBtn = document.getElementById("cropGenerateBtn");
    const cv = document.getElementById("cropPreviewCanvas");

    const pBtn = document.getElementById("cropOrientPortraitBtn");
    const lBtn = document.getElementById("cropOrientLandscapeBtn");
    if (pBtn) pBtn.addEventListener("click", () => setOrientation("portrait"));
    if (lBtn) lBtn.addEventListener("click", () => setOrientation("landscape"));

    const maskToggleBtn = document.getElementById("cropMaskToggleBtn");
    const maskKeepBtn = document.getElementById("cropMaskKeepBtn");
    const maskRemoveBtn = document.getElementById("cropMaskRemoveBtn");
    const maskSizeSlider = document.getElementById("cropMaskSizeSlider");

    if (maskToggleBtn) {
      maskToggleBtn.addEventListener("click", () => toggleStep2MaskMode());
    }
    if (maskKeepBtn) {
      maskKeepBtn.addEventListener("click", () => {
        CROP.maskPaintKeep = true;
        maskKeepBtn.className = "btn btn-sm btn-primary full-width";
        if (maskRemoveBtn) maskRemoveBtn.className = "btn btn-sm btn-outline full-width";
        renderCropPreview();
      });
    }
    if (maskRemoveBtn) {
      maskRemoveBtn.addEventListener("click", () => {
        CROP.maskPaintKeep = false;
        maskRemoveBtn.className = "btn btn-sm btn-primary full-width";
        if (maskKeepBtn) maskKeepBtn.className = "btn btn-sm btn-outline full-width";
        renderCropPreview();
      });
    }
    if (maskSizeSlider) {
      maskSizeSlider.addEventListener("input", () => {
        CROP.maskBrushSize = Number(maskSizeSlider.value);
        const lbl = document.getElementById("cropMaskSizeVal");
        if (lbl) lbl.textContent = maskSizeSlider.value;
      });
    }

    if (zSlider) {
      zSlider.addEventListener("input", () => {
        CROP.zoomPct = Number(zSlider.value);
        syncCropSlidersUI();
        renderCropPreview();
      });
    }
    if (xSlider) {
      xSlider.addEventListener("input", () => {
        CROP.dxPct = Number(xSlider.value);
        syncCropSlidersUI();
        renderCropPreview();
      });
    }
    if (ySlider) {
      ySlider.addEventListener("input", () => {
        CROP.dyPct = Number(ySlider.value);
        syncCropSlidersUI();
        renderCropPreview();
      });
    }
    if (guidesChk) {
      guidesChk.addEventListener("change", () => {
        CROP.showGuides = guidesChk.checked;
        renderCropPreview();
      });
    }
    if (ratioSel) {
      ratioSel.addEventListener("change", () => {
        setAspectRatio(ratioSel.value);
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", resetCropToSmartDefault);
    }
    if (genBtn) {
      genBtn.addEventListener("click", confirmCropAndGenerate);
    }

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && currentStep === "crop" && CROP.maskEditMode && !CROP.spacePressed) {
        CROP.spacePressed = true;
        brushCursor.classList.add("hidden");
        renderCropPreview();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space" && CROP.spacePressed) {
        CROP.spacePressed = false;
        renderCropPreview();
      }
    });

    if (cv) {
      cv.addEventListener("contextmenu", (e) => {
        if (CROP.maskEditMode) e.preventDefault();
      });

      cv.addEventListener("wheel", (e) => {
        e.preventDefault();
        // While editing the cutout mask, mouse wheel zooms the USER VIEW (not the subject!)
        if (CROP.maskEditMode) {
          const rect = cv.getBoundingClientRect();
          const mx = (e.clientX - rect.left) * (cv.width / Math.max(1, rect.width));
          const my = (e.clientY - rect.top) * (cv.height / Math.max(1, rect.height));
          const oldZ = CROP.maskViewZoom || 1.0;
          const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
          const newZ = Math.max(1.0, Math.min(6.0, oldZ * factor));

          const worldX = (mx - CROP.maskViewPanX) / oldZ;
          const worldY = (my - CROP.maskViewPanY) / oldZ;
          CROP.maskViewZoom = newZ;
          CROP.maskViewPanX = mx - worldX * newZ;
          CROP.maskViewPanY = my - worldY * newZ;
          clampMaskViewPan(cv.width, cv.height);
          renderCropPreview();
          if (typeof updateCursorPosition === "function") updateCursorPosition(e.clientX, e.clientY);
          return;
        }

        const delta = e.deltaY < 0 ? 2 : -2;
        CROP.zoomPct = Math.max(65, Math.min(145, CROP.zoomPct + delta));
        syncCropSlidersUI();
        renderCropPreview();
      }, { passive: false });

      cv.addEventListener("pointerdown", (e) => {
        CROP.isDragging = true;
        try { cv.setPointerCapture(e.pointerId); } catch (_) {}
        if (CROP.maskEditMode) {
          // Space+drag, middle-click, or right-click pans the zoomed mask view
          if (CROP.spacePressed || e.button === 1 || e.button === 2) {
            CROP.isPanningMaskView = true;
            CROP.dragStart = {
              x: e.clientX,
              y: e.clientY,
              panX: CROP.maskViewPanX,
              panY: CROP.maskViewPanY,
            };
            return;
          }
          CROP.isPanningMaskView = false;
          CROP.lastMaskPt = null;
          History.beginStroke("crop_mask", null);
          paintCropMaskAtClientPoint(e.clientX, e.clientY);
        } else {
          CROP.dragStart = { x: e.clientX, y: e.clientY, dxPct: CROP.dxPct, dyPct: CROP.dyPct };
        }
      });

      cv.addEventListener("pointermove", (e) => {
        if (!CROP.isDragging) return;
        const rect = cv.getBoundingClientRect();
        if (CROP.maskEditMode) {
          if (CROP.isPanningMaskView) {
            const scaleX = cv.width / Math.max(1, rect.width);
            const scaleY = cv.height / Math.max(1, rect.height);
            CROP.maskViewPanX = CROP.dragStart.panX + (e.clientX - CROP.dragStart.x) * scaleX;
            CROP.maskViewPanY = CROP.dragStart.panY + (e.clientY - CROP.dragStart.y) * scaleY;
            clampMaskViewPan(cv.width, cv.height);
            renderCropPreview();
            return;
          }
          paintCropMaskAtClientPoint(e.clientX, e.clientY);
          return;
        }
        const dX = ((e.clientX - CROP.dragStart.x) / Math.max(1, rect.width)) * 100;
        const dY = ((e.clientY - CROP.dragStart.y) / Math.max(1, rect.height)) * 100;
        CROP.dxPct = Math.max(-35, Math.min(35, CROP.dragStart.dxPct + dX));
        CROP.dyPct = Math.max(-35, Math.min(35, CROP.dragStart.dyPct + dY));
        syncCropSlidersUI();
        renderCropPreview();
      });

      const stopDrag = () => {
        if (CROP.isDragging && CROP.maskEditMode && !CROP.isPanningMaskView) {
          CROP.lastMaskPt = null;
          History.endStroke();
          rebuildCutoutAndTintFromMaskCanvas();
          renderCropPreview();
        }
        CROP.isPanningMaskView = false;
        CROP.isDragging = false;
      };
      cv.addEventListener("pointerup", stopDrag);
      cv.addEventListener("pointercancel", stopDrag);

      cv.addEventListener("touchstart", (e) => {
        if (e.touches.length === 2) {
          CROP.isDragging = false;
          History.endStroke();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          CROP.pinchStartDist = Math.hypot(dx, dy);
          CROP.pinchStartZoom = CROP.maskEditMode ? CROP.maskViewZoom : CROP.zoomPct;
        }
      }, { passive: true });

      cv.addEventListener("touchmove", (e) => {
        if (e.touches.length === 2 && CROP.pinchStartDist) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const scale = Math.hypot(dx, dy) / Math.max(1, CROP.pinchStartDist);
          if (CROP.maskEditMode) {
            CROP.maskViewZoom = Math.max(1.0, Math.min(6.0, CROP.pinchStartZoom * scale));
            clampMaskViewPan(cv.width, cv.height);
          } else {
            CROP.zoomPct = Math.max(65, Math.min(145, CROP.pinchStartZoom * scale));
            syncCropSlidersUI();
          }
          renderCropPreview();
        }
      }, { passive: false });

      cv.addEventListener("touchend", () => { CROP.pinchStartDist = null; });
    }
  }

  let _lastProfileCategory = null;

  function onPresetChangedInUI() {
    const profKey = getActiveProfileKey();
    const newCat = profKey === "car" ? "car" : "portrait";
    if (_lastProfileCategory !== newCat || !STATE.aspectOrientation) {
      STATE.aspectOrientation = newCat === "car" ? "landscape" : "portrait";
    }
    _lastProfileCategory = newCat;
    syncOrientationButtonsUI();

    if (currentStep === "crop" && CROP.maskArr) {
      rebuildAnalysisWithVision();
      resetCropToSmartDefault();
    } else if (currentStep === "studio" && STATE.uploadedFile) {
      runModalGeneration(false, true);
    }
  }

  return {
    init,
    goTo,
    getStep: () => currentStep,
    startFromUploadedFile,
    onPresetChangedInUI,
    setAspectRatio,
    setOrientation,
    toggleStep2MaskMode,
    renderCropPreview,
    getCropMaskCursorDiameter,
    getCropMaskCanvas: () => CROP.maskCanvas,
    onCropMaskHistorySwap,
  };
})();

window.Workflow = Workflow;
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => Workflow.init());
} else {
  Workflow.init();
}