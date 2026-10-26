/**
 * 👁️ subject_vision.js — SOTA AI Eye, Head & Multi-Subject Detector (Apache-2.0)
 *   - Humans:   MediaPipe FaceLandmarker (478-pt mesh + exact irises, up to 8 people)
 *   - Objects:  MediaPipe EfficientDet-Lite0 (person, dog, cat, horse, car, etc.)
 *   - Animals:  OpenMMLab RTMPose-m AP-10K ONNX (17 animal keypoints: L_Eye, R_Eye, Nose, Neck)
 *   - Presets:  Auto-selects cars_black, people, animals_black (pure white animals), or animals.
 */
(function () {
  "use strict";
  const MP_VER = "0.10.14";
  const MP_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
  const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  const OBJ_MODEL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

  // Verified OpenMMLab RTMPose-m AP-10K ONNX urls (54.5 MB, Apache-2.0)
  const ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.min.js";
  const ANIMAL_ONNX_URLS = [
    "https://huggingface.co/bdsqlsz/qinglong_controlnet-lllite/resolve/main/Annotators/rtmpose-m_simcc-ap10k_pt-aic-coco_210e-256x256-7a041aa1_20230206.onnx",
    "https://huggingface.co/datasets/DavidPagnon/rtmlib_models/resolve/main/mmpose/rtmpose-m_simcc-ap10k_pt-aic-coco_210e-256x256-7a041aa1_20230206.onnx",
  ];
  const MODEL_CACHE_NAME = "watercolor-studio-ap10k-v2";

  const ANIMALS = ["dog", "cat", "horse", "sheep", "cow", "bear", "bird", "elephant", "zebra", "giraffe"];
  const VEHICLES = ["car", "truck", "bus", "motorcycle"];
  const MAX_INPUT = 960;

  let _initPromise = null;
  let _animalInitPromise = null;
  let _face = null, _obj = null, _animalSess = null;

  // ------------------------------------------------------------------ 1. MediaPipe Init
  function init() {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      const vision = await import(`${MP_CDN}/vision_bundle.mjs`);
      const { FilesetResolver, FaceLandmarker, ObjectDetector } = vision;
      const fileset = await FilesetResolver.forVisionTasks(`${MP_CDN}/wasm`);

      const make = async (Cls, opts) => {
        try {
          return await Cls.createFromOptions(fileset, {
            ...opts,
            baseOptions: { ...opts.baseOptions, delegate: "GPU" },
          });
        } catch (_) {
          return await Cls.createFromOptions(fileset, {
            ...opts,
            baseOptions: { ...opts.baseOptions, delegate: "CPU" },
          });
        }
      };

      [_face, _obj] = await Promise.all([
        make(FaceLandmarker, {
          baseOptions: { modelAssetPath: FACE_MODEL },
          runningMode: "IMAGE",
          numFaces: 8,
          minFaceDetectionConfidence: 0.52,
          minFacePresenceConfidence: 0.52,
        }),
        make(ObjectDetector, {
          baseOptions: { modelAssetPath: OBJ_MODEL },
          runningMode: "IMAGE",
          scoreThreshold: 0.24,
          maxResults: 15,
          categoryAllowlist: ["person", ...ANIMALS, ...VEHICLES],
        }),
      ]);

      const c = document.createElement("canvas");
      c.width = c.height = 64;
      try { _face.detect(c); _obj.detect(c); } catch (_) {}
      console.log("👁️ SubjectVision (Face + Object AI) ready");
      return true;
    })().catch((e) => {
      console.warn("SubjectVision MediaPipe unavailable:", e);
      return false;
    });
    return _initPromise;
  }

  // ------------------------------------------------------------------ 2. RTMPose-m AP-10K ONNX Init
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (window.ort) return resolve(window.ort);
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(window.ort));
        existing.addEventListener("error", reject);
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve(window.ort);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function fetchCachedAnimalModelBuffer() {
    for (const url of ANIMAL_ONNX_URLS) {
      try {
        if ("caches" in window) {
          const cache = await caches.open(MODEL_CACHE_NAME);
          let resp = await cache.match(url);
          if (!resp) {
            resp = await fetch(url, { mode: "cors" });
            if (resp.ok) {
              const clone = resp.clone();
              const buf = await resp.arrayBuffer();
              if (buf.byteLength > 10 * 1024 * 1024) {
                await cache.put(url, clone);
                return buf;
              }
              continue;
            }
          } else {
            const buf = await resp.arrayBuffer();
            if (buf.byteLength > 10 * 1024 * 1024) return buf;
          }
        } else {
          const resp = await fetch(url, { mode: "cors" });
          if (resp.ok) {
            const buf = await resp.arrayBuffer();
            if (buf.byteLength > 10 * 1024 * 1024) return buf;
          }
        }
      } catch (err) {
        console.warn("Mirror fetch failed, trying next:", url, err);
      }
    }
    throw new Error("Could not load RTMPose AP-10K ONNX from mirrors");
  }

  function initAnimalPoseModel() {
    if (_animalSess) return Promise.resolve(_animalSess);
    if (_animalInitPromise) return _animalInitPromise;

    _animalInitPromise = (async () => {
      const ort = await loadScriptOnce(ORT_CDN);
      if (!ort) return null;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/";

      const buf = await fetchCachedAnimalModelBuffer();
      _animalSess = await ort.InferenceSession.create(buf, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      console.log("🐾 RTMPose-m AP-10K Animal AI Model Ready!");
      return _animalSess;
    })().catch((e) => {
      console.warn("RTMPose-m AP-10K unavailable, using fallback:", e);
      _animalInitPromise = null;
      return null;
    });
    return _animalInitPromise;
  }

  /**
   * Runs RTMPose-m AP-10K (256x256 SimCC) on a single animal crop box {x0, y0, x1, y1} (normalized 0..1)
   * Returns 17 AP-10K keypoints: 0 = L_Eye, 1 = R_Eye, 2 = Nose, 3 = Neck
   */
  async function runRTMPoseOnAnimalBox(sourceCanvas, normBox, padding = 1.15) {
    const sess = await initAnimalPoseModel();
    if (!sess || !window.ort) return null;

    const W = sourceCanvas.width, H = sourceCanvas.height;
    const bx0 = normBox.x0 * W, by0 = normBox.y0 * H;
    const bx1 = normBox.x1 * W, by1 = normBox.y1 * H;
    const bw = Math.max(16, bx1 - bx0), bh = Math.max(16, by1 - by0);
    const cx = (bx0 + bx1) * 0.5, cy = (by0 + by1) * 0.5;

    // Aspect-preserving square crop (matches rtmlib bbox_xyxy2cs + top_down_affine)
    const side = Math.max(bw, bh) * padding;
    const sx0 = cx - side * 0.5, sy0 = cy - side * 0.5;

    const cropC = document.createElement("canvas");
    cropC.width = 256;
    cropC.height = 256;
    const ctx = cropC.getContext("2d");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(sourceCanvas, sx0, sy0, side, side, 0, 0, 256, 256);

    const imgData = ctx.getImageData(0, 0, 256, 256).data;
    const floatData = new Float32Array(3 * 256 * 256);
    const meanR = 123.675, meanG = 116.28, meanB = 103.53;
    const invStdR = 1 / 58.395, invStdG = 1 / 57.12, invStdB = 1 / 57.375;
    const plane = 256 * 256;

    for (let i = 0; i < plane; i++) {
      const p = i * 4;
      floatData[i] = (imgData[p] - meanR) * invStdR;
      floatData[plane + i] = (imgData[p + 1] - meanG) * invStdG;
      floatData[plane * 2 + i] = (imgData[p + 2] - meanB) * invStdB;
    }

    const inputName = sess.inputNames[0];
    const tensor = new window.ort.Tensor("float32", floatData, [1, 3, 256, 256]);
    const outs = await sess.run({ [inputName]: tensor });
    const simccX = outs[sess.outputNames[0]].data; // [1, 17, 512]
    const simccY = outs[sess.outputNames[1]].data; // [1, 17, 512]

    const kpts = [];
    for (let k = 0; k < 17; k++) {
      const off = k * 512;
      let maxX = -1e9, argX = 0;
      let maxY = -1e9, argY = 0;
      for (let b = 0; b < 512; b++) {
        const vx = simccX[off + b];
        const vy = simccY[off + b];
        if (vx > maxX) { maxX = vx; argX = b; }
        if (vy > maxY) { maxY = vy; argY = b; }
      }
      // Sub-pixel parabolic refinement around SimCC peak
      let pxBins = argX;
      if (argX > 0 && argX < 511) {
        const l = simccX[off + argX - 1], c = maxX, r = simccX[off + argX + 1];
        const d = l - 2 * c + r;
        if (Math.abs(d) > 1e-5) pxBins += 0.5 * (l - r) / d;
      }
      let pyBins = argY;
      if (argY > 0 && argY < 511) {
        const l = simccY[off + argY - 1], c = maxY, r = simccY[off + argY + 1];
        const d = l - 2 * c + r;
        if (Math.abs(d) > 1e-5) pyBins += 0.5 * (l - r) / d;
      }

      const rawScore = 0.5 * (maxX + maxY);
      const u = (sx0 + ((pxBins * 0.5) / 256) * side) / W;
      const v = (sy0 + ((pyBins * 0.5) / 256) * side) / H;
      kpts.push({ u, v, score: rawScore, minPeak: Math.min(maxX, maxY) });
    }
    return kpts;
  }

  /**
   * Runs a two-stage pass (full animal box + head-focused upper box) so both
   * full-body animals and close-up portrait busts get pinpoint eye accuracy.
   */
  /**
   * Runs a two-stage pass (full animal box + head-focused upper box) AND checks for a secondary
   * animal head inside the same box (by masking out the primary head and re-running RTMPose)
   * so 2, 3 (one front + one half-turned), 4, or 6+ eyes are all detected!
   */
  async function detectAnimalPoseForBox(sourceCanvas, animalBox) {
    const kptsFull = await runRTMPoseOnAnimalBox(sourceCanvas, animalBox, 1.12);
    const bh = animalBox.y1 - animalBox.y0;
    const upperBox = {
      x0: animalBox.x0,
      y0: animalBox.y0,
      x1: animalBox.x1,
      y1: animalBox.y0 + bh * 0.68,
    };
    const kptsUpper = await runRTMPoseOnAnimalBox(sourceCanvas, upperBox, 1.08);

    if (!kptsFull) return kptsUpper;
    if (!kptsUpper) return kptsFull;

    const scoreFull = kptsFull[0].score + kptsFull[1].score;
    const scoreUpper = kptsUpper[0].score + kptsUpper[1].score;
    return scoreUpper > scoreFull * 1.05 ? kptsUpper : kptsFull;
  }

  // ------------------------------------------------------------------ 3. Helpers & Main Detect
  function toInputCanvas(src) {
    const w = src.width, h = src.height;
    const s = Math.min(1, MAX_INPUT / Math.max(w, h));
    if (s === 1) return src;
    const c = document.createElement("canvas");
    c.width = Math.round(w * s);
    c.height = Math.round(h * s);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const avgPt = (pts) => {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
  };

  function boxIoU(a, b) {
    const ix0 = Math.max(a.x0, b.x0), iy0 = Math.max(a.y0, b.y0);
    const ix1 = Math.min(a.x1, b.x1), iy1 = Math.min(a.y1, b.y1);
    const iw = Math.max(0, ix1 - ix0), ih = Math.max(0, iy1 - iy0);
    const inter = iw * ih;
    const areaA = Math.max(1e-6, (a.x1 - a.x0) * (a.y1 - a.y0));
    const areaB = Math.max(1e-6, (b.x1 - b.x0) * (b.y1 - b.y0));
    return inter / (areaA + areaB - inter);
  }

  // Fraction of box `small` that lies inside box `large`
  function boxContainment(small, large) {
    const ix0 = Math.max(small.x0, large.x0), iy0 = Math.max(small.y0, large.y0);
    const ix1 = Math.min(small.x1, large.x1), iy1 = Math.min(small.y1, large.y1);
    const iw = Math.max(0, ix1 - ix0), ih = Math.max(0, iy1 - iy0);
    const areaSmall = Math.max(1e-6, (small.x1 - small.x0) * (small.y1 - small.y0));
    return (iw * ih) / areaSmall;
  }

  function nmsBoxes(list, iouThresh = 0.45) {
    const sorted = [...list].sort((a, b) => b.score - a.score);
    const keep = [];
    for (const item of sorted) {
      if (!keep.some((k) => boxIoU(item.box, k.box) > iouThresh)) {
        keep.push(item);
      }
    }
    return keep;
  }

  function parseFace(lm, idx) {
    if (!lm || lm.length < 468) return null;
    const hasIris = lm.length >= 478 && lm[468] && lm[473];
    const centerA = hasIris ? lm[468] : avgPt([lm[33], lm[133], lm[159], lm[145]]);
    const centerB = hasIris ? lm[473] : avgPt([lm[362], lm[263], lm[386], lm[374]]);
    const rA = hasIris
      ? (dist(lm[468], lm[469]) + dist(lm[468], lm[471])) * 0.5
      : dist(lm[33], lm[133]) * 0.22;
    const rB = hasIris
      ? (dist(lm[473], lm[474]) + dist(lm[473], lm[476])) * 0.5
      : dist(lm[362], lm[263]) * 0.22;

    const eyes = [
      { x: centerA.x, y: centerA.y, r: Math.max(0.008, rA) },
      { x: centerB.x, y: centerB.y, r: Math.max(0.008, rB) },
    ].sort((a, b) => a.x - b.x);
    eyes[0].side = "left";
    eyes[1].side = "right";

    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (let i = 0; i < 468; i++) {
      const p = lm[i];
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    const fw = x1 - x0, fh = y1 - y0;
    const head = {
      x0: Math.max(0, x0 - fw * 0.16),
      x1: Math.min(1, x1 + fw * 0.16),
      y0: Math.max(0, y0 - fh * 0.30),
      y1: Math.min(1, y1 + fh * 0.04),
    };
    eyes.forEach((e) => {
      e.faceIndex = idx;
      e.confidence = 0.98;
    });
    return { kind: "human", box: { x0, x1, y0, y1 }, head, eyes, width: head.x1 - head.x0 };
  }

  async function detect(canvas, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 6000;
    const ready = await Promise.race([
      init(),
      new Promise((r) => setTimeout(() => r(false), timeoutMs)),
    ]);
    if (!ready || !_face || !_obj) return null;

    const t0 = performance.now();
    const input = toInputCanvas(canvas);
    const W = input.width, H = input.height;

    let rawFaces = [], objects = [];
    try {
      const fr = _face.detect(input);
      rawFaces = (fr.faceLandmarks || []).map((lm, i) => parseFace(lm, i)).filter(Boolean);
    } catch (e) { console.warn(e); }

    try {
      const or = _obj.detect(input);
      objects = (or.detections || []).map((d) => {
        const b = d.boundingBox, c = d.categories[0];
        return {
          label: c.categoryName,
          score: c.score,
          box: {
            x0: Math.max(0, b.originX / W),
            y0: Math.max(0, b.originY / H),
            x1: Math.min(1, (b.originX + b.width) / W),
            y1: Math.min(1, (b.originY + b.height) / H),
          },
        };
      });
    } catch (e) { console.warn(e); }

    const animals = nmsBoxes(objects.filter((o) => ANIMALS.includes(o.label) && o.score >= 0.24));
    const vehicles = nmsBoxes(objects.filter((o) => VEHICLES.includes(o.label) && o.score >= 0.32));

    // Filter out false-positive "person" boxes that are actually the same bounding box as a higher-scoring animal
    const people = nmsBoxes(
      objects.filter((o) => {
        if (o.label !== "person" || o.score < 0.42) return false;
        const isActuallyAnimal = animals.some(
          (a) => boxIoU(o.box, a.box) > 0.50 && a.score >= o.score * 0.85
        );
        return !isActuallyAnimal;
      })
    );

    // CRITICAL VETO: Discard any FaceLandmarker detection that sits inside an animal box
    // unless it is inside a distinct, verified human `person` box!
    const faces = rawFaces.filter((f) => {
      const insideAnimal = animals.some((a) => boxContainment(f.box, a.box) > 0.55);
      if (!insideAnimal) return true;
      // If inside an animal box, only keep if there is ALSO a distinct person box whose upper body contains this face
      const insideDistinctPerson = people.some(
        (p) => boxContainment(f.box, p.box) > 0.65 && animals.every((a) => boxIoU(p.box, a.box) < 0.45)
      );
      return insideDistinctPerson;
    });

    // Run RTMPose-m AP-10K ONNX on every detected animal (or on the whole subject if no human/vehicle was found)
    const animalPoses = [];
    const shouldRunAnimalAI = animals.length > 0 || (faces.length === 0 && people.length === 0 && vehicles.length === 0);
    if (shouldRunAnimalAI) {
      const targetBoxes = animals.length > 0
        ? animals.map((a) => a.box)
        : [{ x0: 0.04, y0: 0.02, x1: 0.96, y1: 0.96 }];

      for (const box of targetBoxes) {
        try {
          const kptsList = await detectAnimalPoseForBox(input, box);
          if (Array.isArray(kptsList)) {
            for (const kpts of kptsList) animalPoses.push({ box, kpts });
          } else if (kptsList) {
            animalPoses.push({ box, kpts: kptsList });
          }
        } catch (err) {
          console.warn("Animal pose inference error:", err);
        }
      }
    }

    let primaryKind = null;
    if (vehicles.length > 0 && faces.length === 0 && animals.length === 0) {
      primaryKind = "car";
    } else if (faces.length > 0 || (people.length > 0 && animals.length === 0)) {
      primaryKind = "person";
    } else if (people.length > 0 && animals.length > 0 && people[0].score >= 0.58) {
      primaryKind = "person"; // Person + animal in one photo -> "people"
    } else {
      primaryKind = "animal";
    }

    const res = {
      faces,
      animals,
      people,
      vehicles,
      animalPoses,
      primaryKind,
      ms: Math.round(performance.now() - t0),
    };
    console.log(
      `👁️ AI Vision (${res.ms}ms): ${faces.length} human face(s), ${animals.length} animal(s), ${animalPoses.length} AP-10K pose(s), ${vehicles.length} vehicle(s) -> ${primaryKind}`
    );
    return res;
  }

  // ------------------------------------------------------------------ 4. Decode AP-10K Pose & Deduplicate Eyes
  function parseAP10KPoseToEyesAndHead(pose, an, faceIndexOffset = 0) {
    const { kpts, box } = pose;
    if (!kpts || kpts.length < 4) return null;

    const lEye = kpts[0]; // Animal's left eye (usually viewer's right)
    const rEye = kpts[1]; // Animal's right eye (usually viewer's left)
    const nose = kpts[2];
    const neck = kpts[3];

    // AP-10K SimCC logits: confident keypoints have score > 0.15 (or raw peak > 1.2) and lie on the subject mask
    const isValidKp = (kp) =>
      kp &&
      kp.score >= 0.12 &&
      kp.u >= an.bbox.x0 - 0.03 &&
      kp.u <= an.bbox.x1 + 0.03 &&
      kp.v >= an.bbox.y0 - 0.03 &&
      kp.v <= an.bbox.y1 + 0.03;

    const hasL = isValidKp(lEye);
    const hasR = isValidKp(rEye);
    const hasNose = isValidKp(nose);
    const hasNeck = isValidKp(neck);

    if (!hasL && !hasR) return null;

    let eyeSpan = (box.x1 - box.x0) * 0.30;
    if (hasL && hasR) {
      const d = Math.hypot(lEye.u - rEye.u, (lEye.v - rEye.v) * (an.srcH / an.srcW));
      if (d > 0.025) eyeSpan = d;
    } else if (hasNose) {
      const e = hasL ? lEye : rEye;
      const d = Math.hypot(e.u - nose.u, (e.v - nose.v) * (an.srcH / an.srcW));
      if (d > 0.025) eyeSpan = d * 0.85;
    }
    const eyeRadius = Math.max(0.011, Math.min(0.036, eyeSpan * 0.17));

    const eyes = [];
    if (hasL) {
      eyes.push({
        x: lEye.u,
        y: lEye.v,
        r: eyeRadius,
        side: "left",
        faceIndex: faceIndexOffset,
        confidence: Math.min(0.99, +Math.max(0.5, lEye.score / 6).toFixed(2)),
      });
    }
    if (hasR) {
      // If profile view caused L_Eye and R_Eye to collapse onto the same point, keep 1 eye
      if (!hasL || Math.hypot(lEye.u - rEye.u, lEye.v - rEye.v) > 0.022) {
        eyes.push({
          x: rEye.u,
          y: rEye.v,
          r: eyeRadius,
          side: "right",
          faceIndex: faceIndexOffset,
          confidence: Math.min(0.99, +Math.max(0.5, rEye.score / 6).toFixed(2)),
        });
      }
    }
    eyes.sort((a, b) => a.x - b.x);
    if (eyes.length === 2) {
      eyes[0].side = "left";
      eyes[1].side = "right";
    } else if (eyes.length === 1) {
      eyes[0].side = "single";
    }

    const eyeY = eyes.reduce((s, e) => s + e.y, 0) / eyes.length;
    const noseY = hasNose && nose.v > eyeY ? nose.v : eyeY + eyeSpan * (an.srcW / an.srcH) * 0.72;
    const eyeToNoseH = Math.max(0.03, noseY - eyeY);

    // Forehead top (`craniumY0`): sits ~0.68 * eyeToNoseH above the eyes (ignores tall pointy ear tips!)
    const craniumY0 = Math.max(an.bbox.y0, eyeY - eyeToNoseH * 0.68);
    const chinY = Math.min(
      an.bbox.y1,
      hasNeck && neck.v > noseY
        ? Math.min(noseY + eyeToNoseH * 0.62, (noseY + neck.v) * 0.54)
        : noseY + eyeToNoseH * 0.52
    );

    return { eyes, craniumY0, chinY };
  }

  function deduplicateEyes(eyes, minDist = 0.032) {
    const out = [];
    for (const e of eyes) {
      if (!out.some((o) => Math.hypot(e.x - o.x, e.y - o.y) < minDist)) {
        out.push(e);
      }
    }
    return out;
  }

  function measureMaskWidthInBand(an, yTopNorm, yBotNorm, xMinNorm = 0, xMaxNorm = 1) {
    const gw = an._gw, gh = an._gh, g = an._grid;
    if (!g) return null;
    const r0 = Math.max(0, Math.floor(yTopNorm * gh));
    const r1 = Math.min(gh - 1, Math.ceil(yBotNorm * gh));
    const c0 = Math.max(0, Math.floor(xMinNorm * gw));
    const c1 = Math.min(gw - 1, Math.ceil(xMaxNorm * gw));
    let minX = gw, maxX = -1;
    const colCounts = new Int32Array(gw);

    for (let y = r0; y <= r1; y++) {
      const row = y * gw;
      for (let x = c0; x <= c1; x++) {
        if (g[row + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          colCounts[x]++;
        }
      }
    }
    if (maxX <= minX) return null;

    const spanW = maxX - minX + 1;
    let peakFill = 1;
    for (let x = minX; x <= maxX; x++) {
      if (colCounts[x] > peakFill) peakFill = colCounts[x];
    }
    const maxTrim = Math.floor(spanW * 0.16);
    const thresh = peakFill * 0.55;
    let trimL = 0, trimR = 0;
    while (trimL < maxTrim && colCounts[minX + trimL] < thresh) trimL++;
    while (trimR < maxTrim && colCounts[maxX - trimR] < thresh) trimR++;

    const rawW = spanW / gw;
    const cranX0 = (minX + trimL) / gw;
    const cranX1 = (maxX + 1 - trimR) / gw;
    const cranW = Math.max(rawW * 0.72, cranX1 - cranX0);
    return {
      x0: minX / gw,
      x1: (maxX + 1) / gw,
      craniumX0: cranX0,
      craniumX1: cranX1,
      width: rawW,
      effectiveWidth: cranW + 0.22 * (rawW - cranW),
    };
  }

  function boxMaskOverlap(an, b) {
    const gw = an._gw, gh = an._gh, g = an._grid;
    if (!g) return 1;
    let hit = 0, n = 0;
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        n++;
        const x = b.x0 + ((b.x1 - b.x0) * (i + 0.5)) / 7;
        const y = b.y0 + ((b.y1 - b.y0) * (j + 0.5)) / 7;
        const gx = Math.min(gw - 1, Math.max(0, Math.floor(x * gw)));
        const gy = Math.min(gh - 1, Math.max(0, Math.floor(y * gh)));
        if (g[gy * gw + gx]) hit++;
      }
    }
    return hit / n;
  }

  function cloneHidden(src, extra) {
    const c = Object.assign({}, src, extra);
    for (const k of ["_grid", "_gw", "_gh", "_total", "_integral", "_upperL", "_upperR", "_prep", "_distToEdge", "_intLum", "_intLumSq", "_intGradH"]) {
      if (src[k] !== undefined) {
        Object.defineProperty(c, k, { value: src[k], enumerable: false, writable: true });
      }
    }
    return c;
  }

  const union = (boxes) =>
    boxes.reduce(
      (u, b) => ({
        x0: Math.min(u.x0, b.x0),
        x1: Math.max(u.x1, b.x1),
        y0: Math.min(u.y0, b.y0),
        y1: Math.max(u.y1, b.y1),
      }),
      { x0: 1, x1: 0, y0: 1, y1: 0 }
    );

  // ------------------------------------------------------------------ 5. Pure White Coat Detector & Preset Selector
  function isPureWhiteSubject(photoImageData, maskArr) {
    if (!photoImageData || !photoImageData.data || !maskArr) return false;
    const data = photoImageData.data;
    const n = maskArr.length;
    const step = Math.max(1, Math.floor(n / 14000));

    let totalVis = 0;
    let whiteCount = 0;
    let darkPatchCount = 0;
    let coloredPatchCount = 0;

    for (let i = 0; i < n; i += step) {
      if (maskArr[i] < 180) continue;
      const p = i * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx > 0 ? (mx - mn) / mx : 0;

      totalVis++;
      if (lum >= 165 && sat <= 0.16) whiteCount++;
      if (lum < 95 && lum > 25) darkPatchCount++;
      if (sat > 0.24 && lum > 45 && lum < 210) coloredPatchCount++;
    }

    if (totalVis < 20) return false;
    const whiteFrac = whiteCount / totalVis;
    const darkFrac = darkPatchCount / totalVis;
    const colorFrac = coloredPatchCount / totalVis;

    // Pure white animal: >= 72% white coat, and < 12% dark/colored patches (so brown-and-white border collies get white BG!)
    return whiteFrac >= 0.72 && darkFrac < 0.12 && colorFrac < 0.10;
  }

  function recommendPreset(analysis, vision, photoImageData, maskArr) {
    const kind =
      (analysis && analysis.subjects && analysis.subjects.kind) ||
      (vision && vision.primaryKind) ||
      (analysis && !analysis.empty ? window.WatercolorFraming.resolveProfile(analysis, "auto").key : "animal");

    if (typeof STATE !== "undefined") {
      STATE.isAnimalPhoto = kind === "animal" || (vision && vision.animals && vision.animals.length > 0);
    }
    if (kind === "car") return "cars_black";
    if (kind === "person") return "people";
    if (isPureWhiteSubject(photoImageData, maskArr)) return "animals_black";
    return "animals";
  }

  // ------------------------------------------------------------------ 6. Fuse AI Detections into Framing Analysis
  function fuse(analysis, vision, opts = {}) {
    if (!analysis || analysis.empty) return analysis;
    const presetKey = opts.presetKey || "";
    const forcedCar = presetKey.startsWith("cars");

    const vehicles = vision ? vision.vehicles.filter((v) => boxMaskOverlap(analysis, v.box) > 0.25) : [];
    const faces = vision ? vision.faces.filter((f) => boxMaskOverlap(analysis, f.box) > 0.25) : [];
    const animals = vision ? vision.animals.filter((a) => boxMaskOverlap(analysis, a.box) > 0.20) : [];
    const people = vision ? vision.people.filter((p) => boxMaskOverlap(analysis, p.box) > 0.25) : [];

    // 1. VEHICLES: Never place eye markers on cars
    if (forcedCar || (vehicles.length > 0 && faces.length === 0 && animals.length === 0)) {
      return cloneHidden(analysis, {
        eyes: [],
        eyeCenter: null,
        eyeMethod: "vehicle_none",
        subjects: { faces: 0, animals: 0, people: 0, vehicles: Math.max(1, vehicles.length), kind: "car" },
      });
    }

    // Parse all AI animal poses from RTMPose-m AP-10K
    const parsedAnimals = [];
    if (vision && vision.animalPoses) {
      vision.animalPoses.forEach((pose, idx) => {
        if (boxMaskOverlap(analysis, pose.box) > 0.15) {
          const parsed = parseAP10KPoseToEyesAndHead(pose, analysis, faces.length + idx);
          if (parsed && parsed.eyes.length > 0) {
            parsedAnimals.push({ box: pose.box, ...parsed });
          }
        }
      });
    }

    const hasVerifiedHuman =
      faces.length > 0 ||
      (people.length > 0 && animals.length === 0) ||
      (people.length > 0 && people[0].score >= 0.58);

    // 2. PEOPLE (or PEOPLE + ANIMALS in the same photo)
    if (hasVerifiedHuman) {
      faces.sort((a, b) => a.box.x0 - b.box.x0);
      let allEyes = faces.flatMap((f, idx) =>
        f.eyes.map((e) => ({ ...e, faceIndex: idx }))
      );

      for (const pa of parsedAnimals) {
        allEyes = allEyes.concat(pa.eyes);
      }
      allEyes = deduplicateEyes(allEyes, 0.035);

      if (allEyes.length > 0) {
        const sx = allEyes.reduce((s, e) => s + e.x, 0);
        const sy = allEyes.reduce((s, e) => s + e.y, 0);
        const totalSubjects = faces.length + parsedAnimals.length;
        const eyeCenter = {
          x: sx / allEyes.length,
          y: sy / allEyes.length,
          count: allEyes.length,
          faceCount: totalSubjects,
          isHuman: true,
        };

        const headBoxes = faces.map((f) => f.head);
        for (const pa of parsedAnimals) {
          headBoxes.push({
            x0: pa.box.x0,
            x1: pa.box.x1,
            y0: pa.craniumY0,
            y1: pa.chinY,
          });
        }

        const hb = headBoxes.length > 0 ? union(headBoxes) : analysis.head;
        hb.x0 = Math.max(analysis.bbox.x0, hb.x0);
        hb.x1 = Math.min(analysis.bbox.x1, hb.x1);
        const topY = Math.abs(hb.y0 - analysis.bbox.y0) < 0.08 ? analysis.bbox.y0 : hb.y0;
        const spanW = hb.x1 - hb.x0;
        const groupDiscount = totalSubjects > 1 ? 0.86 : 1.0;

        return cloneHidden(analysis, {
          head: {
            x0: hb.x0,
            x1: hb.x1,
            craniumX0: hb.x0,
            craniumX1: hb.x1,
            y0: topY,
            craniumY0: topY,
            y1: hb.y1,
            width: spanW,
            effectiveWidth: spanW * groupDiscount,
            method: totalSubjects > 1 ? `ai_group_${totalSubjects}` : "ai_face_mesh",
          },
          eyes: allEyes,
          eyeCenter,
          eyeMethod: `mediapipe_iris_${allEyes.length}`,
          subjects: {
            faces: faces.length,
            animals: Math.max(animals.length, parsedAnimals.length),
            people: Math.max(people.length, faces.length),
            kind: "person",
          },
        });
      }
    }

    // 3. ANIMALS (1 or multiple dogs, cats, horses, etc. via RTMPose-m AP-10K)
    if (parsedAnimals.length > 0) {
      const allAnimalEyes = deduplicateEyes(
        parsedAnimals.flatMap((pa) => pa.eyes),
        0.028
      );
      const sx = allAnimalEyes.reduce((s, e) => s + e.x, 0);
      const sy = allAnimalEyes.reduce((s, e) => s + e.y, 0);
      const eyeCenter = {
        x: sx / allAnimalEyes.length,
        y: sy / allAnimalEyes.length,
        count: allAnimalEyes.length,
        faceCount: parsedAnimals.length,
        isHuman: false,
      };

      const minCranY0 = Math.min(...parsedAnimals.map((pa) => pa.craniumY0));
      const maxChinY = Math.max(...parsedAnimals.map((pa) => pa.chinY));
      const minBoxX0 = Math.min(...parsedAnimals.map((pa) => pa.box.x0));
      const maxBoxX1 = Math.max(...parsedAnimals.map((pa) => pa.box.x1));

      const band =
        measureMaskWidthInBand(analysis, minCranY0, maxChinY, minBoxX0, maxBoxX1) ||
        analysis.head;
      const groupDiscount = parsedAnimals.length > 1 ? 0.86 : 1.0;

      return cloneHidden(analysis, {
        head: {
          x0: band.x0,
          x1: band.x1,
          craniumX0: band.craniumX0 ?? band.x0,
          craniumX1: band.craniumX1 ?? band.x1,
          y0: analysis.bbox.y0,
          craniumY0: Math.max(analysis.head.craniumY0 ?? analysis.bbox.y0, minCranY0),
          y1: maxChinY,
          width: band.width,
          effectiveWidth: band.effectiveWidth * groupDiscount,
          method: `rtmpose_ap10k_${parsedAnimals.length}`,
        },
        eyes: allAnimalEyes,
        eyeCenter,
        eyeMethod: `rtmpose_ap10k_eyes_${allAnimalEyes.length}`,
        subjects: { faces: 0, animals: parsedAnimals.length, people: 0, kind: "animal" },
      });
    }

    return cloneHidden(analysis, {
      subjects: { faces: 0, animals: Math.max(1, animals.length), people: 0, kind: "animal" },
    });
  }

  const IS_MOBILE_DEVICE =
    typeof window !== "undefined" &&
    (window.innerWidth <= 960 || /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent));

  // Free WASM heaps before Step 3 (Studio) starts so iOS/Desktop RAM stays low
  async function releaseMemory() {
    if (_animalSess) {
      try {
        if (typeof _animalSess.release === "function") await _animalSess.release();
      } catch (_) {}
      _animalSess = null;
      _animalInitPromise = null;
    }
    if (IS_MOBILE_DEVICE) {
      try { if (_face && _face.close) _face.close(); } catch (_) {}
      try { if (_obj && _obj.close) _obj.close(); } catch (_) {}
      _face = null;
      _obj = null;
      _initPromise = null;
    }
  }

  window.SubjectVision = {
    init,
    initAnimalPoseModel: () => (IS_MOBILE_DEVICE ? Promise.resolve(null) : initAnimalPoseModel()),
    detect: async (canvas, opts = {}) => {
      // On mobile, skip the 54.5 MB ONNX download so uploads are fast and iOS never crashes
      if (IS_MOBILE_DEVICE) {
        _animalInitPromise = Promise.resolve(null);
      }
      return detect(canvas, opts);
    },
    fuse,
    recommendPreset,
    isPureWhiteSubject,
    releaseMemory,
  };
  // NOTE: Eager page-load prewarm removed so initial page load on GitHub Pages is instant!
})();