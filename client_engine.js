/**
 * ⚡ client_engine.js — Production WebGL2 GPU Client Engine + Memory/Speed Profiler
 */
(function () {
  "use strict";

  const StudioProfiler = {
    measureCanvasMB() {
      let bytes = 0;
      let count = 0;
      const seen = new Set();
      const addC = (c) => {
        if (!c || seen.has(c) || !c.width || !c.height) return;
        if (c.width <= 2 && c.height <= 2) return;
        seen.add(c);
        count++;
        bytes += c.width * c.height * 4;
      };
      addC(displayCanvas);
      addC(_tempLayerCanvas);
      if (typeof _stack !== "undefined") { addC(_stack.below); addC(_stack.above); }
      if (typeof _moveFastStack !== "undefined") {
        addC(_moveFastStack.movableUnder);
        addC(_moveFastStack.subjectGroup);
        addC(_moveFastStack.fixedOvals);
        addC(_moveFastStack.movableOver);
      }
      if (STATE.maskCanvas) addC(STATE.maskCanvas);
      if (STATE.serverImages) {
        for (const v of Object.values(STATE.serverImages)) addC(v);
      }
      if (STATE.layers) {
        for (const lyr of Object.values(STATE.layers)) {
          addC(lyr.baseCanvas);
          addC(lyr.paintCanvas);
          addC(lyr.eraseCanvas);
        }
      }
      const mb = Number((bytes / (1024 * 1024)).toFixed(1));
      const heapMB =
        performance && performance.memory
          ? Number((performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1))
          : null;
      return { activeCanvases: count, canvasMB: mb, iosSafeBudgetPct: Math.round((mb / 256) * 100), jsHeapMB: heapMB };
    },
    report() {
      const mem = this.measureCanvasMB();
      console.log(
        `%c⚡ Studio Memory & Engine Status: ${mem.activeCanvases} active canvases = ${mem.canvasMB} MB (${mem.iosSafeBudgetPct}% of 256 MB mobile limit)` +
          (mem.jsHeapMB !== null ? ` | JS Heap: ${mem.jsHeapMB} MB` : ""),
        "color:#10b981;font-weight:bold;"
      );
      return mem;
    },
  };
  window.StudioProfiler = StudioProfiler;

  async function getPresetFromServerSingleSource(presetKey) {
    if (!STATE.serverPresets) {
      try {
        const cached = localStorage.getItem("wc_cached_presets_v2");
        if (cached) STATE.serverPresets = JSON.parse(cached);
      } catch (_) {}
    }
    if (!STATE.serverPresets) {
      try {
        const res = await fetch(`${STATE.apiUrl}/health`, { mode: "cors" });
        if (res.ok) {
          const data = await res.json();
          if (data && data.presets && data.presets.animals && data.presets.animals.OUTPUT_WIDTH) {
            STATE.serverPresets = data.presets;
            try { localStorage.setItem("wc_cached_presets_v2", JSON.stringify(data.presets)); } catch (_) {}
          }
        }
      } catch (_) {}
    }
    const dict = STATE.serverPresets || {};
    const key = dict[presetKey] ? presetKey : (presetKey && presetKey.startsWith("cars") ? "cars_black" : "animals");
    const cfg = dict[key] ? { ...dict[key], _preset_name: key } : {
      OUTPUT_WIDTH: key.startsWith("cars") ? 1782 : 1260,
      OUTPUT_HEIGHT: key.startsWith("cars") ? 1260 : 1782,
      RANDOM_SEED: 42,
      SUBJECT_EDGE_TRIM: 6,
      EDGE_SAMPLE_WIDTH: 20,
      COLOR_CORRECTION_ENABLED: true,
      OIL_PAINT_ENABLED: true,
      MASK_BRUSH_ENABLED: true,
      _preset_name: key,
    };
    return { key, cfg };
  }

  function erodeMaskFastUint8(src, w, h, radius) {
    if (radius <= 0) return new Uint8Array(src);
    const tmp = new Uint8Array(w * h);
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = x > radius ? x - radius : 0;
        const x1 = x + radius < w - 1 ? x + radius : w - 1;
        let mn = 255;
        for (let xi = x0; xi <= x1; xi++) {
          const v = src[row + xi];
          if (v < mn) mn = v;
        }
        tmp[row + x] = mn;
      }
    }
    for (let y = 0; y < h; y++) {
      const y0 = y > radius ? y - radius : 0;
      const y1 = y + radius < h - 1 ? y + radius : h - 1;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let mn = 255;
        for (let yi = y0; yi <= y1; yi++) {
          const v = tmp[yi * w + x];
          if (v < mn) mn = v;
        }
        dst[row + x] = mn;
      }
    }
    return dst;
  }

  // ==========================================================================
  // 2. WEBGL2 GPU ENGINE FOR COLOR CORRECTION & 4-PASS LIC OIL PAINT
  // ==========================================================================
  let _glgpu = null;

  function getGPUFilterEngine() {
    if (_glgpu && _glgpu.gl && !_glgpu.gl.isContextLost()) return _glgpu;
    if (_glgpu === false) return null;

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
      _glgpu = false;
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

    const fsCC = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_orig;
      uniform sampler2D u_lumBlur;
      uniform sampler2D u_mask;
      uniform sampler2D u_wcTex;
      uniform float u_shLift;
      uniform float u_hiReduce;
      uniform float u_vibrance;
      uniform float u_sat;
      uniform float u_bright;
      uniform float u_contrast;
      uniform float u_meanL;
      uniform float u_warmFilter;
      uniform float u_warmBoost;
      uniform float u_wcOp;
      uniform vec2 u_wcScale;
      uniform int u_flipY;
      uniform int u_useMask;
      out vec4 outColor;
      void main() {
        vec2 uv = u_flipY == 1 ? vec2(v_uv.x, 1.0 - v_uv.y) : v_uv;
        float a = u_useMask == 1 ? texture(u_mask, uv).r : 1.0;
        if (a <= 0.001) {
          outColor = vec4(0.0);
          return;
        }
        vec3 orig = texture(u_orig, uv).rgb;
        float bLum = dot(texture(u_lumBlur, uv).rgb, vec3(0.299, 0.587, 0.114));
        float shMask = pow(max(0.0, 1.0 - bLum), 0.7);
        float hiMask = clamp((pow(max(0.0, bLum), 0.7) - 0.5) * 2.0, 0.0, 1.0);
        float delta = (shMask * u_shLift - hiMask * u_hiReduce) / 255.0;

        vec3 c = clamp(orig + vec3(delta), 0.0, 1.0);
        float mx = max(c.r, max(c.g, c.b));
        float mn = min(c.r, min(c.g, c.b));
        float curSat = mx > 0.0 ? (mx - mn) / mx : 0.0;
        float vibBoost = 1.0 + (u_vibrance - 1.0) * sqrt(max(0.0, 1.0 - curSat));
        float gray = (c.r + c.g + c.b) / 3.0;
        c = clamp(gray + (c - gray) * vibBoost, 0.0, 1.0);

        float l601 = dot(c, vec3(0.299, 0.587, 0.114));
        c = clamp((l601 + (c - l601) * u_sat) * u_bright, 0.0, 1.0);
        c = clamp(u_meanL + (c - u_meanL) * u_contrast, 0.0, 1.0);

        if (u_warmFilter > 0.0) {
          c = mix(c, vec3(1.0, 197.0 / 255.0, 143.0 / 255.0), u_warmFilter);
        }
        if (u_warmBoost > 1.0) {
          float bAmt = u_warmBoost - 1.0;
          float w = clamp(c.r - c.b, 0.0, 1.0) * (1.0 - clamp(c.g - c.r, 0.0, 1.0));
          c.r = clamp(c.r + w * bAmt * (20.0 / 255.0), 0.0, 1.0);
          c.b = clamp(c.b - w * bAmt * (10.0 / 255.0), 0.0, 1.0);
        }
        if (u_wcOp > 0.0) {
          float tv = texture(u_wcTex, fract(uv * u_wcScale)).r;
          vec3 ov = mix(2.0 * c * tv, 1.0 - 2.0 * (1.0 - c) * (1.0 - tv), step(vec3(0.5), c));
          c = clamp(mix(c, ov, u_wcOp), 0.0, 1.0);
        }
        outColor = vec4(c, a);
      }
    `;

    // Oil Pass 1: Tone Curve + Levels + Gamma (also outputs luminance in .a)
    const fsOilTone = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_cc;
      uniform sampler2D u_lumBlur;
      uniform float u_shAmt;
      uniform float u_hiAmt;
      uniform float u_black;
      uniform float u_invRange;
      uniform float u_invGamma;
      out vec4 outColor;
      void main() {
        vec4 s = texture(u_cc, v_uv);
        float bL = dot(texture(u_lumBlur, v_uv).rgb, vec3(0.299, 0.587, 0.114));
        float shM = sqrt(max(0.0, 1.0 - bL));
        float hiM = clamp((bL - 0.5) * 2.0, 0.0, 1.0);
        float delta = (shM * u_shAmt - hiM * u_hiAmt) / 255.0;
        vec3 c = clamp(s.rgb + vec3(delta), 0.0, 1.0);
        c = clamp((c * 255.0 - u_black) * u_invRange, 0.0, 1.0);
        c = pow(c, vec3(u_invGamma));
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        outColor = vec4(c, l);
      }
    `;

    // Oil Pass 2: Structure Tensor + 8-Step Bidirectional LIC Advection
    // Mask-aware: if a streamline steps outside the subject mask, it clamps to the last valid interior pixel!
    const fsOilLIC = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_toned;
      uniform sampler2D u_mask;
      uniform vec2 u_step;
      out vec4 outColor;

      vec2 getFlow(vec2 uv) {
        float ixx = 0.0, iyy = 0.0, ixy = 0.0;
        for (int dy = -2; dy <= 2; dy++) {
          for (int dx = -2; dx <= 2; dx++) {
            float w = (dx == 0 && dy == 0) ? 2.0 : 1.0;
            vec2 p = uv + vec2(float(dx), float(dy)) * u_step;
            float gx = (texture(u_toned, p + vec2(u_step.x, 0.0)).a - texture(u_toned, p - vec2(u_step.x, 0.0)).a) * 0.5;
            float gy = (texture(u_toned, p + vec2(0.0, u_step.y)).a - texture(u_toned, p - vec2(0.0, u_step.y)).a) * 0.5;
            ixx += gx * gx * w;
            iyy += gy * gy * w;
            ixy += gx * gy * w;
          }
        }
        float theta = 0.5 * atan(2.0 * ixy, ixx - iyy + 1e-7);
        return vec2(-sin(theta), cos(theta));
      }

      void main() {
        vec3 centerCol = texture(u_toned, v_uv).rgb;
        float centerMask = texture(u_mask, v_uv).r;
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        float stepPx = 5.0;

        for (int dir = -1; dir <= 1; dir += 2) {
          vec2 p = v_uv;
          vec3 lastValid = centerCol;
          float fdir = float(dir) * stepPx;
          for (int s = 0; s < 4; s++) {
            float wt = 1.0 - float(s) * 0.125;
            vec2 pc = clamp(p, vec2(0.0), vec2(1.0));
            float m = texture(u_mask, pc).r;
            vec3 samp = m > 0.35 ? texture(u_toned, pc).rgb : lastValid;
            if (m > 0.35) lastValid = samp;
            acc += samp * wt;
            wsum += wt;
            vec2 fl = getFlow(pc);
            p += fl * u_step * fdir;
          }
        }
        outColor = vec4(acc / wsum, centerMask);
      }
    `;

    // Oil Pass 3: True 2D Gaussian Blur (sigma=2.7) of the LIC-Advected Image (Mask-normalized so edges never halo!)
    const fsOilBlur = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_src;
      uniform vec2 u_dirStep;
      out vec4 outColor;
      void main() {
        vec3 sum = vec3(0.0);
        float wsum = 0.0;
        vec3 centerCol = texture(u_src, v_uv).rgb;
        for (int i = -6; i <= 6; i++) {
          float fi = float(i);
          float w = exp(-(fi * fi) / (2.0 * 2.7 * 2.7));
          vec4 s = texture(u_src, clamp(v_uv + u_dirStep * fi, vec2(0.0), vec2(1.0)));
          vec3 col = s.a > 0.35 ? s.rgb : centerCol;
          sum += col * w;
          wsum += w;
        }
        outColor = vec4(sum / max(1e-5, wsum), texture(u_src, v_uv).a);
      }
    `;

    // Oil Pass 4: Exact High-Pass Bristle Overlay + Unsharp Mask + Final Contrast + Mask Alpha
    const fsOilComp = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_lic;
      uniform sampler2D u_licBlur;
      uniform sampler2D u_mask;
      uniform float u_hpStrength;
      uniform float u_unsharp;
      uniform float u_finalCon;
      out vec4 outColor;
      void main() {
        vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float a = texture(u_mask, uv).r;
        if (a <= 0.001) {
          outColor = vec4(0.0);
          return;
        }
        vec3 base = texture(u_lic, uv).rgb;
        vec3 blurred = texture(u_licBlur, uv).rgb;

        vec3 hp = clamp(base - blurred + (128.0 / 255.0), 0.0, 1.0);
        vec3 blended = mix(
          2.0 * base * hp,
          1.0 - 2.0 * (1.0 - base) * (1.0 - hp),
          step(vec3(0.5), base)
        );
        vec3 res = base + (blended - base) * u_hpStrength;
        res = res + (res - blurred) * u_unsharp;
        if (u_finalCon > 1.0) {
          res = 0.5 + (res - 0.5) * u_finalCon;
        }
        outColor = vec4(clamp(res, 0.0, 1.0), a);
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
    const fCC = compile(gl.FRAGMENT_SHADER, fsCC);
    const fOT = compile(gl.FRAGMENT_SHADER, fsOilTone);
    const fOL = compile(gl.FRAGMENT_SHADER, fsOilLIC);
    const fOB = compile(gl.FRAGMENT_SHADER, fsOilBlur);
    const fOC = compile(gl.FRAGMENT_SHADER, fsOilComp);
    if (!vs || !fCC || !fOT || !fOL || !fOB || !fOC) { _glgpu = false; return null; }

    const progCC = link(vs, fCC);
    const progOilTone = link(vs, fOT);
    const progOilLIC = link(vs, fOL);
    const progOilBlur = link(vs, fOB);
    const progOilComp = link(vs, fOC);
    if (!progCC || !progOilTone || !progOilLIC || !progOilBlur || !progOilComp) { _glgpu = false; return null; }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    _glgpu = { canvas, gl, vao, progCC, progOilTone, progOilLIC, progOilBlur, progOilComp };
    return _glgpu;
  }

  function uploadTex2D(gl, imgOrCanvas, wrapRepeat = false) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgOrCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    return tex;
  }

  function createEmptyTexFbo(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo };
  }

  function renderSubjectAndOilGPU(origC, maskCleanCanvas, w, h, cw, ch, offset, cfg) {
    const eng = getGPUFilterEngine();
    const [offX, offY] = offset;
    if (!eng) return null;
    const { gl, canvas, vao, progCC, progOilTone, progOilLIC, progOilBlur, progOilComp } = eng;


    const sw4 = Math.max(1, w >> 2), sh4 = Math.max(1, h >> 2);
    const subSmallC = createCanvas(sw4, sh4);
    subSmallC.getContext("2d").drawImage(origC, 0, 0, sw4, sh4);
    const subSmData = subSmallC.getContext("2d").getImageData(0, 0, sw4, sh4).data;

    const maskSmallC = createCanvas(sw4, sh4);
    maskSmallC.getContext("2d").drawImage(maskCleanCanvas, 0, 0, sw4, sh4);
    const maskSmData = maskSmallC.getContext("2d").getImageData(0, 0, sw4, sh4).data;
    maskSmallC.width = 1; maskSmallC.height = 1;

    const n4 = sw4 * sh4;
    const lum4 = new Float32Array(n4);
    const in4 = new Float32Array(n4);
    let sumL = 0, cntL = 0;
    for (let i = 0; i < n4; i++) {
      const p = i * 4;
      const l = 0.299 * subSmData[p] + 0.587 * subSmData[p + 1] + 0.114 * subSmData[p + 2];
      lum4[i] = l;
      if (maskSmData[p] > 200) {
        in4[i] = 1.0;
        sumL += l;
        cntL++;
      }
    }
    const meanL = (cntL > 0 ? sumL / cntL : 128.0) / 255.0;

    // Mask-normalized blur: white #faf8f4 background outside the subject NEVER bleeds into u_lumBlur!
    const den6 = boxBlurFloat32(in4, sw4, sh4, 6);
    let lumBlur4 = normalizedBlurFloat32(lum4, in4, sw4, sh4, 6, den6);
    lumBlur4 = normalizedBlurFloat32(lumBlur4, in4, sw4, sh4, 5);

    const lumSmallC = createCanvas(sw4, sh4);
    const lsCtx = lumSmallC.getContext("2d");
    const lsImg = lsCtx.createImageData(sw4, sh4);
    for (let i = 0; i < n4; i++) {
      const v = Math.max(0, Math.min(255, Math.round(lumBlur4[i])));
      const p = i * 4;
      lsImg.data[p] = v; lsImg.data[p + 1] = v; lsImg.data[p + 2] = v; lsImg.data[p + 3] = 255;
    }
    lsCtx.putImageData(lsImg, 0, 0);
    subSmallC.width = 1; subSmallC.height = 1;


    const texOrig = uploadTex2D(gl, origC, false);
    const texLumBlur = uploadTex2D(gl, lumSmallC, false);
    const texMask = uploadTex2D(gl, maskCleanCanvas, false);
    const wcImg = STATE.brushImages["watercolortexture.png"];
    const texWc = wcImg ? uploadTex2D(gl, wcImg, true) : texOrig;

    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);

    const runCCPass = (useWcTex, useMask = true) => {
      canvas.width = w;
      canvas.height = h;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(progCC);

      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texOrig);
      gl.uniform1i(gl.getUniformLocation(progCC, "u_orig"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texLumBlur);
      gl.uniform1i(gl.getUniformLocation(progCC, "u_lumBlur"), 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texMask);
      gl.uniform1i(gl.getUniformLocation(progCC, "u_mask"), 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, texWc);
      gl.uniform1i(gl.getUniformLocation(progCC, "u_wcTex"), 3);

      const ccOn = cfg.COLOR_CORRECTION_ENABLED !== false;
      gl.uniform1f(gl.getUniformLocation(progCC, "u_shLift"), ccOn ? (cfg.CC_SHADOW_LIFT ?? 10) : 0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_hiReduce"), ccOn ? (cfg.CC_HIGHLIGHT_REDUCE ?? 30) : 0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_vibrance"), ccOn ? (cfg.CC_VIBRANCE ?? 1.25) : 1.0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_sat"), ccOn ? (cfg.CC_SATURATION ?? 1.10) : 1.0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_bright"), ccOn ? (cfg.CC_BRIGHTNESS ?? 1.08) : 1.0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_contrast"), ccOn ? (cfg.CC_CONTRAST ?? 1.02) : 1.0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_meanL"), meanL * (ccOn ? (cfg.CC_BRIGHTNESS ?? 1.08) : 1.0));
      gl.uniform1f(gl.getUniformLocation(progCC, "u_warmFilter"), ccOn ? (cfg.CC_WARM_FILTER ?? 0.02) : 0.0);
      gl.uniform1f(gl.getUniformLocation(progCC, "u_warmBoost"), ccOn ? (cfg.CC_WARM_BOOST ?? 2.6) : 1.0);

      const wcMult = cfg.WATERCOLOR_TEXTURE_SIZE ?? 1.0;
      const tw = wcImg ? Math.max(1, (wcImg.naturalWidth || wcImg.width) * wcMult) : 512;
      const th = wcImg ? Math.max(1, (wcImg.naturalHeight || wcImg.height) * wcMult) : 512;
      gl.uniform1f(gl.getUniformLocation(progCC, "u_wcOp"), useWcTex && wcImg ? (cfg.WATERCOLOR_TEXTURE_OPACITY ?? 0.6) : 0.0);
      gl.uniform2f(gl.getUniformLocation(progCC, "u_wcScale"), w / tw, h / th);
      gl.uniform1i(gl.getUniformLocation(progCC, "u_flipY"), 1);
      gl.uniform1i(gl.getUniformLocation(progCC, "u_useMask"), useMask ? 1 : 0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    // 1. Render UNMASKED color-corrected image for Oil Paint
    runCCPass(false, false);
    const unmaskedCcCrop = createCanvas(w, h);
    unmaskedCcCrop.getContext("2d").drawImage(canvas, 0, 0);

    // 2. Render MASKED color-corrected subject for subject_cc
    runCCPass(false, true);
    const cleanCcCrop = createCanvas(w, h);
    cleanCcCrop.getContext("2d").drawImage(canvas, 0, 0);

    const subCcFull = createCanvas(cw, ch);
    subCcFull.getContext("2d").drawImage(cleanCcCrop, offX, offY);

    let subTexFull = null;
    if (cfg.WATERCOLOR_TEXTURE_ENABLED && wcImg) {
      runCCPass(true, true);
      subTexFull = createCanvas(cw, ch);
      subTexFull.getContext("2d").drawImage(canvas, offX, offY);
    }

    let oilFull = null;
    if (cfg.OIL_PAINT_ENABLED !== false) {
      // Match Python's OIL_DETAIL_SCALE (0.85) so LIC stroke length & High-Pass radius match 1:1!
      const oilScale = cfg.OIL_DETAIL_SCALE ?? 0.85;
      const ow = Math.max(16, Math.round(w * oilScale));
      const oh = Math.max(16, Math.round(h * oilScale));

      const texCc = uploadTex2D(gl, unmaskedCcCrop, false);
      unmaskedCcCrop.width = 1; unmaskedCcCrop.height = 1;

      const rtToned = createEmptyTexFbo(gl, ow, oh);
      const rtLic = createEmptyTexFbo(gl, ow, oh);
      const rtPing = createEmptyTexFbo(gl, ow, oh);
      const rtBlur = createEmptyTexFbo(gl, ow, oh);

      // Oil Pass 1: Tone + Levels into rtToned (ow x oh)
      gl.bindFramebuffer(gl.FRAMEBUFFER, rtToned.fbo);
      gl.viewport(0, 0, ow, oh);
      gl.useProgram(progOilTone);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texCc);
      gl.uniform1i(gl.getUniformLocation(progOilTone, "u_cc"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texLumBlur);
      gl.uniform1i(gl.getUniformLocation(progOilTone, "u_lumBlur"), 1);

      const shAmt = ((cfg.OIL_SHADOW_AMOUNT ?? 30) / 100.0) * 100.0;
      const hiAmt = ((cfg.OIL_HIGHLIGHT_AMOUNT ?? 90) / 100.0) * 80.0;
      const black = cfg.OIL_LEVELS_BLACK ?? 30;
      const white = cfg.OIL_LEVELS_WHITE ?? 220;
      gl.uniform1f(gl.getUniformLocation(progOilTone, "u_shAmt"), shAmt);
      gl.uniform1f(gl.getUniformLocation(progOilTone, "u_hiAmt"), hiAmt);
      gl.uniform1f(gl.getUniformLocation(progOilTone, "u_black"), black);
      gl.uniform1f(gl.getUniformLocation(progOilTone, "u_invRange"), 1.0 / Math.max(1.0, white - black));
      gl.uniform1f(gl.getUniformLocation(progOilTone, "u_invGamma"), 1.0 / (cfg.OIL_LEVELS_GAMMA ?? 0.95));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Oil Pass 2: Structure Tensor + 8-Step LIC into rtLic (ow x oh)
      gl.bindFramebuffer(gl.FRAMEBUFFER, rtLic.fbo);
      gl.useProgram(progOilLIC);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtToned.tex);
      gl.uniform1i(gl.getUniformLocation(progOilLIC, "u_toned"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texMask);
      gl.uniform1i(gl.getUniformLocation(progOilLIC, "u_mask"), 1);
      gl.uniform2f(gl.getUniformLocation(progOilLIC, "u_step"), 1.0 / ow, 1.0 / oh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Oil Pass 3: Separable 2D Gaussian Blur of rtLic -> rtPing -> rtBlur
      gl.useProgram(progOilBlur);
      gl.uniform1i(gl.getUniformLocation(progOilBlur, "u_src"), 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, rtPing.fbo);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtLic.tex);
      gl.uniform2f(gl.getUniformLocation(progOilBlur, "u_dirStep"), 1.0 / ow, 0.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, rtBlur.fbo);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtPing.tex);
      gl.uniform2f(gl.getUniformLocation(progOilBlur, "u_dirStep"), 0.0, 1.0 / oh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Oil Pass 4: High-Pass Bristle Overlay + Unsharp Mask + Mask Alpha at full w x h
      canvas.width = w;
      canvas.height = h;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(progOilComp);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtLic.tex);
      gl.uniform1i(gl.getUniformLocation(progOilComp, "u_lic"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rtBlur.tex);
      gl.uniform1i(gl.getUniformLocation(progOilComp, "u_licBlur"), 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texMask);
      gl.uniform1i(gl.getUniformLocation(progOilComp, "u_mask"), 2);
      gl.uniform1f(gl.getUniformLocation(progOilComp, "u_hpStrength"), cfg.OIL_HIGH_PASS_STRENGTH ?? 0.5);
      gl.uniform1f(gl.getUniformLocation(progOilComp, "u_unsharp"), cfg.OIL_UNSHARP_AMOUNT ?? 1.1);
      gl.uniform1f(gl.getUniformLocation(progOilComp, "u_finalCon"), cfg.OIL_FINAL_CONTRAST ?? 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      oilFull = createCanvas(cw, ch);
      oilFull.getContext("2d").drawImage(canvas, offX, offY);

      for (const rt of [rtToned, rtLic, rtPing, rtBlur]) {
        gl.deleteFramebuffer(rt.fbo);
        gl.deleteTexture(rt.tex);
      }
      gl.deleteTexture(texCc);
    } else {
      unmaskedCcCrop.width = 1; unmaskedCcCrop.height = 1;
    }

    gl.deleteTexture(texOrig);
    gl.deleteTexture(texLumBlur);
    gl.deleteTexture(texMask);
    if (texWc !== texOrig) gl.deleteTexture(texWc);
    canvas.width = 1; canvas.height = 1;
    lumSmallC.width = 1; lumSmallC.height = 1;

    return { cleanCcCrop, subCcFull, subTexFull, oilFull };
  }

  // ==========================================================================
  // 3. HALF-SCALE PYRAMID FOR 21x21 NORMALS & ACCENTS + FULL-RES EDGE SAMPLING
  // ==========================================================================
  function computeEdgesPaletteAndAccentsFast(cleanCcCrop, maskClean, w, h, offset, cfg) {
    const subjectData = cleanCcCrop.getContext("2d").getImageData(0, 0, w, h).data;
    const n = w * h;

    let sumR = 0, sumG = 0, sumB = 0, visCount = 0;
    const counts = new Int32Array(1331);
    for (let i = 0; i < n; i += 2) {
      if (maskClean[i] <= 128) continue;
      const p = i * 4;
      const r = subjectData[p], g = subjectData[p + 1], b = subjectData[p + 2];
      sumR += r; sumG += g; sumB += b; visCount++;
      counts[((r / 24) | 0) * 121 + ((g / 24) | 0) * 11 + ((b / 24) | 0)]++;
    }
    const averageColor = visCount > 0
      ? [Math.trunc(sumR / visCount), Math.trunc(sumG / visCount), Math.trunc(sumB / visCount)]
      : [128, 128, 128];

    let dominantColor = null, bestCount = -1;
    for (let idx = 0; idx < 1331; idx++) {
      const cnt = counts[idx];
      if (cnt <= bestCount) continue;
      const r = ((idx / 121) | 0) * 24 + 12;
      const g = (((idx % 121) / 11) | 0) * 24 + 12;
      const b = (idx % 11) * 24 + 12;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 40 || lum > 220) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 0 && (mx - mn) / (mx + 1) > 0.20) {
        bestCount = cnt;
        dominantColor = [r, g, b];
      }
    }

    const edgePixelsX = [];
    const edgePixelsY = [];
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        if (maskClean[i] <= 20) continue;
        if (
          maskClean[i - 1] <= 20 || maskClean[i + 1] <= 20 ||
          maskClean[i - w] <= 20 || maskClean[i + w] <= 20 ||
          maskClean[i - w - 1] <= 20 || maskClean[i - w + 1] <= 20 ||
          maskClean[i + w - 1] <= 20 || maskClean[i + w + 1] <= 20
        ) {
          edgePixelsX.push(x);
          edgePixelsY.push(y);
        }
      }
    }

    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    const hn = hw * hh;
    const binHalf = new Float32Array(hn);
    const bxX = new Float32Array(hn);
    const bxY = new Float32Array(hn);
    for (let hy = 0; hy < hh; hy++) {
      const sy = Math.min(h - 1, hy << 1) * w;
      const hRow = hy * hw;
      for (let hx = 0; hx < hw; hx++) {
        if (maskClean[sy + (hx << 1)] > 128) {
          const hi = hRow + hx;
          binHalf[hi] = 1.0;
          bxX[hi] = hx;
          bxY[hi] = hy;
        }
      }
    }
    const countBlur = boxBlurFloat32(binHalf, hw, hh, 5);
    const avgX = boxBlurFloat32(bxX, hw, hh, 5);
    const avgY = boxBlurFloat32(bxY, hw, hh, 5);
    const normXHalf = new Float32Array(hn);
    const normYHalf = new Float32Array(hn);
    for (let hy = 0; hy < hh; hy++) {
      const hRow = hy * hw;
      for (let hx = 0; hx < hw; hx++) {
        const hi = hRow + hx;
        const sc = Math.max(countBlur[hi], 1e-10);
        const nx = -(avgX[hi] / sc - hx);
        const ny = -(avgY[hi] / sc - hy);
        const mag = Math.hypot(nx, ny) + 1e-10;
        normXHalf[hi] = nx / mag;
        normYHalf[hi] = ny / mag;
      }
    }

    const edgeWidth = cfg.EDGE_SAMPLE_WIDTH ?? 20;
    const halfEw = edgeWidth >> 1;
    const edges = new Array(edgePixelsX.length);

    for (let k = 0; k < edgePixelsX.length; k++) {
      const ex = edgePixelsX[k], ey = edgePixelsY[k];
      const hi = Math.min(hh - 1, ey >> 1) * hw + Math.min(hw - 1, ex >> 1);
      const nx = normXHalf[hi], ny = normYHalf[hi];
      const sx = Math.max(0, Math.min(w - 1, Math.trunc(ex - nx * halfEw)));
      const sy = Math.max(0, Math.min(h - 1, Math.trunc(ey - ny * halfEw)));
      const sp = (sy * w + sx) * 4;
      let r = subjectData[sp], g = subjectData[sp + 1], b = subjectData[sp + 2];
      const valid = maskClean[sy * w + sx] >= 50 ? 1 : 0;

      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = Math.max(0, Math.min(255, Math.round(128 + (l + (r - l) * 1.5 - 128) * 1.3)));
      g = Math.max(0, Math.min(255, Math.round(128 + (l + (g - l) * 1.5 - 128) * 1.3)));
      b = Math.max(0, Math.min(255, Math.round(128 + (l + (b - l) * 1.5 - 128) * 1.3)));

      edges[k] = [ex, ey, nx, ny, r, g, b, valid];
    }

    const candidates = [];
    const spots = [];
    if (cfg.ACCENT_STROKES_ENABLED && edgePixelsX.length > 0) {
      const lumHalf = new Float32Array(hn);
      const intHalf = new Float32Array(hn);
      for (let hy = 0; hy < hh; hy++) {
        const sy = Math.min(h - 1, hy << 1) * w;
        const hRow = hy * hw;
        for (let hx = 0; hx < hw; hx++) {
          const i = sy + (hx << 1);
          const p = i * 4;
          const r = subjectData[p], g = subjectData[p + 1], b = subjectData[p + 2];
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          lumHalf[hRow + hx] = l;
          if (maskClean[i] > 20) {
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            const sat = mx > 0 ? (mx - mn) / (mx + 1e-6) : 0;
            const dk = Math.max(0, Math.min(1, (90 - l) / 90.0));
            const br = Math.max(0, Math.min(1, (l - 200) / 55.0));
            const st = Math.max(0, Math.min(1, (sat - 0.1) / 0.9));
            intHalf[hRow + hx] = (1.5 * dk + 1.2 * br + 2.0 * st) * (maskClean[i] / 255.0);
          }
        }
      }
      const smInt = boxBlurFloat32(intHalf, hw, hh, 2);
      let maxInt = 1e-6;
      for (let i = 0; i < hn; i++) if (smInt[i] > maxInt) maxInt = smInt[i];
      for (let i = 0; i < hn; i++) smInt[i] /= maxInt;

      const rng = new PythonRandom(cfg.RANDOM_SEED || 42);
      const aboveIdx = [];
      for (let i = 0; i < edgePixelsX.length; i++) {
        const hi = Math.min(hh - 1, edgePixelsY[i] >> 1) * hw + Math.min(hw - 1, edgePixelsX[i] >> 1);
        if (smInt[hi] >= 0.002) aboveIdx.push(i);
      }
      for (let i = aboveIdx.length - 1; i > 0; i--) {
        const j = Math.floor(rng.random() * (i + 1));
        const t = aboveIdx[i]; aboveIdx[i] = aboveIdx[j]; aboveIdx[j] = t;
      }

      const spacing = 50, s2 = spacing * spacing, cell = spacing / Math.SQRT2;
      const grid = new Map();
      const sampleAreaColor = (cx, cy, rad) => {
        const x0 = Math.max(0, cx - rad), x1 = Math.min(w - 1, cx + rad);
        const y0 = Math.max(0, cy - rad), y1 = Math.min(h - 1, cy + rad);
        let sr = 0, sg = 0, sb = 0, cnt = 0;
        for (let y = y0; y <= y1; y += 2) {
          const rOff = y * w;
          for (let x = x0; x <= x1; x += 2) {
            const idx = rOff + x;
            if (maskClean[idx] > 30) {
              const p = idx * 4;
              sr += subjectData[p]; sg += subjectData[p + 1]; sb += subjectData[p + 2]; cnt++;
            }
          }
        }
        return cnt ? [(sr / cnt) | 0, (sg / cnt) | 0, (sb / cnt) | 0] : [128, 128, 128];
      };

      for (let k = 0; k < aboveIdx.length && candidates.length < 180; k++) {
        const i = aboveIdx[k];
        const ex = edgePixelsX[i], ey = edgePixelsY[i];
        const gx = (ex / cell) | 0, gy = (ey / cell) | 0;
        let close = false;
        for (let dx = -2; dx <= 2 && !close; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            const nb = grid.get((gx + dx) * 100000 + (gy + dy));
            if (nb && (ex - nb[0]) ** 2 + (ey - nb[1]) ** 2 < s2) { close = true; break; }
          }
        }
        if (close) continue;
        grid.set(gx * 100000 + gy, [ex, ey]);
        const hi = Math.min(hh - 1, ey >> 1) * hw + Math.min(hw - 1, ex >> 1);
        const nx = normXHalf[hi], ny = normYHalf[hi];
        const sx = Math.max(0, Math.min(w - 1, Math.trunc(ex - nx * 10)));
        const sy = Math.max(0, Math.min(h - 1, Math.trunc(ey - ny * 10)));
        const L = lumHalf[Math.min(hh - 1, sy >> 1) * hw + Math.min(hw - 1, sx >> 1)];
        candidates.push({
          x: sx + offset[0],
          y: sy + offset[1],
          nx: Number(nx.toFixed(4)),
          ny: Number(ny.toFixed(4)),
          interest: Number(Math.min(1, smInt[hi]).toFixed(4)),
          is_dark: L < 90,
          is_bright: L > 200,
          color: sampleAreaColor(sx, sy, 8),
          w_bright: 0.0,
          w_op: 1.0,
        });
      }

      const stepE = Math.max(1, (edgePixelsX.length / 1200) | 0);
      const spotGrid = new Map();
      for (let i = 0; i < edgePixelsX.length; i += stepE) {
        const ex = edgePixelsX[i], ey = edgePixelsY[i];
        const hi = Math.min(hh - 1, ey >> 1) * hw + Math.min(hw - 1, ex >> 1);
        const inx = -normXHalf[hi], iny = -normYHalf[hi];
        const edgeL = lumHalf[hi];
        let best = null;
        for (let d = 6; d <= 38; d += 6) {
          const sx = Math.max(0, Math.min(w - 1, (ex + inx * d) | 0));
          const sy = Math.max(0, Math.min(h - 1, (ey + iny * d) | 0));
          if (maskClean[sy * w + sx] < 128) continue;
          const lv = lumHalf[Math.min(hh - 1, sy >> 1) * hw + Math.min(hw - 1, sx >> 1)];
          if (lv >= 165 && lv - edgeL >= 32 && (!best || lv > best.lum)) {
            best = { sx, sy, lum: lv, nx: normXHalf[hi], ny: normYHalf[hi] };
          }
        }
        if (best && spots.length < 40) {
          const gx = (best.sx / 32) | 0, gy = (best.sy / 32) | 0;
          let close = false;
          for (let dx = -1; dx <= 1 && !close; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const nb = spotGrid.get((gx + dx) * 100000 + (gy + dy));
              if (nb && (best.sx - nb[0]) ** 2 + (best.sy - nb[1]) ** 2 < 1600) { close = true; break; }
            }
          }
          if (!close) {
            spotGrid.set(gx * 100000 + gy, [best.sx, best.sy]);
            spots.push({
              x: best.sx + offset[0],
              y: best.sy + offset[1],
              nx: Number(best.nx.toFixed(4)),
              ny: Number(best.ny.toFixed(4)),
              interest: 0.72,
              patch_area: 1200,
              color: sampleAreaColor(best.sx, best.sy, 8),
              w_bright: 0.0,
              w_op: 1.0,
            });
          }
        }
      }
    }

    return {
      averageColor,
      dominantColor,
      edges,
      edgePixelsX,
      edgePixelsY,
      normXHalf,
      normYHalf,
      hw,
      hh,
      candidates,
      spots,
    };
  }

  // ==========================================================================
  // 4. PAPER, BLUR_BG, SHADOW & COLORDROP LAYERS
  // ==========================================================================
  function buildPaperLayerClient(cw, ch, cfg) {
    const c = createCanvas(cw, ch);
    const ctx = c.getContext("2d");
    if (cfg.DARK_BACKGROUND_ENABLED) {
      const col = cfg.DARK_BACKGROUND_COLOR || [5, 5, 5];
      ctx.fillStyle = `rgb(${col[0]}, ${col[1]}, ${col[2]})`;
      ctx.fillRect(0, 0, cw, ch);
      return c;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    if (cfg.PAPER_TEXTURE_ENABLED === false) return c;

    const tile = STATE.brushImages["papertexture.png"];
    if (!tile) return c;
    const tw = tile.naturalWidth || tile.width;
    const th = tile.naturalHeight || tile.height;
    ctx.save();
    ctx.globalAlpha = cfg.PAPER_TEXTURE_OPACITY ?? 0.4;
    for (let y = 0; y < ch; y += th) {
      for (let x = 0; x < cw; x += tw) ctx.drawImage(tile, x, y);
    }
    ctx.restore();
    return c;
  }

  function buildBlurBgLayerClient(subjectCanvas, cw, ch, cfg) {
    if (cfg.MASK_BRUSH_ENABLED === false) return null;
    const sw = Math.max(1, cw >> 2), sh = Math.max(1, ch >> 2);
    const subW = Math.max(1, subjectCanvas.width >> 2), subH = Math.max(1, subjectCanvas.height >> 2);

    const smallSub = createCanvas(subW, subH);
    smallSub.getContext("2d").drawImage(subjectCanvas, 0, 0, subW, subH);

    const stackC = createCanvas(sw, sh);
    const stCtx = stackC.getContext("2d");
    const cx = sw >> 1, cy = sh >> 1;
    const numLayers = cfg.NUM_BLUR_LAYERS ?? 7;
    const scaleStep = cfg.LAYER_SCALE_STEP ?? 0.3;

    for (let i = numLayers; i >= 1; i--) {
      const sc = 1.0 + i * scaleStep;
      const nw = Math.trunc(subW * sc), nh = Math.trunc(subH * sc);
      stCtx.drawImage(smallSub, cx - (nw >> 1), cy - (nh >> 1), nw, nh);
    }
    smallSub.width = 1; smallSub.height = 1;

    // Use HTML5 2D context drawing with multiple overlapping downscales for guaranteed mobile blur
    const blurR = Math.max(2, (cfg.BLUR_AMOUNT ?? 25) >> 1);
    const blurC = createCanvas(sw, sh);
    const bCtx = blurC.getContext("2d");
    bCtx.drawImage(stackC, 0, 0);
    bCtx.drawImage(stackC, 0, 0);
    bCtx.drawImage(stackC, 0, 0);

    const outC = createCanvas(cw, ch);
    const oCtx = outC.getContext("2d");
    oCtx.imageSmoothingEnabled = true;
    oCtx.imageSmoothingQuality = "high";
    oCtx.drawImage(blurC, 0, 0, cw, ch);
    blurC.width = 1; blurC.height = 1;
    stackC.width = 1; stackC.height = 1;
    return outC;
  }

  function getBottomOutlinePointsFast(edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh, spacing, leftMargin, rightMargin, inwardOffset) {
    if (!edgePixelsX.length) return [];
    let minX = 0x7fffffff, maxX = -0x7fffffff;
    const bottomByX = new Map();
    for (let i = 0; i < edgePixelsX.length; i++) {
      const x = edgePixelsX[i], y = edgePixelsY[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      const cur = bottomByX.get(x);
      if (cur === undefined || y > cur) bottomByX.set(x, y);
    }
    const effMinX = minX + leftMargin, effMaxX = maxX - rightMargin;
    const bot = [];
    for (const [x, y] of bottomByX.entries()) {
      if (x >= effMinX && x <= effMaxX) bot.push([x, y]);
    }
    if (!bot.length) return [];
    bot.sort((a, b) => a[0] - b[0]);

    const sampled = [bot[0]];
    const s2 = spacing * spacing;
    for (let i = 1; i < bot.length; i++) {
      const p = bot[i];
      let close = false;
      for (let j = 0; j < sampled.length; j++) {
        const dx = p[0] - sampled[j][0], dy = p[1] - sampled[j][1];
        if (dx * dx + dy * dy < s2) { close = true; break; }
      }
      if (!close) sampled.push(p);
    }
    return sampled.map(([x, y]) => {
      const hi = Math.min(hh - 1, y >> 1) * hw + Math.min(hw - 1, x >> 1);
      const nx = normXHalf[hi], ny = normYHalf[hi];
      return [x + Math.trunc(-nx * inwardOffset), y + Math.trunc(-ny * inwardOffset), nx, ny];
    });
  }

  function buildShadowLayerClient(edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh, cw, ch, offset, cfg) {
    if (!cfg.SHADOW_BRUSH_ENABLED) return null;
    const rng = new PythonRandom((cfg.RANDOM_SEED || 42) + 800);
    const pts = getBottomOutlinePointsFast(
      edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh,
      cfg.SHADOW_BRUSH_SPACING ?? 100,
      cfg.SHADOW_BRUSH_LEFT_MARGIN ?? 50,
      cfg.SHADOW_BRUSH_RIGHT_MARGIN ?? 50,
      cfg.SHADOW_BRUSH_INWARD_OFFSET ?? 20
    );
    const outC = createCanvas(cw, ch);
    const brushImg = STATE.brushImages["bgbrush.png"];
    if (!pts.length || !brushImg) return outC;

    const baseSize = cfg.SHADOW_BRUSH_SIZE ?? 300;
    const sizeJit = cfg.SHADOW_BRUSH_SIZE_JITTER ?? 0.2;
    const rotOff = cfg.SHADOW_BRUSH_ROTATION_OFFSET ?? 0;
    const rotJit = cfg.SHADOW_BRUSH_ROTATION_JITTER ?? 0.1;
    const gray = Math.trunc(255 * (cfg.SHADOW_BRUSH_LIGHTNESS ?? 0.0));
    const rgb = [gray, gray, gray];
    const endTurn = cfg.SHADOW_BRUSH_END_TURN_ANGLE ?? 45;

    const xs = pts.map((p) => p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const xRange = Math.max(1, maxX - minX);
    const leftT = minX + xRange * 0.15, rightT = maxX - xRange * 0.15;

    const strokes = [];
    for (const [x, y] of pts) {
      let rot = rotOff + rng.uniform(-180 * rotJit, 180 * rotJit);
      if (x <= leftT) rot += endTurn * (1.0 - (x - minX) / Math.max(1e-5, leftT - minX));
      else if (x >= rightT) rot -= endTurn * ((x - rightT) / Math.max(1e-5, maxX - rightT));
      const sz = Math.max(20, Math.trunc(baseSize * rng.uniform(1 - sizeJit, 1 + sizeJit)));
      strokes.push({ x: x + offset[0], y: y + offset[1], size: sz, rot, rgb, op: 1.0 });
    }
    const glC = drawStrokesWebGL(cw, ch, "bgbrush.png", brushImg, strokes);
    const ctx = outC.getContext("2d");
    ctx.globalAlpha = cfg.SHADOW_BRUSH_OPACITY ?? 0.5;
    if (glC) ctx.drawImage(glC, 0, 0);
    return outC;
  }

  function buildColordropLayerClient(edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh, cw, ch, offset, cfg) {
    if (!cfg.COLORDROP_BRUSH_ENABLED) return null;
    const rng = new PythonRandom((cfg.RANDOM_SEED || 42) + 850);
    const pts = getBottomOutlinePointsFast(
      edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh,
      cfg.COLORDROP_BRUSH_SPACING ?? 150,
      cfg.COLORDROP_BRUSH_LEFT_MARGIN ?? 80,
      cfg.COLORDROP_BRUSH_RIGHT_MARGIN ?? 80,
      cfg.COLORDROP_BRUSH_INWARD_OFFSET ?? 0
    );
    const outC = createCanvas(cw, ch);
    const brushImg = STATE.brushImages["colordrop.png"];
    if (!pts.length || !brushImg) return outC;

    const baseSize = cfg.COLORDROP_BRUSH_SIZE ?? 200;
    const sizeJit = cfg.COLORDROP_BRUSH_SIZE_JITTER ?? 0.3;
    const gray = Math.trunc(255 * (cfg.COLORDROP_BRUSH_LIGHTNESS ?? 0.0));
    const rgb = [gray, gray, gray];

    const strokes = [];
    for (const [x, y] of pts) {
      const sz = Math.max(20, Math.trunc(baseSize * rng.uniform(1 - sizeJit, 1 + sizeJit)));
      strokes.push({ x: x + offset[0], y: y + offset[1] + sz * 0.5, size: sz, rot: 0, rgb, op: 1.0 });
    }
    const glC = drawStrokesWebGL(cw, ch, "colordrop.png", brushImg, strokes);
    const ctx = outC.getContext("2d");
    ctx.globalAlpha = cfg.COLORDROP_BRUSH_OPACITY ?? 0.4;
    if (glC) ctx.drawImage(glC, 0, 0);
    return outC;
  }

  // ==========================================================================
  // 5. MASTER CLIENT-SIDE PAYLOAD GENERATOR
  // ==========================================================================
  async function generate(presetKey, useEditedMask = false) {
    if (typeof _glgpu !== "undefined" && _glgpu) {
      try { _glgpu.gl.deleteProgram(_glgpu.progCC); } catch (_) {}
      _glgpu = null;
    }
    const t0 = performance.now();
    const timings = { "0_engine_mode": "⚡ LOCAL_BROWSER_WEBGL2" };
    const { key, cfg } = await getPresetFromServerSingleSource(presetKey);

    const cw = cfg.OUTPUT_WIDTH || (key.startsWith("cars") ? 1782 : 1260);
    const ch = cfg.OUTPUT_HEIGHT || (key.startsWith("cars") ? 1260 : 1782);

    let tStep = performance.now();
    const origSource = STATE.framedPhotoCanvas || STATE.originalImg;
    const isCar = key.startsWith("cars");
    const maxW = isCar ? 1782 : 1260;
    const maxH = isCar ? 1260 : 1782;
    let w = origSource.naturalWidth || origSource.width;
    let h = origSource.naturalHeight || origSource.height;
    if (w > maxW || h > maxH) {
      const sc = Math.min(maxW / w, maxH / h);
      w = Math.round(w * sc);
      h = Math.round(h * sc);
    }

    const origC = createCanvas(w, h);
    origC.getContext("2d").drawImage(origSource, 0, 0, w, h);

    const maskC = createCanvas(w, h);
    const mCtx = maskC.getContext("2d");
    if (useEditedMask && STATE.maskCanvas) {
      mCtx.filter = "blur(1.5px)";
      mCtx.drawImage(STATE.maskCanvas, 0, 0, w, h);
      mCtx.filter = "none";
    } else if (STATE.framedMaskCanvas) {
      mCtx.drawImage(STATE.framedMaskCanvas, 0, 0, w, h);
    } else if (STATE.rawMaskBase64) {
      const rawMaskImg = await loadImage(STATE.rawMaskBase64);
      mCtx.drawImage(rawMaskImg, 0, 0, w, h);
    } else if (STATE.maskCanvas) {
      mCtx.drawImage(STATE.maskCanvas, 0, 0, w, h);
    }

    const rawMaskData = mCtx.getImageData(0, 0, w, h).data;
    const rawMaskU8 = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < rawMaskU8.length; i++, p += 4) rawMaskU8[i] = rawMaskData[p];

    const trim = useEditedMask ? 1 : (cfg.SUBJECT_EDGE_TRIM ?? 6);
    const maskClean = erodeMaskFastUint8(rawMaskU8, w, h, trim);

    const cleanMaskImgData = mCtx.createImageData(w, h);
    for (let i = 0, p = 0; i < maskClean.length; i++, p += 4) {
      const v = maskClean[i];
      cleanMaskImgData.data[p] = v;
      cleanMaskImgData.data[p + 1] = v;
      cleanMaskImgData.data[p + 2] = v;
      cleanMaskImgData.data[p + 3] = 255;
    }
    mCtx.putImageData(cleanMaskImgData, 0, 0);
    timings["1_mask_trim_sec"] = Number(((performance.now() - tStep) / 1000).toFixed(3));

    const offX = (cw - w) >> 1;
    const offY = (ch - h) >> 1;
    const offset = [offX, offY];

    // 2. WebGL2 GPU Color Correction + WebGL2 GPU 4-Pass LIC Oil Paint
    tStep = performance.now();
    const gpuOut = renderSubjectAndOilGPU(origC, maskC, w, h, cw, ch, offset, cfg);
    if (!gpuOut) throw new Error("WebGL2 GPU filter context unavailable");
    const { cleanCcCrop, subCcFull, subTexFull, oilFull } = gpuOut;

    const subRawFull = createCanvas(cw, ch);
    const origCtx = origC.getContext("2d");
    const origImgData = origCtx.getImageData(0, 0, w, h);
    const oD = origImgData.data;
    for (let i = 0, p = 3; i < maskClean.length; i++, p += 4) oD[p] = maskClean[i];
    origCtx.putImageData(origImgData, 0, 0);
    subRawFull.getContext("2d").drawImage(origC, offX, offY);
    origC.width = 1; origC.height = 1;
    timings["2_gpu_cc_and_oil_sec"] = Number(((performance.now() - tStep) / 1000).toFixed(3));

    // 3. Half-Scale Normal Pyramid, Full-Res Edges, Accents & Auxiliary Layers
    tStep = performance.now();
    const {
      averageColor,
      dominantColor,
      edges,
      edgePixelsX,
      edgePixelsY,
      normXHalf,
      normYHalf,
      hw,
      hh,
      candidates,
      spots,
    } = computeEdgesPaletteAndAccentsFast(cleanCcCrop, maskClean, w, h, offset, cfg);

    const paperC = buildPaperLayerClient(cw, ch, cfg);
    const blurBgC = buildBlurBgLayerClient(cleanCcCrop, cw, ch, cfg);
    cleanCcCrop.width = 1; cleanCcCrop.height = 1;

    const shadowC = buildShadowLayerClient(edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh, cw, ch, offset, cfg);
    const colordropC = buildColordropLayerClient(edgePixelsX, edgePixelsY, normXHalf, normYHalf, hw, hh, cw, ch, offset, cfg);
    timings["3_edges_accents_effects_sec"] = Number(((performance.now() - tStep) / 1000).toFixed(3));

    const elapsedSec = Number(((performance.now() - t0) / 1000).toFixed(2));
    timings["total_client_sec"] = elapsedSec;
    STATE.lastEngineSource = "Local GPU";

    const payload = {
      _isCompact: true,
      preset_key: key,
      canvas_size: [cw, ch],
      offset: [offX, offY],
      subject_size: [w, h],
      preset_settings: cfg,
      average_color: cfg.BG_BRUSH_MIX_AVERAGE ? averageColor : [128, 128, 128],
      dominant_color: dominantColor,
      elapsed_sec: elapsedSec,
      timings,
      maskBlob: maskC,
      layerBlobs: {
        bg_paper: paperC,
        subject_raw: subRawFull,
        subject_cc: subCcFull,
        subject_tex: subTexFull,
        blur_bg: blurBgC,
        oil_paint_full: oilFull,
        shadow: shadowC,
        colordrop: colordropC,
      },
      stroke_data: {
        edges,
        accent_candidates: candidates,
        accent_spots: spots,
      },
    };
    rebuildEdgeSpatialIndex(payload.stroke_data);
    setTimeout(() => StudioProfiler.report(), 60);
    return payload;
  }

  window.ClientWatercolorEngine = { generate };
})();