/**
 * 🧭 Watercolor Studio — Modular Multi-Step Workflow & Smart Crop Controller
 * Steps: "upload" -> "crop" (Smart Move, Zoom, Multi-Subject Lineup & Mask Edit) -> "studio" (60 FPS Layer Editor)
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
    multiSubjectMode: "together", // "together" | "side_by_side"
    multiSubjects: [],            // Array of { index, label, cutoutC, maskC, srcCropC, cw, ch, minX, minY, headW, headCxRel, eyeYRel, zoomPct, dxPct, dyPct }
    activeSubjectIdx: -1,         // -1 = All, 0..2 = individual subject
  };

  window._activeCropRef = CROP;

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
      updateMultiSubjectUI();
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
    STATE.isLowResPhoto = rawMaxDim < 1100;

    const maxDim = IS_MOBILE ? 1024 : 1400;
    const scale = Math.min(1, maxDim / rawMaxDim);
    const sw = Math.max(1, Math.round(rawW * scale));
    const sh = Math.max(1, Math.round(rawH * scale));

    const srcC = createCanvas(sw, sh);
    const srcCtx = srcC.getContext("2d", { willReadFrequently: true });
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
      PERF_LOG.markStart("1_SubjectVision_AI");
      const visionPromise = (window.SubjectVision
        ? window.SubjectVision.detect(srcC, { timeoutMs: 4500 })
        : Promise.resolve(null)
      ).then((vRes) => {
        PERF_LOG.markEnd(
          "1_SubjectVision_AI",
          vRes ? `kind=${vRes.primaryKind} (${vRes.ms}ms internal)` : "null"
        );
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
        const mCtx = mc.getContext("2d", { willReadFrequently: true });
        mCtx.drawImage(maskImg, 0, 0, sw, sh);
        const mData = mCtx.getImageData(0, 0, sw, sh);
        maskArr = window.WatercolorFraming.maskFromImageData(mData, "luma");
      }

      PERF_LOG.markStart("3_Framing_Solver");
      finalizeCropMask(maskArr, sw, sh);
      PERF_LOG.markEnd("3_Framing_Solver", `profile=${getActiveProfileKey()}`);

      const vRes = CROP.visionResult;
      const detectedProf = getActiveProfileKey();
      const presetVal = (document.getElementById("presetSelect") && document.getElementById("presetSelect").value) || "";
      const hasVehicles = !!(vRes && vRes.vehicles && vRes.vehicles.length > 0);
      const hasAnimals = !!(vRes && vRes.animals && vRes.animals.length > 0);
      const hasPeople = !!(vRes && ((vRes.faces && vRes.faces.length > 0) || (vRes.people && vRes.people.length > 0)));

      const isCar = hasVehicles || (vRes && vRes.primaryKind === "car") || detectedProf === "car" || presetVal.startsWith("cars");
      const isAnimal = !isCar && (hasAnimals || (!hasPeople && vRes && vRes.primaryKind === "animal") || detectedProf === "animal" || presetVal.startsWith("animals"));

      STATE.isCarPhoto = isCar;
      STATE.isAnimalPhoto = isAnimal;

      if (mySessionId === STATE.eyeSessionId) {
        if (STATE.isLowResPhoto && !STATE.upscalePromise) {
          STATE.upscalePromise = fetchUpscaledPhotoInBackground(rawImg);
        }
        if (isCar && !STATE.wheelTurnPromise) {
          STATE.wheelTurnPromise = fetchWheelTurnInBackground(rawImg);
        } else if (isAnimal && !STATE.eyeFetchPromise) {
          const animalBoxes = hasAnimals
            ? vRes.animals.map((a) => [a.box.x0, a.box.y0, a.box.x1, a.box.y1])
            : [[0.0, 0.0, 1.0, 1.0]];
          STATE.eyeFetchPromise = fetchEyePatchesInBackground(rawImg, animalBoxes);
        }
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
    // If side-by-side lineup mode rearranged the subjects, skip raw whole-photo eye coordinate mapping
    if (CROP.multiSubjectMode === "side_by_side" && CROP.multiSubjects.length >= 2) {
      STATE.eyeBeautifierPatches = [];
      return;
    }
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
      // Send `img` immediately in parallel with cutout & Cloudinary upscale (server upscales <1100px in 15ms and returns fractional coords)
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
        const fr = data.front_ratio ?? 0.35;
        const rr = data.rear_ratio ?? 0.0;
        const ta = data.tread_asym ?? 1.0;
        const dd = data.deg_diff ?? 0.0;
        const ratio = rr > 0 ? (fr / rr) : 0;
        const isAlreadyTurned =
          data.is_already_turned !== undefined
            ? Boolean(data.is_already_turned)
            : (
                (rr > 0.08 && ratio >= 1.95 && dd >= 1.2) ||
                (ratio >= 1.65 && ta >= 1.9 && dd >= 4.5) ||
                (ratio >= 1.65 && ta >= 1.95 && dd >= 1.0)
              );
        const steerMode = data.steer_mode || (isAlreadyTurned ? "ALREADY_TURNED" : "STRAIGHT");
        const boxMetrics =
          data.front_angle_deg !== undefined
            ? `F=${data.front_angle_deg}° vs Exp=${data.expected_straight_deg}° (Net=${data.net_steer_deg}°, kappa=${data.kappa})`
            : `front_r=${fr}, rear_r=${rr}, tread_asym=${ta}, deg_diff=${dd}°`;
        if (isAlreadyTurned) {
          STATE.wheelTurnEnabled = false;
          console.log(
            `%c🛞 [3D Box & Cylinder Check] ${steerMode} (${boxMetrics}) -> Defaulting Turned Wheel to OFF!`,
            "color:#f59e0b;font-weight:bold;"
          );
        } else {
          STATE.wheelTurnEnabled = true;
          console.log(
            `%c🛞 [3D Box & Cylinder Check] ${steerMode} (${boxMetrics}) -> Turned Wheel ON!`,
            "color:#10b981;font-weight:bold;"
          );
        }
        PERF_LOG.markEnd("BG_WheelTurn_GPU_RPC", `${steerMode} | ${data.turn} ${data.angle}° (server ${data.elapsed_sec}s)`);

        if (currentStep === "studio" && STATE.payload && STATE.uncroppedPlacement && STATE.eyeSessionId === targetSessionId) {
          const outW = STATE.unturnedFramedPhotoCanvas ? STATE.unturnedFramedPhotoCanvas.width : 1782;
          const outH = STATE.unturnedFramedPhotoCanvas ? STATE.unturnedFramedPhotoCanvas.height : 1260;
          const px = STATE.uncroppedPlacement.px;
          const framedMaskC = STATE.unturnedFramedMaskCanvas;
          if (STATE.hqUnturnedPhotoCanvas && framedMaskC) {
            const hqTurned = buildTurnedPhotoAndMaskFromBase(
              STATE.hqUnturnedPhotoCanvas, framedMaskC, STATE.wheelTurnData, px, outW, outH
            );
            STATE.hqTurnedPhotoCanvas = hqTurned.turnedPhotoC;
            STATE.turnedFramedMaskCanvas = hqTurned.turnedMaskC;
            if (IS_MOBILE) {
              STATE.lowResTurnedPhotoCanvas = STATE.hqTurnedPhotoCanvas;
            }
          }
          if ((!IS_MOBILE || !STATE.hqUnturnedPhotoCanvas) && STATE.lowResUnturnedPhotoCanvas && framedMaskC) {
            const lowTurned = buildTurnedPhotoAndMaskFromBase(
              STATE.lowResUnturnedPhotoCanvas, framedMaskC, STATE.wheelTurnData, px, outW, outH
            );
            STATE.lowResTurnedPhotoCanvas = lowTurned.turnedPhotoC;
            if (!STATE.turnedFramedMaskCanvas) {
              STATE.turnedFramedMaskCanvas = lowTurned.turnedMaskC;
            }
          }
          syncActiveResolutionAndWheelCanvases();
          if (STATE.presetCache) STATE.presetCache.clear();
          runModalGeneration(Boolean(STATE.maskEditedByUser), true, true);
        }
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
      const blob = await prepareOptimizedUploadBlob(img, "cars_black");
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

  function buildTurnedPhotoAndMaskFromBase(baseFramedPhotoC, baseFramedMaskC, wt, px, outW, outH) {
    const dstX = Math.round(px.x + wt.x0Frac * px.w);
    const dstY = Math.round(px.y + wt.y0Frac * px.h);
    const dstW = Math.max(1, Math.round(wt.wFrac * px.w));
    const dstH = Math.max(1, Math.round(wt.hFrac * px.h));

    const turnedPhotoC = createCanvas(outW, outH);
    const tpCtx = turnedPhotoC.getContext("2d", { willReadFrequently: true });
    tpCtx.drawImage(baseFramedPhotoC, 0, 0);

    const origPatch = tpCtx.getImageData(dstX, dstY, dstW, dstH);
    const oD = origPatch.data;

    const patchC = createCanvas(dstW, dstH);
    const pCtx = patchC.getContext("2d", { willReadFrequently: true });
    pCtx.drawImage(wt.patchRgbImg, 0, 0, dstW, dstH);
    const pD = pCtx.getImageData(0, 0, dstW, dstH).data;

    const maskPatchC = createCanvas(dstW, dstH);
    const mpCtx = maskPatchC.getContext("2d", { willReadFrequently: true });
    mpCtx.drawImage(wt.patchMaskImg, 0, 0, dstW, dstH);
    const mpD = mpCtx.getImageData(0, 0, dstW, dstH).data;

    const turnedMaskC = createCanvas(outW, outH);
    const tmCtx = turnedMaskC.getContext("2d", { willReadFrequently: true });
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
    STATE.originalImg = STATE.framedPhotoCanvas;
  }

  function rebuildCutoutAndTintFromMaskCanvas(skipMaskReadback = false) {
    if (!CROP.sourceCanvas || !CROP.maskCanvas) return;
    const sw = CROP.sourceCanvas.width;
    const sh = CROP.sourceCanvas.height;

    if (!CROP.maskArr || CROP.maskArr.length !== sw * sh) {
      CROP.maskArr = new Uint8Array(sw * sh);
      skipMaskReadback = false;
    }
    if (!skipMaskReadback) {
      const mData = CROP.maskCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
      for (let i = 0; i < CROP.maskArr.length; i++) {
        CROP.maskArr[i] = mData[i * 4];
      }
    }

    if (!CROP.cutoutCanvas || CROP.cutoutCanvas.width !== sw || CROP.cutoutCanvas.height !== sh) {
      CROP.cutoutCanvas = createCanvas(sw, sh);
    }

    const cCtx = CROP.cutoutCanvas.getContext("2d", { willReadFrequently: true });
    cCtx.clearRect(0, 0, sw, sh);
    cCtx.drawImage(CROP.sourceCanvas, 0, 0);
    const cImg = cCtx.getImageData(0, 0, sw, sh);
    const cData = cImg.data;
    const maskArr = CROP.maskArr;

    if (CROP.maskEditMode) {
      if (!CROP.maskTintCanvas || CROP.maskTintCanvas.width !== sw || CROP.maskTintCanvas.height !== sh) {
        CROP.maskTintCanvas = createCanvas(sw, sh);
      }
      const tCtx = CROP.maskTintCanvas.getContext("2d");
      const tImg = tCtx.createImageData(sw, sh);
      const tData = tImg.data;
      for (let i = 0; i < maskArr.length; i++) {
        const p = i * 4;
        const v = maskArr[i];
        cData[p + 3] = Math.min(cData[p + 3], v);
        tData[p + 3] = 255 - v;
      }
      tCtx.putImageData(tImg, 0, 0);
    } else {
      for (let i = 0; i < maskArr.length; i++) {
        const p = i * 4;
        cData[p + 3] = Math.min(cData[p + 3], maskArr[i]);
      }
    }
    cCtx.putImageData(cImg, 0, 0);
  }

  
  // ==========================================================================
  // 🐾👥 MULTI-SUBJECT SIDE-BY-SIDE LINEUP ENGINE (Animals & People Only!)
  // ==========================================================================
  const _msHelpers = () => ({
    fetchSubjectMaskFromBackend,
    getActiveProfileKey,
    syncOrientationButtonsUI,
    resetCropToSmartDefault,
    syncCropSlidersUI,
    renderCropPreview,
  });

  function extractDetectedMultiSubjects() {
    if (window.MultiSubjectEngine) window.MultiSubjectEngine.extractDetectedMultiSubjects(CROP, getActiveProfileKey);
  }
  function computeSideBySidePlacements(canvasW, canvasH) {
    return window.MultiSubjectEngine ? window.MultiSubjectEngine.computeSideBySidePlacements(CROP, canvasW, canvasH) : [];
  }
  function loadSingleSubjectSlotFromFile(file, slotIdx) {
    if (window.MultiSubjectEngine) return window.MultiSubjectEngine.loadSingleSubjectSlotFromFile(file, slotIdx, CROP, _msHelpers());
  }
  function setMultiSubjectTargetCount(targetCount) {
    if (window.MultiSubjectEngine) window.MultiSubjectEngine.setMultiSubjectTargetCount(targetCount, CROP, _msHelpers());
  }
  function updateMultiSubjectUI() {
    if (window.MultiSubjectEngine) window.MultiSubjectEngine.updateMultiSubjectUI(CROP, getActiveProfileKey, _msHelpers());
  }



  

  function getActiveSliderTargetInCrop() {
    if (
      CROP.multiSubjectMode === "side_by_side" &&
      CROP.activeSubjectIdx >= 0 &&
      CROP.multiSubjects[CROP.activeSubjectIdx]
    ) {
      return CROP.multiSubjects[CROP.activeSubjectIdx];
    }
    return CROP;
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

    rebuildCutoutAndTintFromMaskCanvas(true);
    rebuildAnalysisWithVision(true);
    extractDetectedMultiSubjects();

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

    resetCropToSmartDefault(true);
    goTo("crop");

    if (STATE._pendingMultiCountFromLanding >= 2) {
      const targetCnt = STATE._pendingMultiCountFromLanding;
      STATE._pendingMultiCountFromLanding = 0;
      setMultiSubjectTargetCount(targetCnt);
    }

  }

  function rebuildAnalysisWithVision(isNewUpload = false) {
    if (!CROP.maskArr || !CROP.sourceCanvas) return;
    const F = window.WatercolorFraming;
    const sw = CROP.sourceCanvas.width;
    const sh = CROP.sourceCanvas.height;
    if (!CROP.sourcePhotoData) {
      CROP.sourcePhotoData = CROP.sourceCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh);
    }
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
    const effectiveOrient = CROP.multiSubjectMode === "side_by_side" ? "landscape" : STATE.aspectOrientation;
    if (typeof window.parseAspectRatioToCm === "function") {
      return window.parseAspectRatioToCm(val, profileKey, effectiveOrient);
    }
    return profileKey === "car" || effectiveOrient === "landscape"
      ? { width: 141.42, height: 100 }
      : { width: 100, height: 141.42 };
  }

  function syncOrientationButtonsUI() {
    const profKey = getActiveProfileKey();
    const orient = CROP.multiSubjectMode === "side_by_side"
      ? "landscape"
      : (STATE.aspectOrientation || (profKey === "car" ? "landscape" : "portrait"));
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
    if (CROP.multiSubjectMode === "side_by_side" && orient === "portrait") {
      return; // Side-by-side lineup requires Landscape
    }
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

  function resetCropToSmartDefault(skipRebuild = false) {
    if (!skipRebuild) {
      rebuildCutoutAndTintFromMaskCanvas();
      rebuildAnalysisWithVision(false);
    }
    const presetKey = document.getElementById("presetSelect").value;
    const profileKey = getActiveProfileKey();
    const defaultZoom = window.STUDIO_CONFIG
      ? window.STUDIO_CONFIG.getDefaultZoomPercent(presetKey, profileKey)
      : profileKey === "car" ? 100 : 97;

    if (CROP.multiSubjectMode === "side_by_side") {
      CROP.zoomPct = 100;
      CROP.dxPct = 0;
      CROP.dyPct = 0;
      for (const s of CROP.multiSubjects) {
        s.zoomPct = 100;
        s.dxPct = 0;
        s.dyPct = 0;
      }
    } else {
      CROP.zoomPct = defaultZoom;
      CROP.dxPct = 0;
      CROP.dyPct = 0;
    }
    syncCropSlidersUI();
    renderCropPreview();
  }

  function syncCropSlidersUI() {
    const tgt = getActiveSliderTargetInCrop();
    const zSlider = document.getElementById("cropZoomSlider");
    const xSlider = document.getElementById("cropDxSlider");
    const ySlider = document.getElementById("cropDySlider");
    if (zSlider) zSlider.value = Math.round(tgt.zoomPct);
    if (xSlider) xSlider.value = Math.round(tgt.dxPct);
    if (ySlider) ySlider.value = Math.round(tgt.dyPct);

    const zVal = document.getElementById("cropZoomVal");
    const xVal = document.getElementById("cropDxVal");
    const yVal = document.getElementById("cropDyVal");
    if (zVal) zVal.textContent = `${Math.round(tgt.zoomPct)}%`;
    if (xVal) xVal.textContent = `${Math.round(tgt.dxPct)}%`;
    if (yVal) yVal.textContent = `${Math.round(tgt.dyPct)}%`;
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

    // Side-by-Side Lineup Preview Mode
    if (CROP.multiSubjectMode === "side_by_side" && CROP.multiSubjects.length >= 2 && !CROP.maskEditMode) {
      const placements = computeSideBySidePlacements(cv.width, cv.height);
      for (let i = 0; i < placements.length; i++) {
        const pl = placements[i];
        g.drawImage(pl.sub.cutoutC, pl.x, pl.y, pl.w, pl.h);
        if (CROP.showGuides && CROP.activeSubjectIdx === i) {
          g.save();
          g.strokeStyle = "rgba(37,99,235,0.85)";
          g.lineWidth = 2;
          g.setLineDash([6, 4]);
          g.strokeRect(pl.x, pl.y, pl.w, pl.h);
          g.restore();
        }
      }
      if (CROP.showGuides) {
        g.save();
        g.strokeStyle = "#16a34a";
        g.lineWidth = 1.4;
        g.setLineDash([4, 4]);
        g.beginPath();
        g.moveTo(0, cv.height * 0.43);
        g.lineTo(cv.width, cv.height * 0.43);
        g.stroke();
        g.restore();
      }
      g.strokeStyle = "#b8935a";
      g.lineWidth = 2;
      g.strokeRect(1, 1, cv.width - 2, cv.height - 2);

      const badge = document.getElementById("cropInfoBadge");
      if (badge) {
        const who = CROP.activeSubjectIdx >= 0 ? `Moving Subject #${CROP.activeSubjectIdx + 1} (Click any subject to switch)` : "Moving All Subjects";
        badge.textContent = `↔️ Side-by-Side Lineup (${CROP.multiSubjects.length}) · ${who}`;
      }
      return;
    }

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
    extractDetectedMultiSubjects();
    renderCropPreview();
  }

  async function confirmCropAndGenerate() {
    if (!CROP.sourceCanvas || !CROP.maskCanvas) return;
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

    // 2. If this is a car, wait up to 4.5s for /steer_wheel
    if (isCar || profileKey === "car" || STATE.isCarPhoto) {
      if (!STATE.wheelTurnPromise && !STATE.wheelTurnData && CROP.sourceImg) {
        STATE.wheelTurnPromise = fetchWheelTurnInBackground(CROP.sourceImg);
      }
      if (STATE.wheelTurnPromise && !STATE.wheelTurnData) {
        startProgressBar(false);
        const loadingText = document.getElementById("loadingText");
        if (loadingText) loadingText.textContent = "Steering front wheel in 3D...";
        await Promise.race([
          STATE.wheelTurnPromise,
          new Promise((r) => setTimeout(r, 4500)),
        ]);
      }
    }

    // 3. If this is an animal, ensure /beautify_eyes has finished
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

    const isSideBySide = CROP.multiSubjectMode === "side_by_side" && CROP.multiSubjects.length >= 2 && !isCar;
    if (isSideBySide) {
      STATE.aspectOrientation = "landscape";
    }
    const useLandscapeRef = isCar || isSideBySide || STATE.aspectOrientation === "landscape";
    const refCm = useLandscapeRef ? { width: 141.421356, height: 100 } : { width: 100, height: 141.421356 };
    const outW = useLandscapeRef ? 1782 : 1260;
    const outH = useLandscapeRef ? 1260 : 1782;

    if (isSideBySide) {
      // Compose Side-by-Side Lineup directly into outW x outH Framed Photo & Mask Canvases!
      const placements = computeSideBySidePlacements(outW, outH);
      const framedPhotoC = createCanvas(outW, outH);
      const fpCtx = framedPhotoC.getContext("2d");
      fpCtx.fillStyle = "#faf8f4";
      fpCtx.fillRect(0, 0, outW, outH);
      fpCtx.save();
      fpCtx.filter = "blur(28px)";
      fpCtx.drawImage(CROP.sourceImg, 0, 0, outW, outH);
      fpCtx.restore();

      const framedMaskC = createCanvas(outW, outH);
      const fmCtx = framedMaskC.getContext("2d");
      fmCtx.fillStyle = "#000000";
      fmCtx.fillRect(0, 0, outW, outH);

      const compCutoutC = createCanvas(outW, outH);
      const ccCtx = compCutoutC.getContext("2d");

      for (const pl of placements) {
        // Draw each subject's unmasked source crop first, then its clean cutout on top so edge sampling has rich interior RGB
        fpCtx.drawImage(pl.sub.srcCropC, pl.x, pl.y, pl.w, pl.h);
        fpCtx.drawImage(pl.sub.cutoutC, pl.x, pl.y, pl.w, pl.h);
        fmCtx.drawImage(pl.sub.maskC, pl.x, pl.y, pl.w, pl.h);
        ccCtx.drawImage(pl.sub.cutoutC, pl.x, pl.y, pl.w, pl.h);
      }

      STATE.uncroppedPlacement = {
        sourceImg: framedPhotoC,
        sourceCanvas: framedPhotoC,
        maskCanvas: framedMaskC,
        cutoutCanvas: compCutoutC,
        refSize: [outW, outH],
        px: { x: 0, y: 0, w: outW, h: outH },
      };

      STATE.lowResUnturnedPhotoCanvas = framedPhotoC;
      STATE.hqUnturnedPhotoCanvas = null;
      STATE.unturnedFramedMaskCanvas = framedMaskC;
      STATE.lowResTurnedPhotoCanvas = null;
      STATE.hqTurnedPhotoCanvas = null;
      STATE.turnedFramedMaskCanvas = null;
      STATE.eyeBeautifierPatches = [];
      STATE.detectedEyes = [];
    } else {
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
      if (IS_MOBILE && hasUpscaled) {
        STATE.hqUnturnedPhotoCanvas = buildFramedPhotoFromSource(STATE.upscaleData.upscaledImg);
        STATE.lowResUnturnedPhotoCanvas = STATE.hqUnturnedPhotoCanvas;
      } else {
        STATE.lowResUnturnedPhotoCanvas = buildFramedPhotoFromSource(CROP.sourceImg);
        STATE.hqUnturnedPhotoCanvas = hasUpscaled
          ? buildFramedPhotoFromSource(STATE.upscaleData.upscaledImg)
          : null;
      }

      const framedMaskC = createCanvas(outW, outH);
      const fmCtx = framedMaskC.getContext("2d");
      fmCtx.fillStyle = "#000000";
      fmCtx.fillRect(0, 0, outW, outH);
      fmCtx.drawImage(CROP.maskCanvas, px.x, px.y, px.w, px.h);
      STATE.unturnedFramedMaskCanvas = framedMaskC;

      if (STATE.wheelTurnData && STATE.wheelTurnData.turned) {
        const wt = STATE.wheelTurnData;
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
          if (IS_MOBILE) {
            STATE.lowResTurnedPhotoCanvas = STATE.hqTurnedPhotoCanvas;
          }
        }
        if (!IS_MOBILE || !STATE.hqUnturnedPhotoCanvas) {
          const lowResTurned = buildTurnedPhotoAndMaskFromBase(
            STATE.lowResUnturnedPhotoCanvas,
            framedMaskC,
            wt,
            px,
            outW,
            outH
          );
          STATE.lowResTurnedPhotoCanvas = lowResTurned.turnedPhotoC;
          if (!STATE.turnedFramedMaskCanvas) {
            STATE.turnedFramedMaskCanvas = lowResTurned.turnedMaskC;
          }
        }
      } else {
        STATE.lowResTurnedPhotoCanvas = null;
        STATE.hqTurnedPhotoCanvas = null;
        STATE.turnedFramedMaskCanvas = null;
      }

      STATE.detectedEyes = px.eyes || [];
      STATE.detectedEyesRefSize = [outW, outH];
      STATE.headRectNorm = refFraming.headRect || null;
    }

    syncActiveResolutionAndWheelCanvases();

    STATE.originalImg = STATE.framedPhotoCanvas;
    STATE.rawMaskBase64 = null;
    STATE.framedMaskBase64 = null;
    if (profileKey === "animal" || (presetKey && presetKey.startsWith("animals"))) {
      STATE.isAnimalPhoto = true;
    }
    STATE.maskCanvas = null;

    if (CROP.maskTintCanvas) {
      CROP.maskTintCanvas.width = 1;
      CROP.maskTintCanvas.height = 1;
      CROP.maskTintCanvas = null;
    }
    CROP.sourcePhotoData = null;
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
    if (CROP.maskEditMode) {
      if (CROP.maskCanvas) rebuildCutoutAndTintFromMaskCanvas(true);
    } else {
      CROP.maskViewZoom = 1.0;
      CROP.maskViewPanX = 0;
      CROP.maskViewPanY = 0;
      if (CROP.maskTintCanvas) {
        CROP.maskTintCanvas.width = 1;
        CROP.maskTintCanvas.height = 1;
        CROP.maskTintCanvas = null;
      }
      brushCursor.classList.add("hidden");
      if (CROP.maskCanvas) {
        rebuildCutoutAndTintFromMaskCanvas();
        extractDetectedMultiSubjects();
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

    const togetherBtn = document.getElementById("multiModeTogetherBtn");
    const sideBySideBtn = document.getElementById("multiModeSideBySideBtn");
    if (togetherBtn) {
      togetherBtn.addEventListener("click", () => {
        CROP.multiSubjectMode = "together";
        CROP.activeSubjectIdx = -1;
        STATE.aspectOrientation = getActiveProfileKey() === "car" ? "landscape" : "portrait";
        syncOrientationButtonsUI();
        updateMultiSubjectUI();
        resetCropToSmartDefault();
      });
    }
    if (sideBySideBtn) {
      sideBySideBtn.addEventListener("click", () => {
        CROP.multiSubjectMode = "side_by_side";
        CROP.activeSubjectIdx = 0;
        STATE.aspectOrientation = "landscape";
        CROP.zoomPct = 100;
        CROP.dxPct = 0;
        CROP.dyPct = 0;
        for (const s of CROP.multiSubjects) {
          s.zoomPct = 100;
          s.dxPct = 0;
          s.dyPct = 0;
        }
        syncOrientationButtonsUI();
        updateMultiSubjectUI();
        syncCropSlidersUI();
        renderCropPreview();
      });
    }


    const btn1Sub = document.getElementById("cropMode1SubBtn");
    const btn2Sub = document.getElementById("cropMode2SubBtn");
    const btn3Sub = document.getElementById("cropMode3SubBtn");
    const uploadSlotBtn = document.getElementById("uploadSlotPhotoBtn");
    const slotFileInput = document.getElementById("slotFileInput");

    if (btn1Sub) btn1Sub.addEventListener("click", () => setMultiSubjectTargetCount(1));
    if (btn2Sub) btn2Sub.addEventListener("click", () => setMultiSubjectTargetCount(2));
    if (btn3Sub) btn3Sub.addEventListener("click", () => setMultiSubjectTargetCount(3));

    if (uploadSlotBtn && slotFileInput) {
      uploadSlotBtn.addEventListener("click", () => {
        const targetIdx = CROP.activeSubjectIdx >= 0 ? CROP.activeSubjectIdx : 0;
        slotFileInput.dataset.targetSlot = String(targetIdx);
        slotFileInput.click();
      });
    }
    if (slotFileInput) {
      slotFileInput.addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0];
        slotFileInput.value = "";
        if (!f) return;
        const slotIdx = Number(slotFileInput.dataset.targetSlot || 0);
        await loadSingleSubjectSlotFromFile(f, slotIdx);
      });
    }

    // Landing page "Combine 2 / 3 Separate Photos" quick-start buttons
    const land2Btn = document.getElementById("landingMulti2Btn");
    const land3Btn = document.getElementById("landingMulti3Btn");
    const startMultiFromLanding = (count) => {
      STATE._pendingMultiCountFromLanding = count;
      const fi = document.getElementById("fileInput");
      if (fi) fi.click();
    };
    if (land2Btn) land2Btn.addEventListener("click", () => startMultiFromLanding(2));
    if (land3Btn) land3Btn.addEventListener("click", () => startMultiFromLanding(3));



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
        const tgt = getActiveSliderTargetInCrop();
        tgt.zoomPct = Number(zSlider.value);
        syncCropSlidersUI();
        renderCropPreview();
      });
    }
    if (xSlider) {
      xSlider.addEventListener("input", () => {
        const tgt = getActiveSliderTargetInCrop();
        tgt.dxPct = Number(xSlider.value);
        syncCropSlidersUI();
        renderCropPreview();
      });
    }
    if (ySlider) {
      ySlider.addEventListener("input", () => {
        const tgt = getActiveSliderTargetInCrop();
        tgt.dyPct = Number(ySlider.value);
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

        const tgt = getActiveSliderTargetInCrop();
        const delta = e.deltaY < 0 ? 2 : -2;
        tgt.zoomPct = Math.max(65, Math.min(145, tgt.zoomPct + delta));
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
          // If in Side-by-Side mode, clicking on a specific subject automatically selects it for dragging!
          if (CROP.multiSubjectMode === "side_by_side" && CROP.multiSubjects.length >= 2 && CROP.activeSubjectIdx >= 0) {
            const rect = cv.getBoundingClientRect();
            const cx = (e.clientX - rect.left) * (cv.width / Math.max(1, rect.width));
            const cy = (e.clientY - rect.top) * (cv.height / Math.max(1, rect.height));
            const placements = computeSideBySidePlacements(cv.width, cv.height);
            let hitIdx = -1;
            for (let i = placements.length - 1; i >= 0; i--) {
              const pl = placements[i];
              if (cx >= pl.x && cx <= pl.x + pl.w && cy >= pl.y && cy <= pl.y + pl.h) {
                hitIdx = i;
                break;
              }
            }
            if (hitIdx >= 0 && hitIdx !== CROP.activeSubjectIdx) {
              CROP.activeSubjectIdx = hitIdx;
              updateMultiSubjectUI();
              syncCropSlidersUI();
              renderCropPreview();
            }
          }
          const tgt = getActiveSliderTargetInCrop();
          CROP.dragStart = { x: e.clientX, y: e.clientY, dxPct: tgt.dxPct, dyPct: tgt.dyPct };
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
        const tgt = getActiveSliderTargetInCrop();
        const dX = ((e.clientX - CROP.dragStart.x) / Math.max(1, rect.width)) * 100;
        const dY = ((e.clientY - CROP.dragStart.y) / Math.max(1, rect.height)) * 100;
        tgt.dxPct = Math.max(-35, Math.min(35, CROP.dragStart.dxPct + dX));
        tgt.dyPct = Math.max(-35, Math.min(35, CROP.dragStart.dyPct + dY));
        syncCropSlidersUI();
        renderCropPreview();
      });

      const stopDrag = () => {
        if (CROP.isDragging && CROP.maskEditMode && !CROP.isPanningMaskView) {
          CROP.lastMaskPt = null;
          History.endStroke();
          rebuildCutoutAndTintFromMaskCanvas();
          extractDetectedMultiSubjects();
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
          const tgt = getActiveSliderTargetInCrop();
          CROP.pinchStartZoom = CROP.maskEditMode ? CROP.maskViewZoom : tgt.zoomPct;
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
            const tgt = getActiveSliderTargetInCrop();
            tgt.zoomPct = Math.max(65, Math.min(145, CROP.pinchStartZoom * scale));
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
      STATE.aspectOrientation = newCat === "car" || CROP.multiSubjectMode === "side_by_side" ? "landscape" : "portrait";
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