/**
 * 🎨 Watercolor Studio — Part 5/5: Sliders, Layer Stack, Touch/Mouse & Export
 */

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

  History.bindUI();
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
      History.recordVis(def.id, lyr.vis);
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

  // Nahrazený blok pro typ "subject" s novým ovládáním prvků vedle sebe
  if (def.type === "subject") {
    addSlider(container, "Color Correction Strength", p.ccBlend, 0, 100, "%", (val) => {
      p.ccBlend = val;
      scheduleComposite();
    });

    // Side-by-side buttons: Watercolor Overlay & Under-Subject Window
    addSubjectOverlayAndWindowControls(container, def, p);
  }

  // Nově přidaný blok pro záři (Glow vrstvu)
  if (def.type === "glow") {
    addSlider(container, "Glow Size (Thickness & Blur)", p.size, 1, 55, "px", (val) => {
      p.size = val;
      scheduleGlowRerender();
    });

    addGlowColorModeControls(container, p);
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
    addSlider(container, "Mask Detail (Coarse ↔ Max Detail)", p.maskDetail, 0, 150, "%", (val) => {
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

  // Kontrast a Saturace jsou nyní vynechány, pokud se jedná o typ "glow"
  if (def.type !== "glow") {
    addSlider(container, "Contrast", p.contrast, 30, 200, "%", (val) => {
      p.contrast = val;
      scheduleComposite();
    });

    addSlider(container, "Saturation", p.saturation, 0, 250, "%", (val) => {
      p.saturation = val;
      scheduleComposite();
    });
  }
}

function addSubjectOverlayAndWindowControls(container, def, p) {
  const hasWcTex = !!(STATE.serverImages && (STATE.serverImages.subject_tex || STATE.serverImages.edge_curve));

  const row = document.createElement("div");
  row.className = "control-row";
  const lbl = document.createElement("label");
  lbl.innerHTML = `<span>Subject Texture & Backdrop Window</span>`;
  row.appendChild(lbl);

  const btnGroup = document.createElement("div");
  btnGroup.className = "btn-group";

  if (hasWcTex) {
    const wcBtn = document.createElement("button");
    const syncWc = () => {
      wcBtn.className = p.wcTexture ? "btn btn-sm btn-primary full-width" : "btn btn-sm btn-outline full-width";
      wcBtn.textContent = p.wcTexture ? "🎨 WC Overlay: ON" : "🎨 WC Overlay: OFF";
    };
    syncWc();
    wcBtn.addEventListener("click", () => {
      History.paramBegin();
      p.wcTexture = !p.wcTexture;
      syncWc();
      if (_stack.id !== def.id) invalidateStack();
      scheduleEdgeCurveRerender();
      scheduleComposite();
      History.paramCommit();
    });
    btnGroup.appendChild(wcBtn);
  }

  const winBtn = document.createElement("button");
  const syncWin = () => {
    winBtn.className = p.underWindowEnabled ? "btn btn-sm btn-primary full-width" : "btn btn-sm btn-outline full-width";
    winBtn.textContent = p.underWindowEnabled ? "🪟 BG Window: ON" : "🪟 BG Window: OFF";
  };
  syncWin();
  btnGroup.appendChild(winBtn);
  row.appendChild(btnGroup);

  // Sub-panel for Under-Subject Window (Black / White + Opacity slider)
  const subPanel = document.createElement("div");
  subPanel.className = `mask-controls ${p.underWindowEnabled ? "" : "hidden"}`;
  subPanel.style.marginTop = "10px";

  const colorGroup = document.createElement("div");
  colorGroup.className = "btn-group";
  colorGroup.style.marginBottom = "10px";

  const whiteBtn = document.createElement("button");
  const blackBtn = document.createElement("button");
  const syncColorBtns = () => {
    const isBlack = p.underWindowColor === "black";
    whiteBtn.className = !isBlack ? "btn btn-sm btn-primary full-width" : "btn btn-sm btn-outline full-width";
    whiteBtn.textContent = "⬜ White Window";
    blackBtn.className = isBlack ? "btn btn-sm btn-primary full-width" : "btn btn-sm btn-outline full-width";
    blackBtn.textContent = "⬛ Black Window";
  };
  syncColorBtns();

  whiteBtn.addEventListener("click", () => {
    History.paramBegin();
    p.underWindowColor = "white";
    syncColorBtns();
    if (_stack.id !== def.id) invalidateStack();
    scheduleComposite();
    History.paramCommit();
  });
  blackBtn.addEventListener("click", () => {
    History.paramBegin();
    p.underWindowColor = "black";
    syncColorBtns();
    if (_stack.id !== def.id) invalidateStack();
    scheduleComposite();
    History.paramCommit();
  });

  colorGroup.appendChild(whiteBtn);
  colorGroup.appendChild(blackBtn);
  subPanel.appendChild(colorGroup);

  addSlider(subPanel, "Window Opacity (Covers Under-Layers)", p.underWindowOpacity, 0, 100, "%", (val) => {
    p.underWindowOpacity = val;
    if (_stack.id !== def.id) invalidateStack();
    scheduleComposite();
  });

  winBtn.addEventListener("click", () => {
    History.paramBegin();
    p.underWindowEnabled = !p.underWindowEnabled;
    syncWin();
    subPanel.classList.toggle("hidden", !p.underWindowEnabled);
    if (_stack.id !== def.id) invalidateStack();
    scheduleComposite();
    History.paramCommit();
  });

  row.appendChild(subPanel);
  container.appendChild(row);
}

function addGlowColorModeControls(container, p) {
  const row = document.createElement("div");
  row.className = "control-row";

  const chkBtn = document.createElement("button");
  const syncChk = () => {
    chkBtn.className = p.colorMode ? "btn btn-sm btn-primary full-width" : "btn btn-sm btn-outline full-width";
    chkBtn.textContent = p.colorMode ? "☑️ Color Glow Mode: ON" : "⬜ Color Glow Mode: OFF (Default)";
  };
  syncChk();
  row.appendChild(chkBtn);

  const subMenu = document.createElement("div");
  subMenu.className = `mask-controls ${p.colorMode ? "" : "hidden"}`;
  subMenu.style.marginTop = "10px";

  const lbl = document.createElement("label");
  lbl.innerHTML = `<span>Custom Glow Color</span><span id="glowHexLabel">${p.glowColor}</span>`;
  subMenu.appendChild(lbl);

  const pickerRow = document.createElement("div");
  pickerRow.className = "color-picker-row";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = p.glowColor;

  const applyGlowHex = (hex) => {
    p.glowColor = hex;
    colorInput.value = hex;
    const hexLbl = subMenu.querySelector("#glowHexLabel");
    if (hexLbl) hexLbl.textContent = hex;
    scheduleGlowRerender();
  };

  colorInput.addEventListener("input", () => {
    History.paramBegin();
    applyGlowHex(colorInput.value);
  });
  colorInput.addEventListener("change", () => History.paramCommit());

  const resetColBtn = document.createElement("button");
  resetColBtn.className = "btn btn-sm btn-outline full-width";
  resetColBtn.textContent = "↺ Preset Default Color";
  resetColBtn.addEventListener("click", () => {
    History.paramBegin();
    applyGlowHex(p.defaultColorHex);
    History.paramCommit();
  });

  pickerRow.appendChild(colorInput);
  pickerRow.appendChild(resetColBtn);
  subMenu.appendChild(pickerRow);

  // Quick Swatches inside the Color Glow Submenu (including Subject Average & Dominant Colors!)
  const swatchRow = document.createElement("div");
  swatchRow.className = "quick-swatches";
  const avgHex = STATE.payload && STATE.payload.average_color ? rgbToHex(...STATE.payload.average_color) : "#888888";
  const domHex = STATE.payload && STATE.payload.dominant_color ? rgbToHex(...STATE.payload.dominant_color) : "#c87d55";
  const swatches = [
    ["#ffffff", "Pure White"],
    ["#fff3d1", "Warm Sunlight"],
    [avgHex, "Subject Average Color"],
    [domHex, "Subject Dominant Color"],
    ["#7dd3fc", "Sky Rim Glow"],
    ["#fda4af", "Warm Rose Glow"],
    ["#1e1914", "Deep Dark Rim"],
  ];
  for (const [hex, title] of swatches) {
    const sw = document.createElement("button");
    sw.className = "swatch";
    sw.style.background = hex;
    sw.title = title;
    sw.addEventListener("click", () => {
      History.paramBegin();
      applyGlowHex(hex);
      History.paramCommit();
    });
    swatchRow.appendChild(sw);
  }
  subMenu.appendChild(swatchRow);

  chkBtn.addEventListener("click", () => {
    History.paramBegin();
    p.colorMode = !p.colorMode;
    syncChk();
    subMenu.classList.toggle("hidden", !p.colorMode);
    scheduleGlowRerender();
    History.paramCommit();
  });

  row.appendChild(subMenu);
  container.appendChild(row);
}

function addToggleRow(parent, labelText, initialValue, onToggle) {
  const row = document.createElement("div");
  row.className = "control-row";
  const lbl = document.createElement("label");
  lbl.innerHTML = `<span>${labelText}</span>`;

  const btn = document.createElement("button");
  const syncBtn = (on) => {
    btn.className = on ? "btn btn-sm btn-primary full-width" : "btn btn-sm btn-outline full-width";
    btn.textContent = on ? "✅ Enabled (Click to Turn Off)" : "🚫 Disabled (Click to Turn On)";
  };
  let state = initialValue;
  syncBtn(state);

  btn.addEventListener("click", () => {
    History.paramBegin();
    state = !state;
    syncBtn(state);
    onToggle(state);
    History.paramCommit();
  });

  row.appendChild(lbl);
  row.appendChild(btn);
  parent.appendChild(row);
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
    History.paramBegin();
    valSpan.textContent = `${input.value}${unit}`;
    onInput(Number(input.value));
  });
  input.addEventListener("change", () => History.paramCommit());

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
  sel.addEventListener("change", () => {
    History.paramBegin();
    onChange(sel.value);
    History.paramCommit();
  });
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

  History.recordReset(layerId, lyr);
  lyr.params = buildInitialLayerParams(lyr.def, cfg);
  lyr.paintCanvas = null;
  lyr.eraseCanvas = null;

  const bCtx = lyr.baseCanvas.getContext("2d");
  bCtx.clearRect(0, 0, w, h);
  
  if (
    ["brush_edge", "brush_dots", "brush_ellipse", "brush_ellipse_dark", "mask_blur", "accent"].includes(
      lyr.def.type
    )
  ) {
    rerenderProceduralLayer(layerId, true);
  } else if (layerId === "edge_curve") {
    rerenderLiveEdgeCurveLayer(true);
  } else if (layerId === "glow") { // Přidaná podmínka pro glow vrstvu
    rerenderLiveGlowLayer(true);
  } else if (layerId === "subject" && STATE.serverImages.subject_cc) {
    bCtx.drawImage(STATE.serverImages.subject_cc, 0, 0);
    rerenderLiveEdgeCurveLayer(true);
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
    if (!STATE.payload || e.target.closest(".floating-zoom, .floating-history")) return;
    if (isPickingColor) {
      pickColorFromCanvas(e.clientX, e.clientY);
      isPickingColor = false;
      viewport.style.cursor = "default";
      return;
    }
    STATE.isDragging = true;
    STATE.lastMouse = { x: e.clientX, y: e.clientY };
    if (["brush", "eraser", "mask"].includes(STATE.activeTool)) {
      beginEditStroke();
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
    endEditStroke();
  });

  viewport.addEventListener("touchstart", (e) => {
    if (!STATE.payload || e.target.closest(".floating-zoom, .floating-history")) return;
    closeMobileSheets();

    if (e.touches.length === 2) {
      STATE.isDragging = false;
      endEditStroke();
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
        beginEditStroke();
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
      endEditStroke();
    }
  });

  viewport.addEventListener("touchcancel", () => {
    lastPinchDist = null;
    lastPinchCenter = null;
    STATE.isDragging = false;
    endEditStroke();
  });
}

function screenToCanvasCoords(clientX, clientY) {
  const rect = displayCanvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (displayCanvas.width / rect.width);
  const y = (clientY - rect.top) * (displayCanvas.height / rect.height);
  return { x, y };
}

let _maskLastPt = null;

function beginEditStroke() {
  _maskLastPt = null;
  const tool = STATE.activeTool;
  if (tool === "mask") {
    History.beginStroke("mask", null);
  } else if (tool === "brush" || tool === "eraser") {
    History.beginStroke(
      `${tool === "eraser" ? "erase" : "paint"}:${STATE.selectedLayerId}`,
      STATE.selectedLayerId
    );
  }
}

function endEditStroke() {
  History.endStroke();
  _maskLastPt = null;
}

function applyManualStrokeAtPoint(clientX, clientY) {
  const { x, y } = screenToCanvasCoords(clientX, clientY);
  const size = Number(document.getElementById("manualBrushSize").value);
  const opacity = Number(document.getElementById("manualBrushOpacity").value) / 100;
  const colorHex = document.getElementById("manualBrushColor").value;
  const tip = document.getElementById("manualBrushTip").value;
  const [w, h] = STATE.payload.canvas_size;

  if (STATE.activeTool === "mask" && STATE.maskCanvas) {
    const [offX, offY] = STATE.payload.offset;
    const [subW, subH] = STATE.payload.subject_size;
    const sx = STATE.maskCanvas.width / subW;
    const sy = STATE.maskCanvas.height / subH;
    const mx = (x - offX) * sx;
    const my = (y - offY) * sy;
    const r = (size / 2) * sx;
    const hasPrev = !!_maskLastPt;
    const px = hasPrev ? _maskLastPt.x : mx;
    const py = hasPrev ? _maskLastPt.y : my;
    ensureMaskOverlay();
    History.touch(
      STATE.maskCanvas,
      Math.min(px, mx) - r - 2, Math.min(py, my) - r - 2,
      Math.max(px, mx) + r + 2, Math.max(py, my) + r + 2
    );
    paintMaskSegment(px, py, mx, my, r, hasPrev, STATE.maskModePaintKeep);
    _maskLastPt = { x: mx, y: my };
    scheduleComposite();
    return;
  }

  const lyr = STATE.layers[STATE.selectedLayerId];
  if (!lyr || !lyr.vis) return;

  const targetCanvas = STATE.activeTool === "eraser"
    ? getOrCreateEraseCanvas(lyr, w, h)
    : getOrCreatePaintCanvas(lyr, w, h);
  const ctx = targetCanvas.getContext("2d");

  const histR = STATE.activeTool === "eraser" ? size / 2 + 2 : size * 0.75 + 6;
  History.touch(targetCanvas, x - histR, y - histR, x + histR, y + histR);

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

function renderMaskEditorView() {
  const [w, h] = STATE.payload.canvas_size;
  const [offX, offY] = STATE.payload.offset;
  const [subW, subH] = STATE.payload.subject_size;
  displayCtx.clearRect(0, 0, w, h);
  displayCtx.fillStyle = "#121212";
  displayCtx.fillRect(0, 0, w, h);
  displayCtx.drawImage(STATE.originalImg, offX, offY, subW, subH);
  const overlay = ensureMaskOverlay();
  if (overlay) {
    // 88% opaque black over removed areas so the cutout is crystal clear
    displayCtx.save();
    displayCtx.globalAlpha = 0.88;
    displayCtx.drawImage(overlay, offX, offY, subW, subH);
    displayCtx.restore();
  }
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