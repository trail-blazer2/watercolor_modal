/**
 * 🐾👥 multi_subject.js — Universal Multi-Subject Side-by-Side Lineup Engine (Spine Module)
 *   - Works across ALL Style Cartridges (Watercolor, Poster Art, Line Art, etc.)
 *   - Supports:
 *       1. Auto-splitting 2 or 3 animals/people from a single uploaded photo
 *       2. Combining 2 or 3 SEPARATE uploaded photos side-by-side in Landscape mode
 *       3. Individual per-subject Move, Zoom, and Photo Replacement in Step 2
 */
(function () {
  "use strict";

  function extractDetectedMultiSubjects(CROP, getActiveProfileKey) {
    CROP.multiSubjects = [];
    CROP.multiSubjectMode = "together";
    CROP.activeSubjectIdx = -1;

    const vRes = CROP.visionResult;
    if (!CROP.sourceCanvas || !CROP.maskArr) return;
    if (getActiveProfileKey() === "car" || STATE.isCarPhoto) {
      updateMultiSubjectUI(CROP, getActiveProfileKey);
      return;
    }

    const sw = CROP.sourceCanvas.width;
    const sh = CROP.sourceCanvas.height;

    let rawBoxes = [];
    if (vRes && vRes.faces && vRes.faces.length >= 2) {
      rawBoxes = vRes.faces.map((f) => {
        const fw = f.head.x1 - f.head.x0;
        const fh = f.head.y1 - f.head.y0;
        return {
          x0: Math.max(0, f.head.x0 - fw * 0.85),
          x1: Math.min(1, f.head.x1 + fw * 0.85),
          y0: Math.max(0, f.head.y0 - fh * 0.25),
          y1: 1.0,
          headY0: f.head.y0,
          eyeY: f.eyes && f.eyes.length ? f.eyes.reduce((s, e) => s + e.y, 0) / f.eyes.length : (f.head.y0 + fh * 0.45),
          cx: (f.head.x0 + f.head.x1) * 0.5,
        };
      });
    } else if (vRes && vRes.animals && vRes.animals.length >= 2) {
      rawBoxes = vRes.animals.map((a, idx) => {
        const b = a.box;
        const bh = b.y1 - b.y0;
        const pose = vRes.animalPoses && vRes.animalPoses[idx];
        let eyeY = b.y0 + bh * 0.28;
        let headY0 = b.y0;
        if (pose && pose.kpts && (pose.kpts[0].score > 0.15 || pose.kpts[1].score > 0.15)) {
          const validEyes = [pose.kpts[0], pose.kpts[1]].filter((k) => k.score > 0.15);
          eyeY = validEyes.reduce((s, e) => s + e.v, 0) / validEyes.length;
          headY0 = Math.max(b.y0, eyeY - bh * 0.18);
        }
        return {
          x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1,
          headY0,
          eyeY,
          cx: (b.x0 + b.x1) * 0.5,
        };
      });
    } else if (vRes && vRes.people && vRes.people.length >= 2) {
      rawBoxes = vRes.people.map((p) => {
        const b = p.box;
        const bh = b.y1 - b.y0;
        return {
          x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1,
          headY0: b.y0,
          eyeY: b.y0 + bh * 0.18,
          cx: (b.x0 + b.x1) * 0.5,
        };
      });
    }

    if (rawBoxes.length < 2 && CROP.analysis && CROP.analysis.eyes && CROP.analysis.eyes.length >= 3) {
      const sortedEyes = [...CROP.analysis.eyes].sort((a, b) => a.x - b.x);
      const clusters = [[sortedEyes[0]]];
      for (let i = 1; i < sortedEyes.length; i++) {
        const prev = clusters[clusters.length - 1];
        const prevX = prev[prev.length - 1].x;
        if (sortedEyes[i].x - prevX > 0.16) {
          clusters.push([sortedEyes[i]]);
        } else {
          prev.push(sortedEyes[i]);
        }
      }
      if (clusters.length >= 2) {
        rawBoxes = clusters.slice(0, 3).map((cl) => {
          const cx = cl.reduce((s, e) => s + e.x, 0) / cl.length;
          const cy = cl.reduce((s, e) => s + e.y, 0) / cl.length;
          const span = Math.max(0.14, (cl[cl.length - 1].x - cl[0].x) * 2.4);
          return {
            x0: Math.max(0, cx - span * 1.1),
            x1: Math.min(1, cx + span * 1.1),
            y0: Math.max(0, cy - span * 0.9),
            y1: 1.0,
            headY0: Math.max(0, cy - span * 0.65),
            eyeY: cy,
            cx,
          };
        });
      }
    }

    if (rawBoxes.length < 2) {
      updateMultiSubjectUI(CROP, getActiveProfileKey);
      return;
    }

    rawBoxes.sort((a, b) => a.cx - b.cx);
    rawBoxes = rawBoxes.slice(0, 3);
    const kCount = rawBoxes.length;

    const splitX = [];
    for (let i = 0; i < kCount - 1; i++) {
      const rightEdgeLeftSub = rawBoxes[i].x1;
      const leftEdgeRightSub = rawBoxes[i + 1].x0;
      const mid = (rawBoxes[i].cx + rawBoxes[i + 1].cx) * 0.5;
      splitX.push(0.5 * mid + 0.25 * (rightEdgeLeftSub + leftEdgeRightSub));
    }

    const srcData = CROP.sourcePhotoData.data;
    const featherPx = Math.max(6, Math.round(sw * 0.015));

    for (let idx = 0; idx < kCount; idx++) {
      const b = rawBoxes[idx];
      const leftBoundPx = idx === 0 ? -9999 : splitX[idx - 1] * sw;
      const rightBoundPx = idx === kCount - 1 ? sw + 9999 : splitX[idx] * sw;

      let minX = sw, maxX = 0, minY = sh, maxY = 0;
      const subMask = new Uint8Array(sw * sh);

      for (let y = 0; y < sh; y++) {
        const row = y * sw;
        for (let x = 0; x < sw; x++) {
          const mVal = CROP.maskArr[row + x];
          if (mVal < 10) continue;
          let wL = 1.0, wR = 1.0;
          if (idx > 0) {
            wL = Math.max(0, Math.min(1, (x - (leftBoundPx - featherPx)) / (2 * featherPx)));
          }
          if (idx < kCount - 1) {
            wR = Math.max(0, Math.min(1, (rightBoundPx + featherPx - x) / (2 * featherPx)));
          }
          const v = Math.round(mVal * wL * wR);
          if (v >= 10) {
            subMask[row + x] = v;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX <= minX || maxY <= minY) continue;

      const headTopPx = Math.max(minY, Math.round(b.headY0 * sh));
      const eyeYPx = Math.max(headTopPx + 12, Math.round(b.eyeY * sh));
      const headH = Math.max(30, (eyeYPx - headTopPx) * 2.35);

      // Keep full torso height (no premature bottom crop!)
      const cw = maxX - minX + 1;
      const ch = maxY - minY + 1;
      const cutC = createCanvas(cw, ch);
      const cutCtx = cutC.getContext("2d");
      const cutImg = cutCtx.createImageData(cw, ch);

      const mskC = createCanvas(cw, ch);
      const mskCtx = mskC.getContext("2d");
      const mskImg = mskCtx.createImageData(cw, ch);

      const srcCropC = createCanvas(cw, ch);
      srcCropC.getContext("2d").drawImage(CROP.sourceCanvas, minX, minY, cw, ch, 0, 0, cw, ch);

      const fadeStartRow = Math.floor(ch * 0.90);
      const fadeSpan = Math.max(1, ch - fadeStartRow);
      const sideFeather = Math.max(8, Math.round(cw * 0.05));

      let hMinX = cw, hMaxX = 0;
      const eyeRowRel = Math.max(0, Math.min(ch - 1, eyeYPx - minY));
      const bandTop = Math.max(0, eyeRowRel - Math.round(headH * 0.35));
      const bandBot = Math.min(ch - 1, eyeRowRel + Math.round(headH * 0.35));

      for (let y = 0; y < ch; y++) {
        const sy = minY + y;
        const botFade = y >= fadeStartRow ? Math.cos(((y - fadeStartRow) / fadeSpan) * (Math.PI * 0.5)) : 1.0;
        for (let x = 0; x < cw; x++) {
          const sx = minX + x;
          let alpha = subMask[sy * sw + sx];
          if (alpha === 0) continue;

          let edgeFade = 1.0;
          if (idx > 0 && x < sideFeather) edgeFade = Math.min(edgeFade, x / sideFeather);
          if (idx < kCount - 1 && x > cw - sideFeather) edgeFade = Math.min(edgeFade, (cw - 1 - x) / sideFeather);

          alpha = Math.round(alpha * botFade * edgeFade);
          if (alpha > 120 && y >= bandTop && y <= bandBot) {
            if (x < hMinX) hMinX = x;
            if (x > hMaxX) hMaxX = x;
          }

          const sp = (sy * sw + sx) * 4;
          const dp = (y * cw + x) * 4;
          cutImg.data[dp] = srcData[sp];
          cutImg.data[dp + 1] = srcData[sp + 1];
          cutImg.data[dp + 2] = srcData[sp + 2];
          cutImg.data[dp + 3] = alpha;

          mskImg.data[dp] = alpha;
          mskImg.data[dp + 1] = alpha;
          mskImg.data[dp + 2] = alpha;
          mskImg.data[dp + 3] = 255;
        }
      }
      cutCtx.putImageData(cutImg, 0, 0);
      mskCtx.putImageData(mskImg, 0, 0);

      const measuredHeadW = hMaxX > hMinX ? (hMaxX - hMinX) : cw * 0.68;
      const headCxRel = hMaxX > hMinX ? (hMinX + hMaxX) * 0.5 : cw * 0.5;

      CROP.multiSubjects.push({
        index: idx,
        label: `Subject ${idx + 1}`,
        cutoutC: cutC,
        maskC: mskC,
        srcCropC,
        cw,
        ch,
        minX,
        minY,
        headW: measuredHeadW,
        headCxRel,
        eyeYRel: eyeRowRel,
        zoomPct: 100,
        dxPct: 0,
        dyPct: 0,
      });
    }

    updateMultiSubjectUI(CROP, getActiveProfileKey);
  }

  function computeSideBySidePlacements(CROP, canvasW, canvasH) {
    const subs = CROP.multiSubjects || [];
    const n = subs.length;
    if (!n) return [];

    // Reference layout from your examples (2 dogs / 3 cats / 3 horses in Landscape):
    //   - 2 subjects: X centers at [29.5%, 70.5%], each head width ~ 25.5% of landscape canvas width
    //   - 3 subjects: X centers at [20.5%, 50.0%, 79.5%], each head width ~ 20.5% of landscape canvas width
    const slotCentersX = n === 2 ? [0.295, 0.705] : n === 3 ? [0.205, 0.50, 0.795] : [0.5];
    const targetHeadW = (n === 2 ? 0.255 : 0.205) * canvasW;
    const targetEyeY = 0.43 * canvasH;

    const globalZoom = CROP.zoomPct / 100;
    const globalDx = (CROP.dxPct / 100) * canvasW;
    const globalDy = (CROP.dyPct / 100) * canvasH;

    return subs.map((s, idx) => {
      const baseScale = targetHeadW / Math.max(16, s.headW);
      const subZoom = (s.zoomPct / 100) * globalZoom;
      const sc = baseScale * subZoom;

      const drawW = s.cw * sc;
      const drawH = s.ch * sc;

      const slotX = slotCentersX[idx] * canvasW + (s.dxPct / 100) * canvasW + globalDx;
      const slotEyeY = targetEyeY + (s.dyPct / 100) * canvasH + globalDy;

      const x = slotX - s.headCxRel * sc;
      const y = slotEyeY - s.eyeYRel * sc;
      return { sub: s, x, y, w: drawW, h: drawH };
    });
  }

  async function loadSingleSubjectSlotFromFile(file, slotIdx, CROP, helpers) {
    if (!file) return;
    const { fetchSubjectMaskFromBackend, getActiveProfileKey, syncOrientationButtonsUI, syncCropSlidersUI, renderCropPreview } = helpers;

    startProgressBar(false);
    const loadingText = document.getElementById("loadingText");
    if (loadingText) loadingText.textContent = `Removing background for Subject #${slotIdx + 1}...`;

    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      const rawW = img.naturalWidth || img.width;
      const rawH = img.naturalHeight || img.height;
      const maxDim = IS_MOBILE ? 1024 : 1400;
      const sc = Math.min(1, maxDim / Math.max(rawW, rawH));
      const sw = Math.max(1, Math.round(rawW * sc));
      const sh = Math.max(1, Math.round(rawH * sc));

      const srcC = createCanvas(sw, sh);
      const srcCtx = srcC.getContext("2d", { willReadFrequently: true });
      srcCtx.drawImage(img, 0, 0, sw, sh);
      const photoData = srcCtx.getImageData(0, 0, sw, sh);

      const [maskImg, vRes] = await Promise.all([
        fetchSubjectMaskFromBackend(img),
        window.SubjectVision ? window.SubjectVision.detect(srcC, { timeoutMs: 4000 }) : Promise.resolve(null),
      ]);

      const mc = createCanvas(sw, sh);
      const mCtx = mc.getContext("2d", { willReadFrequently: true });
      mCtx.drawImage(maskImg, 0, 0, sw, sh);
      const mData = mCtx.getImageData(0, 0, sw, sh);
      const maskArr = window.WatercolorFraming.maskFromImageData(mData, "luma");

      let an = window.WatercolorFraming.analyzeMask(maskArr, sw, sh, { photoImageData: photoData });
      if (window.SubjectVision) {
        an = window.SubjectVision.fuse(an, vRes, { presetKey: "animals" });
      }

      const bb = an && !an.empty ? an.bbox : { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 };
      const hd = an && an.head ? an.head : { x0: 0.2, x1: 0.8, y0: bb.y0, craniumY0: bb.y0 };
      const eyeYNorm = an && an.eyeCenter && an.eyeCenter.y != null ? an.eyeCenter.y : (bb.y0 + (bb.y1 - bb.y0) * 0.28);

      // Keep full vertical height of the subject cutout (no premature bottom crop!)
      const minX = Math.max(0, Math.floor(bb.x0 * sw));
      const maxX = Math.min(sw - 1, Math.ceil(bb.x1 * sw));
      const minY = Math.max(0, Math.floor(bb.y0 * sh));
      const maxY = Math.min(sh - 1, Math.ceil(bb.y1 * sh));
      const eyeYPx = Math.max(minY + 12, Math.round(eyeYNorm * sh));

      const cw = Math.max(16, maxX - minX + 1);
      const ch = Math.max(16, maxY - minY + 1);

      const cutC = createCanvas(cw, ch);
      const cutCtx = cutC.getContext("2d");
      const cutImg = cutCtx.createImageData(cw, ch);

      const mskC = createCanvas(cw, ch);
      const mskCtx = mskC.getContext("2d");
      const mskImg = mskCtx.createImageData(cw, ch);

      const srcCropC = createCanvas(cw, ch);
      srcCropC.getContext("2d").drawImage(srcC, minX, minY, cw, ch, 0, 0, cw, ch);

      const srcData = photoData.data;
      const fadeStartRow = Math.floor(ch * 0.90);
      const fadeSpan = Math.max(1, ch - fadeStartRow);

      for (let y = 0; y < ch; y++) {
        const sy = minY + y;
        const botFade = y >= fadeStartRow ? Math.cos(((y - fadeStartRow) / fadeSpan) * (Math.PI * 0.5)) : 1.0;
        for (let x = 0; x < cw; x++) {
          const sx = minX + x;
          const alpha = Math.round(maskArr[sy * sw + sx] * botFade);
          if (alpha === 0) continue;
          const sp = (sy * sw + sx) * 4;
          const dp = (y * cw + x) * 4;
          cutImg.data[dp] = srcData[sp];
          cutImg.data[dp + 1] = srcData[sp + 1];
          cutImg.data[dp + 2] = srcData[sp + 2];
          cutImg.data[dp + 3] = alpha;

          mskImg.data[dp] = alpha;
          mskImg.data[dp + 1] = alpha;
          mskImg.data[dp + 2] = alpha;
          mskImg.data[dp + 3] = 255;
        }
      }
      cutCtx.putImageData(cutImg, 0, 0);
      mskCtx.putImageData(mskImg, 0, 0);

      const measuredHeadW = Math.max(24, ((hd.effectiveWidth || hd.width || 0.5) * sw));
      const headCxRel = (((hd.x0 + hd.x1) * 0.5) * sw) - minX;
      const eyeRowRel = Math.max(0, Math.min(ch - 1, eyeYPx - minY));

      CROP.multiSubjects[slotIdx] = {
        index: slotIdx,
        label: `Subject ${slotIdx + 1}`,
        cutoutC: cutC,
        maskC: mskC,
        srcCropC,
        cw,
        ch,
        minX: 0,
        minY: 0,
        headW: measuredHeadW,
        headCxRel: Math.max(cw * 0.2, Math.min(cw * 0.8, headCxRel)),
        eyeYRel: eyeRowRel,
        zoomPct: 100,
        dxPct: 0,
        dyPct: 0,
      };

      CROP.multiSubjectMode = "side_by_side";
      CROP.activeSubjectIdx = slotIdx;
      STATE.aspectOrientation = "landscape";
      syncOrientationButtonsUI();
      updateMultiSubjectUI(CROP, getActiveProfileKey, helpers);
      syncCropSlidersUI();
      renderCropPreview();
    } catch (err) {
      alert("Error loading subject photo: " + err.message);
      console.error(err);
    } finally {
      finishProgressBar();
    }
  }

  function setMultiSubjectTargetCount(targetCount, CROP, helpers) {
    const { getActiveProfileKey, syncOrientationButtonsUI, resetCropToSmartDefault, syncCropSlidersUI, renderCropPreview } = helpers;
    if (getActiveProfileKey() === "car" || STATE.isCarPhoto) return;

    if (targetCount <= 1) {
      CROP.multiSubjectMode = "together";
      CROP.activeSubjectIdx = -1;
      STATE.aspectOrientation = "portrait";
      syncOrientationButtonsUI();
      updateMultiSubjectUI(CROP, getActiveProfileKey, helpers);
      resetCropToSmartDefault();
      return;
    }

    if (CROP.multiSubjects.length === 0 && CROP.cutoutCanvas && CROP.maskCanvas && CROP.analysis) {
      const sw = CROP.sourceCanvas.width;
      const sh = CROP.sourceCanvas.height;
      const bb = CROP.analysis.bbox;
      const hd = CROP.analysis.head || { x0: 0.2, x1: 0.8, y0: bb.y0, craniumY0: bb.y0 };
      const eyeYNorm = CROP.analysis.eyeCenter && CROP.analysis.eyeCenter.y != null
        ? CROP.analysis.eyeCenter.y
        : (bb.y0 + (bb.y1 - bb.y0) * 0.28);

      const minX = Math.max(0, Math.floor(bb.x0 * sw));
      const maxX = Math.min(sw - 1, Math.ceil(bb.x1 * sw));
      const minY = Math.max(0, Math.floor(bb.y0 * sh));
      const maxY = Math.min(sh - 1, Math.ceil(bb.y1 * sh));
      const cw = Math.max(16, maxX - minX + 1);
      const ch = Math.max(16, maxY - minY + 1);

      const cutC = createCanvas(cw, ch);
      cutC.getContext("2d").drawImage(CROP.cutoutCanvas, minX, minY, cw, ch, 0, 0, cw, ch);
      const mskC = createCanvas(cw, ch);
      mskC.getContext("2d").drawImage(CROP.maskCanvas, minX, minY, cw, ch, 0, 0, cw, ch);
      const srcCropC = createCanvas(cw, ch);
      srcCropC.getContext("2d").drawImage(CROP.sourceCanvas, minX, minY, cw, ch, 0, 0, cw, ch);

      CROP.multiSubjects.push({
        index: 0,
        label: "Subject 1",
        cutoutC: cutC,
        maskC: mskC,
        srcCropC,
        cw,
        ch,
        minX,
        minY,
        headW: Math.max(24, (hd.effectiveWidth || hd.width || 0.5) * sw),
        headCxRel: Math.max(cw * 0.2, Math.min(cw * 0.8, (((hd.x0 + hd.x1) * 0.5) * sw) - minX)),
        eyeYRel: Math.max(0, Math.min(ch - 1, Math.round(eyeYNorm * sh) - minY)),
        zoomPct: 100,
        dxPct: 0,
        dyPct: 0,
      });
    }

    if (CROP.multiSubjects.length > targetCount) {
      CROP.multiSubjects = CROP.multiSubjects.slice(0, targetCount);
    }

    CROP.multiSubjectMode = "side_by_side";
    STATE.aspectOrientation = "landscape";
    syncOrientationButtonsUI();

    if (CROP.multiSubjects.length < targetCount) {
      const nextSlot = CROP.multiSubjects.length;
      if (CROP.multiSubjects[0]) {
        CROP.multiSubjects[nextSlot] = {
          ...CROP.multiSubjects[0],
          index: nextSlot,
          label: `Subject ${nextSlot + 1}`,
          zoomPct: 100,
          dxPct: 0,
          dyPct: 0,
        };
      }
      CROP.activeSubjectIdx = nextSlot;
      updateMultiSubjectUI(CROP, getActiveProfileKey, helpers);
      syncCropSlidersUI();
      renderCropPreview();

      const slotInput = document.getElementById("slotFileInput");
      if (slotInput) {
        slotInput.dataset.targetSlot = String(nextSlot);
        slotInput.click();
      }
    } else {
      if (CROP.activeSubjectIdx < 0 || CROP.activeSubjectIdx >= targetCount) {
        CROP.activeSubjectIdx = 0;
      }
      updateMultiSubjectUI(CROP, getActiveProfileKey, helpers);
      syncCropSlidersUI();
      renderCropPreview();
    }
  }

  function updateMultiSubjectUI(CROP, getActiveProfileKey, helpers) {
    const isCar = getActiveProfileKey() === "car" || STATE.isCarPhoto;
    const isSideBySide = CROP.multiSubjectMode === "side_by_side" && !isCar;
    const subCount = isSideBySide ? CROP.multiSubjects.length : 1;

    const btn1 = document.getElementById("cropMode1SubBtn");
    const btn2 = document.getElementById("cropMode2SubBtn");
    const btn3 = document.getElementById("cropMode3SubBtn");

    // Hide the entire Multi-Subject box when a Car/Vehicle photo is active!
    const masterBox = btn1 ? btn1.closest(".mask-controls") : null;
    if (masterBox) {
      masterBox.classList.toggle("hidden", !!isCar);
    }
    if (isCar) return;

    if (btn1) btn1.className = !isSideBySide ? "btn btn-xs btn-primary full-width" : "btn btn-xs btn-outline full-width";
    if (btn2) btn2.className = isSideBySide && subCount === 2 ? "btn btn-xs btn-primary full-width" : "btn btn-xs btn-outline full-width";
    if (btn3) btn3.className = isSideBySide && subCount === 3 ? "btn btn-xs btn-primary full-width" : "btn btn-xs btn-outline full-width";

    const panel = document.getElementById("multiSubjectPanel");
    if (!panel) return;
    const hasAutoMulti = CROP.multiSubjects && CROP.multiSubjects.length >= 2 && !isCar;
    panel.classList.toggle("hidden", !isSideBySide && !hasAutoMulti);

    const autoToggle = document.getElementById("multiAutoLayoutToggle");
    if (autoToggle) autoToggle.classList.toggle("hidden", !hasAutoMulti);

    const togetherBtn = document.getElementById("multiModeTogetherBtn");
    const sideBtn = document.getElementById("multiModeSideBySideBtn");
    if (togetherBtn) togetherBtn.className = !isSideBySide ? "btn btn-xs btn-primary full-width" : "btn btn-xs btn-outline full-width";
    if (sideBtn) sideBtn.className = isSideBySide ? "btn btn-xs btn-primary full-width" : "btn btn-xs btn-outline full-width";

    const selRow = document.getElementById("multiSubjectSelectorRow");
    if (selRow) selRow.classList.toggle("hidden", !isSideBySide);

    const uploadSlotBtn = document.getElementById("uploadSlotPhotoBtn");
    if (uploadSlotBtn) {
      const targetIdx = CROP.activeSubjectIdx >= 0 ? CROP.activeSubjectIdx : 0;
      uploadSlotBtn.textContent = `📁 Upload / Replace Photo for Subject #${targetIdx + 1}`;
    }

    const pBtn = document.getElementById("cropOrientPortraitBtn");
    if (pBtn) pBtn.disabled = isSideBySide;

    const tabsEl = document.getElementById("multiSubjectTabs");
    if (tabsEl && isSideBySide) {
      tabsEl.innerHTML = "";
      const items = [{ idx: -1, label: "All" }, ...CROP.multiSubjects.map((s, i) => ({ idx: i, label: `#${i + 1}` }))];
      for (const it of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = CROP.activeSubjectIdx === it.idx ? "btn btn-xs btn-primary full-width" : "btn btn-xs btn-outline full-width";
        b.textContent = it.label;
        b.addEventListener("click", () => {
          CROP.activeSubjectIdx = it.idx;
          updateMultiSubjectUI(CROP, getActiveProfileKey, helpers);
          if (helpers && helpers.syncCropSlidersUI) helpers.syncCropSlidersUI();
          if (helpers && helpers.renderCropPreview) helpers.renderCropPreview();
        });
        tabsEl.appendChild(b);
      }
    }
  }

  window.MultiSubjectEngine = {
    extractDetectedMultiSubjects,
    computeSideBySidePlacements,
    loadSingleSubjectSlotFromFile,
    setMultiSubjectTargetCount,
    updateMultiSubjectUI,
  };

  // Expose global aliases so studio_workflow.js calls never throw ReferenceError!
  window.computeSideBySidePlacements = (canvasW, canvasH, cropRef) =>
    computeSideBySidePlacements(cropRef || window._activeCropRef, canvasW, canvasH);
})();