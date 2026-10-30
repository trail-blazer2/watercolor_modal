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

  // Detailed Concrete Workflow Timing Logger
  const PERF_LOG = {
    tUploadStart: 0,
    events: {},
    startUpload(fileName, w, h) {
      this.tUploadStart = performance.now();
      this.events = {};
      console.log(
        `%c⏱️ [Workflow Timer] START Upload "${fileName}" (${w}×${h}px)`,
        "color:#3b82f6;font-weight:bold;"
      );
    },
    markStart(name) {
      this.events[name] = { t0: performance.now(), status: "running..." };
    },
    markEnd(name, note = "ok") {
      const now = performance.now();
      const ev = this.events[name] || { t0: this.tUploadStart };
      const durMs = Math.round(now - ev.t0);
      const sinceStartMs = Math.round(now - this.tUploadStart);
      this.events[name] = {
        duration_ms: durMs,
        duration_sec: Number((durMs / 1000).toFixed(2)),
        finished_at_ms: sinceStartMs,
        status: note,
      };
      console.log(
        `%c⏱️ [Workflow Timer] ${name}: ${durMs} ms (${(durMs / 1000).toFixed(2)}s) [at +${sinceStartMs}ms] — ${note}`,
        "color:#0ea5e9;font-weight:600;"
      );
    },
    printSummary(phaseTitle) {
      const table = {};
      for (const [k, v] of Object.entries(this.events)) {
        table[k] = {
          "Duration (ms)": v.duration_ms ?? "...",
          "Duration (s)": v.duration_sec ?? "...",
          "Finished (+ms)": v.finished_at_ms ?? "...",
          Status: v.status,
        };
      }
      console.log(`%c📊 [Workflow Summary — ${phaseTitle}]`, "color:#8b5cf6;font-weight:bold;");
      console.table(table);
    },
  };

  // Filter top preset dropdown options based on detected category ("portrait" | "car" | "all")
  function filterPresetDropdownByCategory(category) {
    const presetSelect = document.getElementById("presetSelect");
    if (!presetSelect) return;

    const groups = presetSelect.querySelectorAll("optgroup");
    groups.forEach((grp) => {
      const label = (grp.getAttribute("label") || "").toLowerCase();
      if (category === "car") {
        const show = label.includes("vehicle");
        grp.style.display = show ? "" : "none";
        grp.disabled = !show;
        grp.querySelectorAll("option").forEach((opt) => {
          opt.hidden = !show;
          opt.disabled = !show;
        });
      } else if (category === "portrait") {
        const show = label.includes("portrait") || label.includes("animal");
        grp.style.display = show ? "" : "none";
        grp.disabled = !show;
        grp.querySelectorAll("option").forEach((opt) => {
          opt.hidden = !show;
          opt.disabled = !show;
        });
      } else {
        // Unrecognized: show all options
        grp.style.display = "";
        grp.disabled = false;
        grp.querySelectorAll("option").forEach((opt) => {
          opt.hidden = false;
          opt.disabled = false;
        });
      }
    });
  }

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
    STATE.eyeSessionId = (STATE.eyeSessionId || 0) + 1;
    const mySessionId = STATE.eyeSessionId;
    init();
    STATE.uploadedFile = file;
    STATE.maskEditedByUser = false;

    // Reset all previous image masks & caches
    STATE.rawMaskBase64 = null;
    STATE.framedMaskBase64 = null;
    STATE.framedMaskCanvas = null;
    STATE.framedPhotoCanvas = null;
    STATE.maskCanvas = null;
    STATE.headRectNorm = null;
    STATE.detectedEyes = [];
    STATE.rawEyePatches = [];
    STATE.eyeBeautifierPatches = [];
    STATE.eyeFetchPromise = null;
    STATE.wheelTurnData = null;
    STATE.wheelTurnPromise = null;
    STATE.wheelTurnEnabled = true;
    STATE.unturnedFramedPhotoCanvas = null;
    STATE.unturnedFramedMaskCanvas = null;
    STATE.turnedFramedPhotoCanvas = null;
    STATE.turnedFramedMaskCanvas = null;
    STATE.hqUnturnedPhotoCanvas = null;
    STATE.hqTurnedPhotoCanvas = null;
    STATE.lowResUnturnedPhotoCanvas = null;
    STATE.lowResTurnedPhotoCanvas = null;
    STATE.upscaleData = null;
    STATE.upscalePromise = null;
    STATE.upscaleEnabled = true;
    STATE.isLowResPhoto = false;
    STATE.detectedSubjectCategory = "all";
    filterPresetDropdownByCategory("all");

    if (STATE.presetCache) STATE.presetCache.clear();
    if (STATE.wheelVariantCache) STATE.wheelVariantCache.clear();
    if (STATE.presetUserEdits) STATE.presetUserEdits.clear();
    History.clear();

    const url = URL.createObjectURL(file);
    const rawImg = await loadImage(url);
    const rawW = rawImg.naturalWidth || rawImg.width;
    const rawH = rawImg.naturalHeight || rawImg.height;
    PERF_LOG.startUpload(file.name, rawW, rawH);

    const rawMaxDim = Math.max(rawW, rawH);
    STATE.isLowResPhoto = rawMaxDim < 1600;
    if (STATE.isLowResPhoto) {
      // Delayed by 150ms so /cutout hits the network first and finishes in < 0.5s
      STATE.upscalePromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve(fetchUpscaledPhotoInBackground(rawImg));
        }, 150);
      });
    }

    const maxDim = IS_MOBILE ? 1024 : 1400;
    const scale = Math.min(1, maxDim / rawMaxDim);
    const sw = Math.max(1, Math.round(rawW * scale));
    const sh = Math.max(1, Math.round(rawH * scale));

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
      const triggerBackgroundTaskFromVision = (vRes) => {
        if (!vRes || mySessionId !== STATE.eyeSessionId) return;
        let animalBoxes = [];
        if (vRes.animals && vRes.animals.length > 0) {
          animalBoxes = vRes.animals.map((a) => [a.box.x0, a.box.y0, a.box.x1, a.box.y1]);
        } else if (vRes.primaryKind === "animal") {
          animalBoxes = [[0.0, 0.0, 1.0, 1.0]];
        }

        const hasVehicles = vRes.vehicles && vRes.vehicles.length > 0;
        const hasAnimals = vRes.animals && vRes.animals.length > 0;
        const hasPeople = (vRes.faces && vRes.faces.length > 0) || (vRes.people && vRes.people.length > 0);

        const isCar = hasVehicles || vRes.primaryKind === "car";
        const isAnimal = !isCar && (hasAnimals || (!hasPeople && vRes.primaryKind === "animal"));

        STATE.isCarPhoto = isCar;
        STATE.isAnimalPhoto = isAnimal;

        if (isCar && !STATE.wheelTurnPromise) {
          STATE.wheelTurnPromise = fetchWheelTurnInBackground(rawImg);
        } else if (isAnimal && !STATE.eyeFetchPromise) {
          STATE.eyeFetchPromise = fetchEyePatchesInBackground(
            rawImg,
            animalBoxes.length > 0 ? animalBoxes : [[0.0, 0.0, 1.0, 1.0]]
          );
        }
      };

      PERF_LOG.markStart("1_SubjectVision_AI");
      const visionPromise = (window.SubjectVision
        ? window.SubjectVision.detect(srcC, { timeoutMs: 4500 })
        : Promise.resolve(null)
      ).then((vRes) => {
        PERF_LOG.markEnd(
          "1_SubjectVision_AI",
          vRes ? `kind=${vRes.primaryKind} (${vRes.ms}ms internal)` : "null"
        );
        triggerBackgroundTaskFromVision(vRes);
        return vRes;
      });

      let maskArr;
      if (isTransparentPng) {
        PERF_LOG.markStart("2_Cutout_Alpha");
        maskArr = window.WatercolorFraming.maskFromImageData(photoData, "alpha");
        PERF_LOG.markEnd("2_Cutout_Alpha", "local alpha");
        CROP.visionResult = await visionPromise;
      } else {
        PERF_LOG.markStart("2_Server_Cutout_U2Net");
        const [maskImg, visionRes] = await Promise.all([
          fetchSubjectMaskFromBackend(rawImg).then((m) => {
            PERF_LOG.markEnd("2_Server_Cutout_U2Net", `${m.width}×${m.height}`);
            return m;
          }),
          visionPromise,
        ]);
        CROP.visionResult = visionRes;
        const mc = createCanvas(sw, sh);
        const mCtx = mc.getContext("2d");
        mCtx.drawImage(maskImg, 0, 0, sw, sh);
        const mData = mCtx.getImageData(0, 0, sw, sh);
        maskArr = window.WatercolorFraming.maskFromImageData(mData, "luma");
      }

      PERF_LOG.markStart("3_Framing_Solver");
      finalizeCropMask(maskArr, sw, sh);
      PERF_LOG.markEnd("3_Framing_Solver", `profile=${getActiveProfileKey()}`);

      // Fallback check after finalizeCropMask
      const detectedProf = getActiveProfileKey();
      const presetVal = (document.getElementById("presetSelect") && document.getElementById("presetSelect").value) || "";
      if (!STATE.isCarPhoto && (detectedProf === "car" || presetVal.startsWith("cars"))) {
        STATE.isCarPhoto = true;
        if (!STATE.wheelTurnPromise) {
          STATE.wheelTurnPromise = fetchWheelTurnInBackground(rawImg);
        }
      } else if (!STATE.isCarPhoto && (detectedProf === "animal" || presetVal.startsWith("animals")) && !STATE.eyeFetchPromise) {
        STATE.isAnimalPhoto = true;
        STATE.eyeFetchPromise = fetchEyePatchesInBackground(rawImg, [[0.0, 0.0, 1.0, 1.0]]);
      }

      PERF_LOG.printSummary("Step 1 → Step 2 (Upload to Move & Zoom)");
    } catch (err) {
      alert("Error analyzing subject: " + err.message);
      console.error(err);
    } finally {
      finishProgressBar();
    }
  }

  async function prepareFastCutoutBlob(img) {
    const maxDim = 640;
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (w > maxDim || h > maxDim) {
      const sc = Math.min(maxDim / w, maxDim / h);
      w = Math.max(1, Math.round(w * sc));
      h = Math.max(1, Math.round(h * sc));
    }
    const c = createCanvas(w, h);
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.88));
  }

  async function fetchSubjectMaskFromBackend(img) {
    const presetKey = document.getElementById("presetSelect").value;
    const fastBlob = await prepareFastCutoutBlob(img);
    const fd = new FormData();
    fd.append("image_file", fastBlob, "upload.jpg");
    fd.append("preset_key", presetKey);

    try {
      const resCut = await fetch(`${STATE.apiUrl}/cutout`, { method: "POST", body: fd });
      if (resCut.ok) {
        const data = await resCut.json();
        if (data.presets) STATE.serverPresets = data.presets;
        if (data.raw_mask_png) return await loadImage(data.raw_mask_png);
      }
    } catch (_) {}

    const fullBlob = await prepareOptimizedUploadBlob(img, presetKey);
    const fdGen = new FormData();
    fdGen.append("image_file", fullBlob, "upload.jpg");
    fdGen.append("preset_key", presetKey);
    const res = await fetch(`${STATE.apiUrl}/generate`, { method: "POST", body: fdGen });
    if (!res.ok) throw new Error(`Server status ${res.status}`);
    const payload = await res.json();
    return await loadImage(payload.raw_mask_png || payload.mask_png);
  }

  function mapRawEyePatchesToCanvas() {
    if (!STATE.uncroppedPlacement || !Array.isArray(STATE.rawEyePatches)) return;
    const { px } = STATE.uncroppedPlacement;
    STATE.eyeBeautifierPatches = STATE.rawEyePatches.map((ep) => ({
      baseX: Math.round(px.x + ep.x0Frac * px.w),
      baseY: Math.round(px.y + ep.y0Frac * px.h),
      w: Math.max(1, Math.round(ep.wFrac * px.w)),
      h: Math.max(1, Math.round(ep.hFrac * px.h)),
      canvas: ep.img,
    }));
  }

  async function fetchEyePatchesInBackground(img, animalBoxes) {
    const uploadRef = STATE.uploadedFile;
    const targetSessionId = STATE.eyeSessionId;
    PERF_LOG.markStart("BG_EyeBeautifier_RPC");
    try {
      const blob = await prepareOptimizedUploadBlob(img, "animals");
      let res = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const fd = new FormData();
          fd.append("image_file", blob, "upload.jpg");
          fd.append("animal_boxes_json", JSON.stringify(animalBoxes));
          res = await fetch(`${STATE.apiUrl}/beautify_eyes`, { method: "POST", body: fd });
          if (res && res.ok) break;
        } catch (err) {
          if (attempt === 1) throw err;
        }
      }
      if (!res || !res.ok || STATE.eyeSessionId !== targetSessionId || STATE.uploadedFile !== uploadRef) {
        PERF_LOG.markEnd("BG_EyeBeautifier_RPC", "cancelled or status error");
        return;
      }
      const data = await res.json();
      if (Array.isArray(data.eye_patches) && data.eye_patches.length > 0 && STATE.uploadedFile === uploadRef) {
        STATE.rawEyePatches = await Promise.all(
          data.eye_patches.map(async (ep) => ({
            ...ep,
            img: await loadImage(ep.png),
          }))
        );
        PERF_LOG.markEnd("BG_EyeBeautifier_RPC", `${STATE.rawEyePatches.length} eye(s) ready`);
        mapRawEyePatchesToCanvas();
        if (currentStep === "studio" && STATE.payload) {
          if (typeof invalidateMoveFastStack === "function") invalidateMoveFastStack();
          invalidateStack();
          if (STATE.selectedLayerId === "subject" && STATE.layers.subject) {
            renderSlidersForLayer(STATE.layers.subject);
          }
          compositeAllLayers();
        }
      } else {
        PERF_LOG.markEnd("BG_EyeBeautifier_RPC", "0 eyes found");
      }
    } catch (e) {
      PERF_LOG.markEnd("BG_EyeBeautifier_RPC", `error: ${e.message}`);
      console.warn("Background eye beautifier skipped:", e);
    }
  }

  async function fetchWheelTurnInBackground(img) {
    const uploadRef = STATE.uploadedFile;
    const targetSessionId = STATE.eyeSessionId;
    PERF_LOG.markStart("BG_WheelTurn_GPU_RPC");
    try {
      const blob = await prepareOptimizedUploadBlob(img, "cars_black");
      const fd = new FormData();
      fd.append("image_file", blob, "upload.jpg");
      const res = await fetch(`${STATE.apiUrl}/steer_wheel`, { method: "POST", body: fd });
      if (!res.ok || STATE.eyeSessionId !== targetSessionId || STATE.uploadedFile !== uploadRef) {
        PERF_LOG.markEnd("BG_WheelTurn_GPU_RPC", "cancelled or failed");
        return null;
      }
      const data = await res.json();
      if (data && data.turned && data.patch_rgb_webp && data.patch_mask_webp) {
        const [patchRgbImg, patchMaskImg] = await Promise.all([
          loadImage(data.patch_rgb_webp),
          loadImage(data.patch_mask_webp),
        ]);
        STATE.wheelTurnData = { ...data, patchRgbImg, patchMaskImg };
        PERF_LOG.markEnd("BG_WheelTurn_GPU_RPC", `${data.turn} ${data.angle}° (server ${data.elapsed_sec}s)`);
        return STATE.wheelTurnData;
      } else {
        PERF_LOG.markEnd("BG_WheelTurn_GPU_RPC", `skipped (${data ? data.reason : "unknown"})`);
      }
    } catch (e) {
      PERF_LOG.markEnd("BG_WheelTurn_GPU_RPC", `error: ${e.message}`);
      console.warn("Background wheel turn skipped:", e);
    }
    return null;
  }

  async function fetchUpscaledPhotoInBackground(img) {
    const uploadRef = STATE.uploadedFile;
    const targetSessionId = STATE.eyeSessionId;
    PERF_LOG.markStart("BG_Cloudinary_2x_Upscale");
    try {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const c = createCanvas(w, h);
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.93));

      const fd = new FormData();
      fd.append("image_file", blob, "upload.jpg");
      const res = await fetch(`${STATE.apiUrl}/upscale_subject`, { method: "POST", body: fd });
      if (!res.ok || STATE.eyeSessionId !== targetSessionId || STATE.uploadedFile !== uploadRef) {
        PERF_LOG.markEnd("BG_Cloudinary_2x_Upscale", "cancelled or failed");
        return null;
      }
      const data = await res.json();
      if (data && data.upscaled && data.upscaled_webp) {
        const upscaledImg = await loadImage(data.upscaled_webp);
        STATE.upscaleData = { ...data, upscaledImg };
        PERF_LOG.markEnd("BG_Cloudinary_2x_Upscale", `${data.width}×${data.height} (server ${data.elapsed_sec}s)`);
        return STATE.upscaleData;
      } else {
        PERF_LOG.markEnd("BG_Cloudinary_2x_Upscale", `skipped (${data ? data.reason : "unknown"})`);
      }
    } catch (e) {
      PERF_LOG.markEnd("BG_Cloudinary_2x_Upscale", `error: ${e.message}`);
      console.warn("Background AI upscale skipped:", e);
    }
    return null;
  }

  // Helper that composites the turned wheel patch onto ANY baseFramedPhotoCanvas with feathered pixel-diff
  function buildTurnedPhotoAndMaskFromBase(baseFramedPhotoC, baseFramedMaskC, wt, px, outW, outH) {
    const dstX = Math.round(px.x + wt.x0Frac * px.w);
    const dstY = Math.round(px.y + wt.y0Frac * px.h);
    const dstW = Math.max(1, Math.round(wt.wFrac * px.w));
    const dstH = Math.max(1, Math.round(wt.hFrac * px.h));

    const turnedPhotoC = createCanvas(outW, outH);
    const tpCtx = turnedPhotoC.getContext("2d");
    tpCtx.drawImage(baseFramedPhotoC, 0, 0);

    const origPatch = tpCtx.getImageData(dstX, dstY, dstW, dstH);
    const oD = origPatch.data;

    const patchC = createCanvas(dstW, dstH);
    const pCtx = patchC.getContext("2d");
    pCtx.drawImage(wt.patchRgbImg, 0, 0, dstW, dstH);
    const pD = pCtx.getImageData(0, 0, dstW, dstH).data;

    const maskPatchC = createCanvas(dstW, dstH);
    const mpCtx = maskPatchC.getContext("2d");
    mpCtx.drawImage(wt.patchMaskImg, 0, 0, dstW, dstH);
    const mpD = mpCtx.getImageData(0, 0, dstW, dstH).data;

    const turnedMaskC = createCanvas(outW, outH);
    const tmCtx = turnedMaskC.getContext("2d");
    tmCtx.drawImage(baseFramedMaskC, 0, 0);
    const origMaskImg = tmCtx.getImageData(dstX, dstY, dstW, dstH);
    const omD = origMaskImg.data;

    const featherPx = Math.max(6, Math.round(Math.min(dstW, dstH) * 0.04));
    for (let y = 0; y < dstH; y++) {
      const fy = Math.min(1, Math.min(y, dstH - 1 - y) / featherPx);
      for (let x = 0; x < dstW; x++) {
        const fx = Math.min(1, Math.min(x, dstW - 1 - x) / featherPx);
        const borderW = fx * fy;
        const idx = (y * dstW + x) * 4;
        const diff = Math.max(
          Math.abs(pD[idx] - oD[idx]),
          Math.abs(pD[idx + 1] - oD[idx + 1]),
          Math.abs(pD[idx + 2] - oD[idx + 2])
        );
        const changeW = Math.min(1, Math.max(0, (diff - 1.5) / 8.0)) * borderW;
        if (changeW > 0) {
          oD[idx] = Math.round(oD[idx] + (pD[idx] - oD[idx]) * changeW);
          oD[idx + 1] = Math.round(oD[idx + 1] + (pD[idx + 1] - oD[idx + 1]) * changeW);
          oD[idx + 2] = Math.round(oD[idx + 2] + (pD[idx + 2] - oD[idx + 2]) * changeW);
          if (!STATE.maskEditedByUser && mpD[idx] > omD[idx]) {
            const newM = Math.round(omD[idx] + (mpD[idx] - omD[idx]) * changeW);
            omD[idx] = newM;
            omD[idx + 1] = newM;
            omD[idx + 2] = newM;
          }
        }
      }
    }
    tpCtx.putImageData(origPatch, dstX, dstY);
    tmCtx.putImageData(origMaskImg, dstX, dstY);
    patchC.width = 1; patchC.height = 1;
    maskPatchC.width = 1; maskPatchC.height = 1;

    return { turnedPhotoC, turnedMaskC };
  }

  // Synchronizes STATE.unturnedFramedPhotoCanvas, STATE.turnedFramedPhotoCanvas, and STATE.framedPhotoCanvas
  // whenever AI Upscale is toggled ON/OFF in Studio, preventing any mask/wheel desync (fixes arti.jpg!)
  function syncActiveResolutionAndWheelCanvases() {
    const useHq = !!(STATE.upscaleEnabled !== false && STATE.hqUnturnedPhotoCanvas);
    const unturnedPhoto = useHq ? STATE.hqUnturnedPhotoCanvas : STATE.lowResUnturnedPhotoCanvas;
    const turnedPhoto = useHq ? STATE.hqTurnedPhotoCanvas : STATE.lowResTurnedPhotoCanvas;

    if (!unturnedPhoto) return;
    STATE.unturnedFramedPhotoCanvas = unturnedPhoto;
    STATE.turnedFramedPhotoCanvas = turnedPhoto || null;

    if (STATE.uncroppedPlacement) {
      STATE.uncroppedPlacement.sourceImg = useHq && STATE.upscaleData ? STATE.upscaleData.upscaledImg : CROP.sourceImg;
    }

    const hasTurned = !!(turnedPhoto && STATE.turnedFramedMaskCanvas);
    const useTurnedNow = hasTurned && STATE.wheelTurnEnabled !== false;
    STATE.framedPhotoCanvas = useTurnedNow ? turnedPhoto : unturnedPhoto;
    STATE.framedMaskCanvas = useTurnedNow ? STATE.turnedFramedMaskCanvas : STATE.unturnedFramedMaskCanvas;
  }

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

    // Determine whether the subject is a known Car, known Animal/Person, or Unrecognized
    const vRes = CROP.visionResult;
    const hasConfidentVehicle = !!(vRes && vRes.vehicles && vRes.vehicles.length > 0);
    const hasConfidentPerson = !!(vRes && ((vRes.faces && vRes.faces.length > 0) || (vRes.people && vRes.people.length > 0)));
    const hasConfidentAnimal = !!(vRes && ((vRes.animals && vRes.animals.length > 0) || (vRes.animalPoses && vRes.animalPoses.length > 0)));

    let dropdownCat = "all";
    if (hasConfidentVehicle) {
      dropdownCat = "car";
    } else if (hasConfidentPerson || hasConfidentAnimal) {
      dropdownCat = "portrait";
    }
    STATE.detectedSubjectCategory = dropdownCat;
    filterPresetDropdownByCategory(dropdownCat);

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
    PERF_LOG.markStart("Step2_to_Step3_Total");

    if (CROP.maskEditMode) {
      toggleStep2MaskMode(false);
    } else {
      rebuildCutoutAndTintFromMaskCanvas();
    }

    const presetKey = document.getElementById("presetSelect").value;
    const isCar = presetKey.startsWith("cars");
    const profileKey = getActiveProfileKey();
    const isAnimal = !isCar && (profileKey === "animal" || presetKey.startsWith("animals") || STATE.isAnimalPhoto);

    // 1. Wait for AI Upscale if still running
    if (STATE.upscalePromise && !STATE.upscaleData) {
      startProgressBar(false);
      const loadingText = document.getElementById("loadingText");
      if (loadingText) loadingText.textContent = "Enhancing subject resolution with AI (2x)...";
      await STATE.upscalePromise;
    }

    // 2. If this is a car, ensure /steer_wheel has finished
    if (isCar || profileKey === "car" || STATE.isCarPhoto) {
      if (!STATE.wheelTurnPromise && !STATE.wheelTurnData && CROP.sourceImg) {
        STATE.wheelTurnPromise = fetchWheelTurnInBackground(CROP.sourceImg);
      }
      if (STATE.wheelTurnPromise && !STATE.wheelTurnData) {
        startProgressBar(false);
        const loadingText = document.getElementById("loadingText");
        if (loadingText) loadingText.textContent = "Steering front wheel in 3D...";
        await STATE.wheelTurnPromise;
      }
    }

    // 3. If this is an animal, ensure /beautify_eyes has finished so eyes NEVER miss on first load!
    if (isAnimal) {
      if (!STATE.eyeFetchPromise && (!STATE.rawEyePatches || STATE.rawEyePatches.length === 0) && CROP.sourceImg) {
        STATE.eyeFetchPromise = fetchEyePatchesInBackground(CROP.sourceImg, [[0.0, 0.0, 1.0, 1.0]]);
      }
      if (STATE.eyeFetchPromise && (!STATE.rawEyePatches || STATE.rawEyePatches.length === 0)) {
        startProgressBar(false);
        const loadingText = document.getElementById("loadingText");
        if (loadingText) loadingText.textContent = "Enhancing pet eyes & reflections...";
        await STATE.eyeFetchPromise;
      }
    }

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

    mapRawEyePatchesToCanvas();

    // 4. Build Unturned Framed Photo Canvases (for both HQ Upscaled and Low-Res Original) & Mask Canvas
    const buildFramedPhotoFromSource = (srcImage) => {
      const c = createCanvas(outW, outH);
      const ctx = c.getContext("2d");
      ctx.fillStyle = isCar ? "#ffffff" : "#faf8f4";
      ctx.fillRect(0, 0, outW, outH);
      ctx.save();
      ctx.filter = "blur(24px)";
      ctx.drawImage(srcImage, 0, 0, outW, outH);
      ctx.restore();
      ctx.drawImage(srcImage, px.x, px.y, px.w, px.h);
      return c;
    };

    const hasUpscaled = !!(STATE.upscaleData && STATE.upscaleData.upscaledImg);
    STATE.lowResUnturnedPhotoCanvas = buildFramedPhotoFromSource(CROP.sourceImg);
    STATE.hqUnturnedPhotoCanvas = hasUpscaled
      ? buildFramedPhotoFromSource(STATE.upscaleData.upscaledImg)
      : null;

    const framedMaskC = createCanvas(outW, outH);
    const fmCtx = framedMaskC.getContext("2d");
    fmCtx.fillStyle = "#000000";
    fmCtx.fillRect(0, 0, outW, outH);
    fmCtx.drawImage(CROP.maskCanvas, px.x, px.y, px.w, px.h);
    STATE.unturnedFramedMaskCanvas = framedMaskC;

    // 5. Build Turned Framed Photo Canvases (for both HQ Upscaled and Low-Res Original) & Turned Mask Canvas
    if (STATE.wheelTurnData && STATE.wheelTurnData.turned) {
      const wt = STATE.wheelTurnData;
      const lowResTurned = buildTurnedPhotoAndMaskFromBase(
        STATE.lowResUnturnedPhotoCanvas,
        framedMaskC,
        wt,
        px,
        outW,
        outH
      );
      STATE.lowResTurnedPhotoCanvas = lowResTurned.turnedPhotoC;
      STATE.turnedFramedMaskCanvas = lowResTurned.turnedMaskC;

      if (STATE.hqUnturnedPhotoCanvas) {
        const hqTurned = buildTurnedPhotoAndMaskFromBase(
          STATE.hqUnturnedPhotoCanvas,
          framedMaskC,
          wt,
          px,
          outW,
          outH
        );
        STATE.hqTurnedPhotoCanvas = hqTurned.turnedPhotoC;
        STATE.turnedFramedMaskCanvas = hqTurned.turnedMaskC;
      } else {
        STATE.hqTurnedPhotoCanvas = null;
      }
    } else {
      STATE.lowResTurnedPhotoCanvas = null;
      STATE.hqTurnedPhotoCanvas = null;
      STATE.turnedFramedMaskCanvas = null;
    }

    syncActiveResolutionAndWheelCanvases();

    STATE.originalImg = await loadImage(STATE.framedPhotoCanvas.toDataURL("image/jpeg", 0.95));
    STATE.rawMaskBase64 = STATE.framedMaskCanvas.toDataURL("image/png");
    STATE.framedMaskBase64 = STATE.rawMaskBase64;
    STATE.detectedEyes = px.eyes || [];
    STATE.detectedEyesRefSize = [outW, outH];
    STATE.headRectNorm = refFraming.headRect || null;
    if (profileKey === "animal" || (presetKey && presetKey.startsWith("animals"))) {
      STATE.isAnimalPhoto = true;
    }
    STATE.maskCanvas = null;

    CROP.maskTintCanvas = null;
    if (window.SubjectVision && window.SubjectVision.releaseMemory) {
      await window.SubjectVision.releaseMemory();
    }

    STATE.hasViewportPosition = false;
    goTo("studio");
    PERF_LOG.markStart("4_Studio_GPU_Generate");
    await runModalGeneration(false, false);
    PERF_LOG.markEnd("4_Studio_GPU_Generate", "all layers ready");
    PERF_LOG.markEnd("Step2_to_Step3_Total", "studio interactive");
    PERF_LOG.printSummary("Step 2 → Step 3 (Generate Painting)");
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

    if (newCat === "car" && CROP.sourceImg && !STATE.wheelTurnPromise && !STATE.wheelTurnData) {
      STATE.isCarPhoto = true;
      STATE.wheelTurnPromise = fetchWheelTurnInBackground(CROP.sourceImg);
    }

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
    syncActiveResolutionAndWheelCanvases,
  };
})();

window.Workflow = Workflow;
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => Workflow.init());
} else {
  Workflow.init();
}