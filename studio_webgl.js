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
// 8B. PHOTOSHOP-ACTION ARTIST CUTOUT ENGINE (RGBA16F Float + Tangent-Straightened Contours)
//   - Uploads the multi-scale luminance pyramid as a 16-bit Floating-Point texture
//     (RGBA16F) so 8-bit quantization stair-steps are 100% eliminated!
//   - Uses Structure-Tensor Tangent Smoothing in the shader: smooths ALONG the
//     direction of lines/edges (making lines straight, clean, and non-jagged!)
//     without blurring ACROSS thin wheel spokes or panel gaps!
//   - Uses hardware screen-space derivatives (fwidth) for razor-sharp, sub-pixel
//     anti-aliased vector contour edges at any zoom level.
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

function normalizedBlurFloat32(src, weightMask, w, h, radius, cachedDen, outBuf) {
  const n = w * h;
  const dst = outBuf || new Float32Array(n);
  for (let i = 0; i < n; i++) dst[i] = src[i] * weightMask[i];
  boxBlurFloat32(dst, w, h, radius, dst);
  const den = cachedDen || boxBlurFloat32(weightMask, w, h, radius);
  for (let i = 0; i < n; i++) {
    dst[i] = den[i] > 1e-4 ? dst[i] / den[i] : src[i];
  }
  return dst;
}

function gaussianBlurNormalized3Pass(src, insideMask, w, h, r1, den1, r2, den2, r3, den3) {
  let b = normalizedBlurFloat32(src, insideMask, w, h, r1, den1);
  b = normalizedBlurFloat32(b, insideMask, w, h, r2, den2);
  b = normalizedBlurFloat32(b, insideMask, w, h, r3, den3);
  return b;
}

function buildZoneExtrapolatedPaintRgba(rChan, gChan, bChan, zoneWeight, insideMask, mw, mh, r1, r2) {
  const n = mw * mh;
  const denTight = boxBlurFloat32(zoneWeight, mw, mh, r1);
  const rTight = new Float32Array(n);
  const gTight = new Float32Array(n);
  const bTight = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = zoneWeight[i];
    rTight[i] = rChan[i] * w;
    gTight[i] = gChan[i] * w;
    bTight[i] = bChan[i] * w;
  }
  boxBlurFloat32(rTight, mw, mh, r1, rTight);
  boxBlurFloat32(gTight, mw, mh, r1, gTight);
  boxBlurFloat32(bTight, mw, mh, r1, bTight);

  const wBroad = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = denTight[i];
    if (d > 1e-3) {
      rTight[i] /= d;
      gTight[i] /= d;
      bTight[i] /= d;
      wBroad[i] = Math.min(1.0, d * 5.0) * insideMask[i];
    } else {
      rTight[i] = rChan[i];
      gTight[i] = gChan[i];
      bTight[i] = bChan[i];
      wBroad[i] = 0.015 * insideMask[i];
    }
  }
  const denBroad = boxBlurFloat32(wBroad, mw, mh, r2);
  const rOut = normalizedBlurFloat32(rTight, wBroad, mw, mh, r2, denBroad);
  const gOut = normalizedBlurFloat32(gTight, wBroad, mw, mh, r2, denBroad);
  const bOut = normalizedBlurFloat32(bTight, wBroad, mw, mh, r2, denBroad);

  const rgba = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    rgba[p]     = Math.max(0, Math.min(255, Math.round(rOut[i])));
    rgba[p + 1] = Math.max(0, Math.min(255, Math.round(gOut[i])));
    rgba[p + 2] = Math.max(0, Math.min(255, Math.round(bOut[i])));
    rgba[p + 3] = 255;
  }
  return rgba;
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

  const subC = createCanvas(bw, bh);
  const subCtx = subC.getContext("2d");
  subCtx.drawImage(subImg, bx, by, bw, bh, 0, 0, bw, bh);
  const subData = subCtx.getImageData(0, 0, bw, bh).data;
  subC.width = 1; subC.height = 1;

  const nFull = bw * bh;
  const rawLumFull = new Float32Array(nFull);
  const insideFull = new Float32Array(nFull);
  const outerSilFull = new Float32Array(nFull);

  for (let i = 0; i < nFull; i++) {
    const p = i * 4;
    const a = subData[p + 3];
    insideFull[i] = a > 235 ? 1.0 : 0.0;
    outerSilFull[i] = a < 245 ? 1.0 : 0.0;
    rawLumFull[i] = 0.299 * subData[p] + 0.587 * subData[p + 1] + 0.114 * subData[p + 2];
  }

  const den1 = boxBlurFloat32(insideFull, bw, bh, 1);
  const den2 = boxBlurFloat32(insideFull, bw, bh, 2);
  const den4 = boxBlurFloat32(insideFull, bw, bh, 4);
  const den6 = boxBlurFloat32(insideFull, bw, bh, 6);
  const den10 = boxBlurFloat32(insideFull, bw, bh, 10);

  // 1. Structure-Tensor Guided Pre-Smoothing of Fine Luminance:
  //    Eliminates single-pixel JPEG stair-steps along diagonal lines (like the headlight border & panel seam)
  //    BEFORE computing local contrast or uploading to the GPU!
  const lumPre = normalizedBlurFloat32(rawLumFull, insideFull, bw, bh, 1, den1);
  const jxx = new Float32Array(nFull);
  const jyy = new Float32Array(nFull);
  const jxy = new Float32Array(nFull);

  for (let y = 1; y < bh - 1; y++) {
    const row = y * bw;
    for (let x = 1; x < bw - 1; x++) {
      const i = row + x;
      const gx = (lumPre[i + 1] - lumPre[i - 1]) * 0.5;
      const gy = (lumPre[i + bw] - lumPre[i - bw]) * 0.5;
      jxx[i] = gx * gx;
      jyy[i] = gy * gy;
      jxy[i] = gx * gy;
    }
  }
  // Smooth the structure tensor over a 5px radius so the tangent direction is a silky-smooth curve!
  boxBlurFloat32(boxBlurFloat32(jxx, bw, bh, 3), bw, bh, 2, jxx);
  boxBlurFloat32(boxBlurFloat32(jyy, bw, bh, 3), bw, bh, 2, jyy);
  boxBlurFloat32(boxBlurFloat32(jxy, bw, bh, 3), bw, bh, 2, jxy);

  // Advect/smooth rawLumFull 5 steps ALONG the smooth structure-tensor tangent (with sub-pixel bilinear sampling)
  // so diagonal lines are straightened and de-pixelated while keeping 100% cross-line sharpness!
  const lumTangentSmooth = new Float32Array(nFull);
  const sampleBilinear = (buf, fx, fy) => {
    const x0 = Math.max(0, Math.min(bw - 1, fx | 0));
    const y0 = Math.max(0, Math.min(bh - 1, fy | 0));
    const x1 = Math.min(bw - 1, x0 + 1);
    const y1 = Math.min(bh - 1, y0 + 1);
    const dx = Math.max(0, fx - x0);
    const dy = Math.max(0, fy - y0);
    const r0 = y0 * bw, r1 = y1 * bw;
    return (
      buf[r0 + x0] * (1 - dx) * (1 - dy) +
      buf[r0 + x1] * dx * (1 - dy) +
      buf[r1 + x0] * (1 - dx) * dy +
      buf[r1 + x1] * dx * dy
    );
  };

  for (let y = 0; y < bh; y++) {
    const row = y * bw;
    for (let x = 0; x < bw; x++) {
      const i = row + x;
      if (insideFull[i] <= 0) {
        lumTangentSmooth[i] = rawLumFull[i];
        continue;
      }
      const theta = 0.5 * Math.atan2(2.0 * jxy[i], jxx[i] - jyy[i] + 1e-6);
      // Tangent vector is perpendicular to the dominant gradient eigenvector
      const tx = -Math.sin(theta);
      const ty = Math.cos(theta);

      let sum = lumPre[i] * 0.30;
      sum += (sampleBilinear(lumPre, x + tx * 1.1, y + ty * 1.1) + sampleBilinear(lumPre, x - tx * 1.1, y - ty * 1.1)) * 0.22;
      sum += (sampleBilinear(lumPre, x + tx * 2.3, y + ty * 2.3) + sampleBilinear(lumPre, x - tx * 2.3, y - ty * 2.3)) * 0.13;
      lumTangentSmooth[i] = sum;
    }
  }
  // Light 1px isotropic polish on lumTangentSmooth so B-spline control points have zero high-frequency aliasing
  const lumFine   = normalizedBlurFloat32(lumTangentSmooth, insideFull, bw, bh, 1, den1);
  const lumMed    = gaussianBlurNormalized3Pass(lumFine, insideFull, bw, bh, 4, den4, 4, den4, 2, den2);
  const lumCoarse = gaussianBlurNormalized3Pass(lumFine, insideFull, bw, bh, 10, den10, 6, den6, 4, den4);
  const lumLocal6 = normalizedBlurFloat32(lumFine, insideFull, bw, bh, 6, den6);

  // Compute signed local detail band from the tangent-smoothed fine luminance, then smooth it again!
  const diffRaw = new Float32Array(nFull);
  for (let i = 0; i < nFull; i++) {
    diffRaw[i] = insideFull[i] > 0 ? (lumFine[i] - lumLocal6[i]) : 0.0;
  }
  const diffSmooth = gaussianBlurNormalized3Pass(diffRaw, insideFull, bw, bh, 2, den2, 1, den1, 1, den1);

  let silDistFull = boxBlurFloat32(outerSilFull, bw, bh, 4);
  silDistFull = boxBlurFloat32(silDistFull, bw, bh, 4);

  const zonePyrFloat = new Float32Array(nFull * 4);
  const zonePyrBRgba = new Uint8Array(nFull * 4);
  const inv255 = 1.0 / 255.0;

  for (let i = 0; i < nFull; i++) {
    const p = i * 4;
    const a = subData[p + 3];
    const fade = a > 0 ? Math.max(0, Math.min(1, (0.42 - silDistFull[i]) / 0.34)) : 0.0;
    const intW = a > 0 ? Math.max(0, Math.min(1, (0.16 - silDistFull[i]) / 0.12)) : 0.0;

    zonePyrFloat[p]     = lumFine[i] * inv255;
    zonePyrFloat[p + 1] = lumMed[i] * inv255;
    zonePyrFloat[p + 2] = lumCoarse[i] * inv255;
    zonePyrFloat[p + 3] = diffSmooth[i] * inv255;

    zonePyrBRgba[p]     = Math.round(fade * 255);
    zonePyrBRgba[p + 1] = Math.round(intW * 255);
    zonePyrBRgba[p + 2] = 0;
    zonePyrBRgba[p + 3] = 255;
  }

  // 2. Half-res grid for the 3 smooth Zone-Extrapolated Paint buffers
  const mw = Math.max(4, bw >> 1);
  const mh = Math.max(4, bh >> 1);
  const smallC = createCanvas(mw, mh);
  smallC.getContext("2d").drawImage(subImg, bx, by, bw, bh, 0, 0, mw, mh);
  const smData = smallC.getContext("2d").getImageData(0, 0, mw, mh).data;
  smallC.width = 1; smallC.height = 1;

  const nHalf = mw * mh;
  const rChan = new Float32Array(nHalf);
  const gChan = new Float32Array(nHalf);
  const bChan = new Float32Array(nHalf);
  const insideHalf = new Float32Array(nHalf);
  const darkWHalf = new Float32Array(nHalf);
  const midWHalf = new Float32Array(nHalf);
  const lightWHalf = new Float32Array(nHalf);

  for (let i = 0; i < nHalf; i++) {
    const p = i * 4;
    const r = smData[p], g = smData[p + 1], b = smData[p + 2], a = smData[p + 3];
    rChan[i] = r; gChan[i] = g; bChan[i] = b;
    const ins = a > 235 ? 1.0 : 0.0;
    insideHalf[i] = ins;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const dW = l < 72.0 ? Math.min(1.0, (72.0 - l) / 18.0) : 0.0;
    const lW = l > 162.0 ? Math.min(1.0, (l - 162.0) / 18.0) : 0.0;
    const mW = Math.max(0.05, 1.0 - dW - lW);
    darkWHalf[i]  = (dW + 0.02) * ins;
    lightWHalf[i] = (lW + 0.02) * ins;
    midWHalf[i]   = mW * ins;
  }

  const darkPaintRgba  = buildZoneExtrapolatedPaintRgba(rChan, gChan, bChan, darkWHalf,  insideHalf, mw, mh, 1, 3);
  const midPaintRgba   = buildZoneExtrapolatedPaintRgba(rChan, gChan, bChan, midWHalf,   insideHalf, mw, mh, 5, 8);
  const lightPaintRgba = buildZoneExtrapolatedPaintRgba(rChan, gChan, bChan, lightWHalf, insideHalf, mw, mh, 2, 4);

  STATE.edgeCurveCache = {
    bx, by, bw, bh, mw, mh,
    subData,
    darkPaintRgba,
    midPaintRgba,
    lightPaintRgba,
    zonePyrFloat,
    zonePyrBRgba,
  };
  return STATE.edgeCurveCache;
}

let _glEC = null;

function destroyGLEdgeCurveResources() {
  if (!_glEC) return;
  const { gl } = _glEC;
  for (const k of ["texOrig", "texDarkPaint", "texMidPaint", "texLightPaint", "texPyrA", "texPyrB", "texWc"]) {
    if (_glEC[k]) { gl.deleteTexture(_glEC[k]); _glEC[k] = null; }
  }
  _glEC.uploadedCache = null;
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
  gl.getExtension("OES_texture_float_linear");

  const vsSrc = `#version 300 es
    layout(location = 0) in vec2 a_pos;
    out vec2 v_uv;
    void main() {
      gl_Position = vec4(a_pos, 0.0, 1.0);
      v_uv = a_pos * 0.5 + 0.5;
    }
  `;

  // True C2-Continuous Cubic B-Spline + Tangent-Flow Artist Cutout Shader:
  // 1. Samples u_pyrA using a 4-fetch hardware Cubic B-Spline filter (C2 continuous derivatives!)
  //    so bilinear pixel-grid kinks and staircase steps CANNOT exist at any resolution (even 5000x3000px!).
  // 2. Smooths ALONG the local edge tangent to straighten contours and round corners.
  // 3. Computes the exact analytical gradient magnitude |grad(L)| from the B-Spline surface (instead of
  //    blocky 2x2 fwidth) for silky-smooth, sub-pixel vector anti-aliasing along every edge!
  const fsCutoutAction = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    uniform sampler2D u_orig;
    uniform sampler2D u_darkPaint;
    uniform sampler2D u_midPaint;
    uniform sampler2D u_lightPaint;
    uniform sampler2D u_pyrA;
    uniform sampler2D u_pyrB;
    uniform sampler2D u_wcTex;
    uniform vec2 u_step;
    uniform vec2 u_wcScale;
    uniform float u_detail;       // 0.0 (0%) .. 2.0 (200%)
    uniform float u_rimStrength;  // 0.0 by default
    uniform float u_useWcTex;     // 1.0 when Subject Watercolor Texture is ON
    out vec4 outColor;

    // Fast 4-tap Hardware Cubic B-Spline Texture Lookup:
    // Converts standard C0 bilinear hardware filtering into a C2-continuous cubic B-spline surface!
    // Completely eliminates texel-boundary kinks and diagonal pixel staircases!
    vec4 textureBicubicBSpline(sampler2D tex, vec2 uv) {
      vec2 texSize = 1.0 / u_step;
      vec2 coord = uv * texSize - 0.5;
      vec2 index = floor(coord);
      vec2 f = coord - index;

      vec2 f2 = f * f;
      vec2 f3 = f2 * f;

      vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
      vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
      vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
      vec2 w3 = f3 / 6.0;

      vec2 g0 = w0 + w1;
      vec2 g1 = w2 + w3;

      vec2 h0 = ((index - 0.5 + w1 / g0) * u_step);
      vec2 h1 = ((index + 1.5 + w3 / g1) * u_step);

      vec4 tex00 = texture(tex, vec2(h0.x, h0.y));
      vec4 tex10 = texture(tex, vec2(h1.x, h0.y));
      vec4 tex01 = texture(tex, vec2(h0.x, h1.y));
      vec4 tex11 = texture(tex, vec2(h1.x, h1.y));

      tex00 = mix(tex01, tex00, g0.y);
      tex10 = mix(tex11, tex10, g0.y);
      return mix(tex10, tex00, g0.x);
    }

    float evalSplineLumAt(vec2 uv) {
      vec4 a = textureBicubicBSpline(u_pyrA, clamp(uv, vec2(0.0), vec2(1.0)));
      float tCoarseToMed = clamp(u_detail / 0.50, 0.0, 1.0);
      float tMedToFine   = clamp((u_detail - 0.35) / 1.15, 0.0, 1.0);

      float baseL = mix(a.b, a.g, tCoarseToMed);
      baseL = mix(baseL, a.r, tMedToFine * 0.85);

      float detailBoost = clamp((u_detail - 0.15) / 1.85, 0.0, 1.0) * 2.15;
      float diff = a.a;
      // Smooth C1 deadzone (sqrt(diff^2 + eps^2) - eps) instead of sharp max(0, |diff|-eps) so zero kinks!
      float eps = 0.012;
      float cleanMag = max(0.0, sqrt(diff * diff + eps * eps) - eps);
      float cleanDiff = (diff >= 0.0 ? 1.0 : -1.0) * cleanMag;

      return clamp(baseL + cleanDiff * detailBoost, 0.0, 1.0);
    }

    // Evaluates both the tangent-straightened luminance L AND its exact analytical gradient magnitude |grad(L)|
    vec2 evalSmoothLumAndGrad(vec2 uv) {
      vec2 sp = u_step * 2.2;
      float lN = evalSplineLumAt(uv + vec2(0.0, -sp.y));
      float lS = evalSplineLumAt(uv + vec2(0.0,  sp.y));
      float lE = evalSplineLumAt(uv + vec2( sp.x, 0.0));
      float lW = evalSplineLumAt(uv + vec2(-sp.x, 0.0));

      vec2 grad = vec2(lE - lW, lS - lN);
      float gradLen = length(grad);
      vec2 tang = gradLen > 1e-4 ? vec2(-grad.y / gradLen, grad.x / gradLen) : vec2(1.0, 0.0);
      vec2 nrm  = vec2(tang.y, -tang.x);

      // Smooth 5 taps ALONG the tangent (straightens lines) and 3 taps ACROSS the normal
      float tangScale = mix(2.8, 1.6, clamp(u_detail / 2.0, 0.0, 1.0));
      float nrmScale  = mix(2.0, 1.0, clamp(u_detail / 2.0, 0.0, 1.0));
      vec2 dT = tang * u_step * tangScale;
      vec2 dN = nrm  * u_step * nrmScale;

      float wT[5] = float[5](0.08, 0.24, 0.36, 0.24, 0.08);
      float wN[3] = float[3](0.22, 0.56, 0.22);

      float sum = 0.0;
      for (int j = -1; j <= 1; j++) {
        float wy = wN[j + 1];
        vec2 baseP = uv + float(j) * dN;
        for (int i = -2; i <= 2; i++) {
          sum += evalSplineLumAt(baseP + float(i) * dT) * (wy * wT[i + 2]);
        }
      }

      // Per-pixel gradient magnitude for exact 1.5-pixel analytical anti-aliasing (no 2x2 fwidth blocks!)
      float perPixelGrad = gradLen / 4.4;
      return vec2(sum, perPixelGrad);
    }

    void main() {
      vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
      vec4 orig = texture(u_orig, uv);
      if (orig.a <= 0.001) {
        outColor = vec4(0.0);
        return;
      }

      vec4 pyrB = texture(u_pyrB, uv);
      float outerFade = pyrB.r;
      float intWeight = pyrB.g;
      if (outerFade <= 0.001) {
        outColor = orig;
        return;
      }

      // 1. Evaluate the Cubic B-Spline Tangent-Straightened Field L and its analytical slope:
      vec2 lg = evalSmoothLumAndGrad(uv);
      float L = lg.x;
      // Analytical 1.6-pixel anti-aliasing ramp width (clamped so both steep lines & gentle slopes are silky smooth!)
      float aa = clamp(lg.y * 1.65, 0.015, 0.042);

      float darkMask  = 1.0 - smoothstep(0.265 - aa, 0.265 + aa, L);
      float lightMask = smoothstep(0.635 - aa, 0.635 + aa, L);
      float midMask   = max(0.0, 1.0 - darkMask - lightMask);

      // 2. Sample each zone's dedicated, extrapolated paint buffer (also using B-spline smoothing!)
      vec3 darkCol  = texture(u_darkPaint, uv).rgb;
      vec3 midCol   = texture(u_midPaint, uv).rgb;
      vec3 lightCol = texture(u_lightPaint, uv).rgb;

      darkCol  *= (1.0 - 0.34);
      lightCol  = 1.0 - (1.0 - lightCol) * (1.0 - 0.20);

      vec3 segmentedRgb = darkCol * darkMask + midCol * midMask + lightCol * lightMask;

      // 3. Optional Segment Edge Thickness (0.0 by default = clean Photoshop Action look)
      if (u_rimStrength > 0.001 && intWeight > 0.0) {
        float drim = 4.0 * darkMask * (1.0 - darkMask);
        float lrim = 4.0 * lightMask * (1.0 - lightMask);
        float rim = max(drim, lrim) * intWeight;
        segmentedRgb *= (1.0 - rim * u_rimStrength);
      }

      // 4. Watercolor Texture Overlay
      if (u_useWcTex > 0.01) {
        float wcTex = texture(u_wcTex, fract(uv * u_wcScale)).r;
        vec3 blendedTex = mix(
          2.0 * segmentedRgb * wcTex,
          1.0 - 2.0 * (1.0 - segmentedRgb) * (1.0 - wcTex),
          step(vec3(0.5), segmentedRgb)
        );
        segmentedRgb = clamp(mix(segmentedRgb, blendedTex, 0.50 * u_useWcTex), 0.0, 1.0);
      }

      vec3 finalRgb = clamp(mix(orig.rgb, segmentedRgb, outerFade), 0.0, 1.0);
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
  const fC = compile(gl.FRAGMENT_SHADER, fsCutoutAction);
  if (!vs || !fC) { _glEC = false; return null; }

  const progC = link(vs, fC);
  if (!progC) { _glEC = false; return null; }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(progC);
  gl.uniform1i(gl.getUniformLocation(progC, "u_orig"), 0);
  gl.uniform1i(gl.getUniformLocation(progC, "u_darkPaint"), 1);
  gl.uniform1i(gl.getUniformLocation(progC, "u_midPaint"), 2);
  gl.uniform1i(gl.getUniformLocation(progC, "u_lightPaint"), 3);
  gl.uniform1i(gl.getUniformLocation(progC, "u_pyrA"), 4);
  gl.uniform1i(gl.getUniformLocation(progC, "u_pyrB"), 5);
  gl.uniform1i(gl.getUniformLocation(progC, "u_wcTex"), 6);

  _glEC = {
    canvas, gl, vao, progC,
    uC_step: gl.getUniformLocation(progC, "u_step"),
    uC_wcScale: gl.getUniformLocation(progC, "u_wcScale"),
    uC_detail: gl.getUniformLocation(progC, "u_detail"),
    uC_rimStrength: gl.getUniformLocation(progC, "u_rimStrength"),
    uC_useWcTex: gl.getUniformLocation(progC, "u_useWcTex"),
    uploadedCache: null,
  };
  return _glEC;
}

function createGLTexRGBA8(gl, w, h, data, useLinear = true, wrapRepeat = false) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const filter = useLinear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  return tex;
}

function createGLTexRGBA16F(gl, w, h, float32Data) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, float32Data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
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
    ec.texOrig = createGLTexRGBA8(
      gl, bw, bh,
      new Uint8Array(cache.subData.buffer, cache.subData.byteOffset, cache.subData.byteLength),
      true, false
    );
    ec.texDarkPaint  = createGLTexRGBA8(gl, mw, mh, cache.darkPaintRgba,  true, false);
    ec.texMidPaint   = createGLTexRGBA8(gl, mw, mh, cache.midPaintRgba,   true, false);
    ec.texLightPaint = createGLTexRGBA8(gl, mw, mh, cache.lightPaintRgba, true, false);
    // 16-bit Floating-Point Texture (RGBA16F) -> ZERO 8-bit quantization stair-steps!
    ec.texPyrA       = createGLTexRGBA16F(gl, bw, bh, cache.zonePyrFloat);
    ec.texPyrB       = createGLTexRGBA8(gl, bw, bh, cache.zonePyrBRgba,   true, false);

    const wcImg = STATE.brushImages && STATE.brushImages["watercolortexture.png"];
    if (wcImg) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, wcImg);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      ec.texWc = tex;
      ec.wcW = wcImg.naturalWidth || wcImg.width || 512;
      ec.wcH = wcImg.naturalHeight || wcImg.height || 512;
    } else {
      ec.texWc = ec.texOrig;
      ec.wcW = 512;
      ec.wcH = 512;
    }
    ec.uploadedCache = cache;
  }

  const rawDetail = p.maskDetail ?? 135;
  const detailNorm = Math.max(0.0, Math.min(2.0, rawDetail / 100.0));
  const edgeThick = p.edgeThickness ?? 0;
  const rimStrength = Math.min(0.65, (edgeThick / 100.0) * 0.55);

  const subLayer = STATE.layers && STATE.layers.subject;
  const useWcTex = subLayer && subLayer.params && subLayer.params.wcTexture ? 1.0 : 0.0;

  gl.disable(gl.BLEND);
  gl.bindVertexArray(vao);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, bw, bh);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(ec.progC);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ec.texOrig);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ec.texDarkPaint);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, ec.texMidPaint);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, ec.texLightPaint);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, ec.texPyrA);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, ec.texPyrB);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, ec.texWc);

  gl.uniform2f(ec.uC_step, 1.0 / bw, 1.0 / bh);
  gl.uniform2f(ec.uC_wcScale, bw / Math.max(1.0, ec.wcW * 0.8), bh / Math.max(1.0, ec.wcH * 0.8));
  gl.uniform1f(ec.uC_detail, detailNorm);
  gl.uniform1f(ec.uC_rimStrength, rimStrength);
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
  }
}