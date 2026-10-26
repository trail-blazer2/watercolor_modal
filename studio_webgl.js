/**
 * 🎨 Watercolor Studio — Part 3/5: WebGL2 Brush Batch & Edge Curve GPU Shaders
 */

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
  if (_glBrush && _glBrush.gl && _glBrush.gl.isContextLost()) {
    _glBrush = null;
  }
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
      if (gl.isContextLost()) return null;
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        gl.deleteShader(s);
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

    v[ptr++] = x0; v[ptr++] = y0; v[ptr++] = 0; v[ptr++] = 0; v[ptr++] = cr; v[ptr++] = cg; v[ptr++] = cb; v[ptr++] = ca;
    v[ptr++] = x1; v[ptr++] = y1; v[ptr++] = 1; v[ptr++] = 0; v[ptr++] = cr; v[ptr++] = cg; v[ptr++] = cb; v[ptr++] = ca;
    v[ptr++] = x2; v[ptr++] = y2; v[ptr++] = 1; v[ptr++] = 1; v[ptr++] = cr; v[ptr++] = cg; v[ptr++] = cb; v[ptr++] = ca;
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

// ============================================================================
// 8B. ISOTROPIC GAUSSIAN WEBGL2 PIPELINE FOR SILKY-SMOOTH EDGE CURVE
// ============================================================================
let _blurTmpA = new Float32Array(0);
let _colSumA = new Float32Array(0);

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
  if (!subImg) return null;

  const [bx, by, bw, bh] = STATE.payload.full_subject_box || [
    Math.max(0, STATE.payload.offset[0]),
    Math.max(0, STATE.payload.offset[1]),
    STATE.payload.subject_size[0],
    STATE.payload.subject_size[1],
  ];
  if (bw <= 0 || bh <= 0) return null;

  // 1. Full-resolution original subject (for razor-sharp outer silhouette & fallback)
  const subC = createCanvas(bw, bh);
  const subCtx = subC.getContext("2d");
  subCtx.drawImage(subImg, bx, by, bw, bh, 0, 0, bw, bh);
  const subData = subCtx.getImageData(0, 0, bw, bh).data;
  subC.width = 1; subC.height = 1;

  // 2. Half-resolution working grid (mw x mh) for the 24 smooth zone blurs -> 4x faster (~80 ms) & 75% less RAM!
  const mw = Math.max(4, bw >> 1);
  const mh = Math.max(4, bh >> 1);
  const smallC = createCanvas(mw, mh);
  smallC.getContext("2d").drawImage(subImg, bx, by, bw, bh, 0, 0, mw, mh);
  const smData = smallC.getContext("2d").getImageData(0, 0, mw, mh).data;
  smallC.width = 1; smallC.height = 1;

  const texSourceImg = STATE.serverImages.subject_tex || STATE.serverImages.edge_curve;
  let texSourceData = null;
  const hasDedicatedSubjectTex = !!STATE.serverImages.subject_tex;
  if (texSourceImg) {
    const texC = createCanvas(mw, mh);
    texC.getContext("2d").drawImage(texSourceImg, bx, by, bw, bh, 0, 0, mw, mh);
    texSourceData = texC.getContext("2d").getImageData(0, 0, mw, mh).data;
    texC.width = 1; texC.height = 1;
  }

  const n = mw * mh;
  const rChan = new Float32Array(n);
  const gChan = new Float32Array(n);
  const bChan = new Float32Array(n);
  const rawLum = new Float32Array(n);
  const alpha = new Uint8Array(n);
  const insideMask = new Float32Array(n);
  const outerSil = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = smData[p], g = smData[p + 1], b = smData[p + 2], a = smData[p + 3];
    alpha[i] = a;
    rChan[i] = r; gChan[i] = g; bChan[i] = b;
    insideMask[i] = a > 240 ? 1.0 : 0.0;
    outerSil[i] = a < 250 ? 1.0 : 0.0;
    rawLum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const den1 = boxBlurFloat32(insideMask, mw, mh, 1);
  const den2 = boxBlurFloat32(insideMask, mw, mh, 2);
  const den3 = boxBlurFloat32(insideMask, mw, mh, 3);
  const den5 = boxBlurFloat32(insideMask, mw, mh, 5);

  const smoothR = normalizedBlurFloat32(normalizedBlurFloat32(rChan, insideMask, mw, mh, 3, den3), insideMask, mw, mh, 2, den2);
  const smoothG = normalizedBlurFloat32(normalizedBlurFloat32(gChan, insideMask, mw, mh, 3, den3), insideMask, mw, mh, 2, den2);
  const smoothB = normalizedBlurFloat32(normalizedBlurFloat32(bChan, insideMask, mw, mh, 3, den3), insideMask, mw, mh, 2, den2);

  let lumClean = normalizedBlurFloat32(rawLum, insideMask, mw, mh, 1, den1);
  lumClean = normalizedBlurFloat32(lumClean, insideMask, mw, mh, 1, den1);

  let lumMid = normalizedBlurFloat32(lumClean, insideMask, mw, mh, 3, den3);
  lumMid = normalizedBlurFloat32(lumMid, insideMask, mw, mh, 2, den2);

  let lumBroad = normalizedBlurFloat32(lumClean, insideMask, mw, mh, 5, den5);
  lumBroad = normalizedBlurFloat32(lumBroad, insideMask, mw, mh, 5, den5);

  let silDist = boxBlurFloat32(outerSil, mw, mh, 3);
  silDist = boxBlurFloat32(silDist, mw, mh, 3);
  const outerEdgeFade = new Float32Array(n);
  const interiorWeight = new Float32Array(n);

  const darkRaw = new Float32Array(n);
  const lightRaw = new Float32Array(n);
  const darkDetail = new Float32Array(n);
  const lightDetail = new Float32Array(n);
  const texRatio = new Float32Array(n);

  const coreDeadzone = (val, deadzone) => {
    const absV = Math.abs(val);
    return absV <= deadzone ? 0.0 : (val > 0 ? 1 : -1) * (absV - deadzone);
  };

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (alpha[i] > 0) {
      outerEdgeFade[i] = Math.max(0, Math.min(1, (0.35 - silDist[i]) / 0.30));
      interiorWeight[i] = Math.max(0, Math.min(1, (0.12 - silDist[i]) / 0.10));
    }
    const ins = insideMask[i];
    if (ins > 0) {
      const l = lumClean[i];
      if (l < 72) darkRaw[i] = Math.min(1.0, (72 - l) / 14.0);
      if (l > 164) lightRaw[i] = Math.min(1.0, (l - 164) / 14.0);

      const devMid = coreDeadzone(l - lumMid[i], 3.2);
      const devBroad = coreDeadzone(l - lumBroad[i], 4.0);
      const localContrast = devMid * 1.65 + devBroad * 1.45;
      const lEff = l + localContrast;

      let dDet = lEff < 74 ? Math.min(1.0, (74 - lEff) / 14.0) : 0.0;
      let ltDet = lEff > 162 ? Math.min(1.0, (lEff - 162) / 14.0) : 0.0;
      if (-localContrast > 10.0) dDet = Math.max(dDet, Math.min(1.0, (-localContrast - 10.0) / 14.0));
      if (localContrast > 11.0) ltDet = Math.max(ltDet, Math.min(1.0, (localContrast - 11.0) / 14.0));
      darkDetail[i] = dDet;
      lightDetail[i] = ltDet;
    }
    texRatio[i] = 1.0;
    if (texSourceData && texSourceData[p + 3] > 240 && outerEdgeFade[i] > 0.05) {
      const tLum = 0.299 * texSourceData[p] + 0.587 * texSourceData[p + 1] + 0.114 * texSourceData[p + 2];
      const refLum = hasDedicatedSubjectTex
        ? Math.max(12, rawLum[i])
        : Math.max(15, 0.299 * smoothR[i] + 0.587 * smoothG[i] + 0.114 * smoothB[i]);
      const ratio = Math.max(0.84, Math.min(1.16, tLum / refLum));
      texRatio[i] = 1.0 + (ratio - 1.0) * outerEdgeFade[i];
    }
  }

  const darkFineSmooth = normalizedBlurFloat32(darkDetail, insideMask, mw, mh, 1, den1);
  const lightFineSmooth = normalizedBlurFloat32(lightDetail, insideMask, mw, mh, 1, den1);

  const smoothRgba = new Uint8Array(n * 4);
  const rawZonesRgba = new Uint8Array(n * 4);
  const staticWeightsRgba = new Uint8Array(n * 4);

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const ins = insideMask[i];
    smoothRgba[p] = Math.max(0, Math.min(255, Math.round(smoothR[i])));
    smoothRgba[p + 1] = Math.max(0, Math.min(255, Math.round(smoothG[i])));
    smoothRgba[p + 2] = Math.max(0, Math.min(255, Math.round(smoothB[i])));
    smoothRgba[p + 3] = 255;

    rawZonesRgba[p] = Math.round(darkRaw[i] * ins * 255);
    rawZonesRgba[p + 1] = Math.round(lightRaw[i] * ins * 255);
    rawZonesRgba[p + 2] = Math.round(darkFineSmooth[i] * ins * 255);
    rawZonesRgba[p + 3] = Math.round(lightFineSmooth[i] * ins * 255);

    staticWeightsRgba[p] = Math.round(outerEdgeFade[i] * 255);
    staticWeightsRgba[p + 1] = Math.round(interiorWeight[i] * 255);
    staticWeightsRgba[p + 2] = Math.max(0, Math.min(255, Math.round(((texRatio[i] - 0.84) / 0.32) * 255)));
    staticWeightsRgba[p + 3] = Math.round(ins * 255);
  }

  STATE.edgeCurveCache = {
    bx, by, bw, bh, mw, mh,
    subData, smoothR, smoothG, smoothB, alpha, insideMask,
    outerEdgeFade, interiorWeight, texRatio,
    darkRaw, lightRaw, darkFine: darkFineSmooth, lightFine: lightFineSmooth,
    smoothRgba, rawZonesRgba, staticWeightsRgba,
  };
  return STATE.edgeCurveCache;
}

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
  _glEC.lastDetailKey = -1;
  _glEC.lastRimKey = -1;
  _glEC.lastRimSigma = -1;
}

function initGLEdgeCurveContext() {
  if (_glEC && _glEC.gl && _glEC.gl.isContextLost()) {
  _glEC = null;
  }
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

  // Horizontal 1D True Gaussian Blur (continuous float u_sigma -> zero staircase or square artifacts!)
  const fsBlurH = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    uniform sampler2D u_tex;
    uniform sampler2D u_texStatic;
    uniform float u_stepX;
    uniform float u_sigma;
    uniform int u_radius;
    uniform int u_premask;
    uniform float u_fineMix;
    out vec4 outColor;
    void main() {
      vec3 sum = vec3(0.0);
      float wSum = 0.0;
      float inv2Sig2 = 0.5 / max(0.05, u_sigma * u_sigma);
      for (int i = -20; i <= 20; i++) {
        if (i < -u_radius || i > u_radius) continue;
        float fi = float(i);
        float w = exp(-fi * fi * inv2Sig2);
        vec2 uv = clamp(v_uv + vec2(fi * u_stepX, 0.0), vec2(0.0), vec2(1.0));
        vec4 s = texture(u_tex, uv);
        if (u_premask == 0) {
          float ins = texture(u_texStatic, uv).a;
          vec2 z = mix(s.rg, max(s.rg, s.ba), u_fineMix);
          sum += vec3(z, ins) * w;
        } else {
          sum += vec3(s.rg * s.b, s.b) * w;
        }
        wSum += w;
      }
      outColor = vec4(sum / max(1e-5, wSum), 1.0);
    }
  `;

  // Vertical 1D True Gaussian Blur + insideMask normalization + smooth anti-aliased threshold
  const fsBlurVNorm = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    uniform sampler2D u_texH;
    uniform sampler2D u_texStatic;
    uniform float u_stepY;
    uniform float u_sigma;
    uniform int u_radius;
    uniform int u_doThresh;
    out vec4 outColor;
    void main() {
      vec3 sum = vec3(0.0);
      float wSum = 0.0;
      float inv2Sig2 = 0.5 / max(0.05, u_sigma * u_sigma);
      for (int i = -20; i <= 20; i++) {
        if (i < -u_radius || i > u_radius) continue;
        float fi = float(i);
        float w = exp(-fi * fi * inv2Sig2);
        vec2 uv = clamp(v_uv + vec2(0.0, fi * u_stepY), vec2(0.0), vec2(1.0));
        sum += texture(u_texH, uv).rgb * w;
        wSum += w;
      }
      vec3 blurred = sum / max(1e-5, wSum);
      float inside = texture(u_texStatic, v_uv).a;
      vec2 res = blurred.b > 1e-4 ? (blurred.rg / blurred.b) : vec2(0.0);
      if (u_doThresh == 1) {
        res = smoothstep(vec2(0.36), vec2(0.54), res);
      }
      outColor = vec4(res, inside, 1.0);
    }
  `;

  // Final Tri-Tone Composite Shader (applies clean Watercolor Texture Overlay when enabled on Subject!)
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
    uniform float u_useWcTex;
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

      vec3 dr = sm * 0.65;
      vec3 lr = 1.0 - (1.0 - sm) * 0.77;
      float rawTex = 0.84 + st.b * 0.32;
      float tex = mix(1.0, rawTex, u_useWcTex);
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
      if (gl.isContextLost()) return null;
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        gl.deleteShader(s);
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
  gl.uniform1i(gl.getUniformLocation(progH, "u_texStatic"), 1);

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
    uH_sigma: gl.getUniformLocation(progH, "u_sigma"),
    uH_radius: gl.getUniformLocation(progH, "u_radius"),
    uH_premask: gl.getUniformLocation(progH, "u_premask"),
    uH_fineMix: gl.getUniformLocation(progH, "u_fineMix"),
    uV_stepY: gl.getUniformLocation(progV, "u_stepY"),
    uV_sigma: gl.getUniformLocation(progV, "u_sigma"),
    uV_radius: gl.getUniformLocation(progV, "u_radius"),
    uV_doThresh: gl.getUniformLocation(progV, "u_doThresh"),
    uC_rimStrength: gl.getUniformLocation(progC, "u_rimStrength"),
    uC_hasRim: gl.getUniformLocation(progC, "u_hasRim"),
    uC_useWcTex: gl.getUniformLocation(progC, "u_useWcTex"),
    uploadedCache: null,
    lastDetailKey: -1,
    lastRimKey: -1,
    lastRimSigma: -1,
  };
  return _glEC;
}

function createGLTexRGBA8(gl, w, h, data, useLinear = true) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const filter = useLinear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
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
  const mw = cache.mw || bw;
  const mh = cache.mh || bh;

  if (ec.uploadedCache !== cache) {
    destroyGLEdgeCurveResources();
    canvas.width = bw;
    canvas.height = bh;
    ec.texOrig = createGLTexRGBA8(gl, bw, bh, new Uint8Array(cache.subData.buffer, cache.subData.byteOffset, cache.subData.byteLength), true);
    ec.texSmooth = createGLTexRGBA8(gl, mw, mh, cache.smoothRgba, true);
    ec.texRawZones = createGLTexRGBA8(gl, mw, mh, cache.rawZonesRgba, true);
    ec.texStatic = createGLTexRGBA8(gl, mw, mh, cache.staticWeightsRgba, true);

    ec.texPing = createGLTexRGBA8(gl, mw, mh, null, true);
    ec.texPong = createGLTexRGBA8(gl, mw, mh, null, true);
    ec.texMasks = createGLTexRGBA8(gl, mw, mh, null, true);
    ec.texRim = createGLTexRGBA8(gl, mw, mh, null, true);

    ec.fboPing = createGLFbo(gl, ec.texPing);
    ec.fboPong = createGLFbo(gl, ec.texPong);
    ec.fboMasks = createGLFbo(gl, ec.texMasks);
    ec.fboRim = createGLFbo(gl, ec.texRim);
    ec.uploadedCache = cache;
  }

  gl.disable(gl.BLEND);
  gl.bindVertexArray(vao);
  gl.viewport(0, 0, mw, mh);

  const stepX = 1.0 / mw;
  const stepY = 1.0 / mh;

  const rawDetail = p.maskDetail ?? 85;
  const norm = Math.max(0, Math.min(1.5, rawDetail / 100));
  const sigma1 = (1.35 + Math.pow(Math.max(0, 1.5 - norm) / 1.5, 1.45) * 8.5) * 0.5;
  const sigma2 = Math.max(0.6, sigma1 * 0.72);
  const fineMix = Math.max(0, Math.min(1.0, (rawDetail - 20) / 95));
  const detailKey = Math.round(rawDetail * 2);

  const runGaussianPass = (srcTex, dstFbo, sigma, premask, doThresh) => {
    const radius = Math.min(14, Math.max(1, Math.ceil(sigma * 2.6)));
    gl.bindFramebuffer(gl.FRAMEBUFFER, ec.fboPing);
    gl.useProgram(ec.progH);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ec.texStatic);
    gl.uniform1f(ec.uH_stepX, stepX);
    gl.uniform1f(ec.uH_sigma, sigma);
    gl.uniform1i(ec.uH_radius, radius);
    gl.uniform1i(ec.uH_premask, premask ? 1 : 0);
    gl.uniform1f(ec.uH_fineMix, fineMix);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
    gl.useProgram(ec.progV);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ec.texPing);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ec.texStatic);
    gl.uniform1f(ec.uV_stepY, stepY);
    gl.uniform1f(ec.uV_sigma, sigma);
    gl.uniform1i(ec.uV_radius, radius);
    gl.uniform1i(ec.uV_doThresh, doThresh ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  if (ec.lastDetailKey !== detailKey) {
    runGaussianPass(ec.texRawZones, ec.fboMasks, sigma1, false, false);
    runGaussianPass(ec.texMasks, ec.fboPong, sigma2, true, true);
    runGaussianPass(ec.texPong, ec.fboMasks, 0.85, true, false);
    ec.lastDetailKey = detailKey;
    ec.lastRimKey = -1;
  }

  const edgeThick = p.edgeThickness ?? 0;
  const rimStrength = Math.min(0.65, (edgeThick / 100) * 0.55);
  if (edgeThick > 0) {
    const rimSigma = (0.8 + (edgeThick / 100) * 3.2) * 0.5;
    const rimSigmaKey = Math.round(rimSigma * 20);
    if (ec.lastRimKey !== detailKey || ec.lastRimSigma !== rimSigmaKey) {
      runGaussianPass(ec.texMasks, ec.fboRim, rimSigma, true, false);
      ec.lastRimKey = detailKey;
      ec.lastRimSigma = rimSigmaKey;
    }
  }

  const subLayer = STATE.layers && STATE.layers.subject;
  const useWcTex = subLayer && subLayer.params && subLayer.params.wcTexture ? 1.0 : 0.0;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, bw, bh);
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
  gl.uniform1f(ec.uC_useWcTex, useWcTex);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  return canvas;
}

function rerenderLiveEdgeCurveLayer(skipComposite = false) {
  const lyr = STATE.layers.edge_curve;
  if (!lyr || !STATE.serverImages.subject_cc) return;
  const cache = getOrBuildEdgeCurveCache();
  if (!cache) return;

  const [cw, ch] = STATE.payload.canvas_size;
  const p = lyr.params;

  const glCanvas = renderEdgeCurveWebGL(cache, p);
  if (glCanvas) {
    const ctx = lyr.baseCanvas.getContext("2d");
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(glCanvas, cache.bx, cache.by);
    if (_stack.id !== "edge_curve") invalidateStack();
    if (!skipComposite) compositeAllLayers();
    return;
  }

  // 2D CPU Fallback if WebGL2 is unavailable
  const {
    bx, by, bw, bh,
    subData, smoothR, smoothG, smoothB, alpha, insideMask,
    outerEdgeFade, interiorWeight, texRatio, darkRaw, lightRaw, darkFine, lightFine,
  } = cache;
  const n = bw * bh;

  const rawDetail = p.maskDetail ?? 85;
  const norm = Math.max(0, Math.min(1.5, rawDetail / 100));
  const r1 = Math.max(1, Math.round(1.5 + Math.pow(Math.max(0, 1.5 - norm) / 1.5, 1.45) * 12));
  const r2 = Math.max(1, Math.round(r1 * 0.72));
  const fineMix = Math.max(0, Math.min(1.0, (rawDetail - 20) / 95));

  const dIn = new Float32Array(n);
  const lIn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    dIn[i] = darkRaw[i] * (1 - fineMix) + Math.max(darkRaw[i], darkFine[i]) * fineMix;
    lIn[i] = lightRaw[i] * (1 - fineMix) + Math.max(lightRaw[i], lightFine[i]) * fineMix;
  }

  let darkBlur = normalizedBlurFloat32(dIn, insideMask, bw, bh, r1);
  darkBlur = normalizedBlurFloat32(darkBlur, insideMask, bw, bh, r2);
  let lightBlur = normalizedBlurFloat32(lIn, insideMask, bw, bh, r1);
  lightBlur = normalizedBlurFloat32(lightBlur, insideMask, bw, bh, r2);

  const darkThresh = new Float32Array(n);
  const lightThresh = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dt = Math.max(0, Math.min(1, (darkBlur[i] - 0.36) / 0.18));
    const lt = Math.max(0, Math.min(1, (lightBlur[i] - 0.36) / 0.18));
    darkThresh[i] = dt * dt * (3 - 2 * dt);
    lightThresh[i] = lt * lt * (3 - 2 * lt);
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

  const subLayer = STATE.layers && STATE.layers.subject;
  const useWcTex = subLayer && subLayer.params && subLayer.params.wcTexture;

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
    const tex = useWcTex ? texRatio[i] : 1.0;

    let r = (sr * 0.65 * dm + sr * mm + (255 - (255 - sr) * 0.77) * lm) * tex;
    let g = (sg * 0.65 * dm + sg * mm + (255 - (255 - sg) * 0.77) * lm) * tex;
    let b = (sb * 0.65 * dm + sb * mm + (255 - (255 - sb) * 0.77) * lm) * tex;

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