/**
 * 🦴 studio_spine.js — Universal Multi-Style Cartridge Registry & Landing Controller
 *
 * Keeps the core 3-step Studio Spine (Viewport, 60 FPS Compositor, Undo/Redo History,
 * Manual Brush/Eraser, Aspect Ratio & Print Export) cleanly separated from individual
 * Style Cartridges ("watercolor", and future styles like "poster_art", "architecture", "abstract").
 */
(function () {
  "use strict";

  const _styles = new Map();
  let _activeStyleId = "watercolor";

  const StudioSpine = {
    registerStyle(styleDef) {
      if (!styleDef || !styleDef.id) return;
      _styles.set(styleDef.id, styleDef);
      this.renderStylePills();
    },

    getActiveStyle() {
      return _styles.get(_activeStyleId) || _styles.get("watercolor");
    },

    getActiveStyleId() {
      return _activeStyleId;
    },

    activateStyle(styleId) {
      const target = _styles.get(styleId);
      if (!target || target.disabled) return;
      _activeStyleId = styleId;
      document.body.dataset.styleCartridge = styleId;

      const titleEl = document.getElementById("landingTitle");
      const subEl = document.getElementById("landingSubtitle");
      if (titleEl && target.landingTitle) titleEl.textContent = target.landingTitle;
      if (subEl && target.landingSubtitle) subEl.textContent = target.landingSubtitle;

      this.renderStylePills();
      if (typeof target.onActivate === "function") {
        target.onActivate(STATE);
      }
    },

    renderStylePills() {
      const container = document.getElementById("landingStylePills");
      if (!container || _styles.size === 0) return;
      container.innerHTML = "";
      for (const [id, st] of _styles.entries()) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `style-cartridge-pill ${id === _activeStyleId ? "active" : ""}`;
        btn.dataset.styleId = id;
        btn.disabled = !!st.disabled;
        btn.textContent = st.badgeLabel || st.title || id;
        if (st.tooltip) btn.title = st.tooltip;
        btn.addEventListener("click", () => this.activateStyle(id));
        container.appendChild(btn);
      }
    },

    bindLandingDragAndDrop() {
      const dropzone = document.getElementById("landingDropzone");
      if (!dropzone || dropzone.dataset.boundDnd) return;
      dropzone.dataset.boundDnd = "1";

      ["dragenter", "dragover"].forEach((evName) => {
        dropzone.addEventListener(evName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add("drag-over");
        });
      });

      ["dragleave", "drop"].forEach((evName) => {
        dropzone.addEventListener(evName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove("drag-over");
        });
      });

      dropzone.addEventListener("drop", async (e) => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0 && window.Workflow) {
          await window.Workflow.startFromUploadedFile(files[0]);
        }
      });
    },
  };

  // Register Cartridge #1: Watercolor & Oil Studio (Default Active Cartridge)
  StudioSpine.registerStyle({
    id: "watercolor",
    title: "🎨 Watercolor & Oil Studio",
    badgeLabel: "🎨 Watercolor & Oil Studio",
    workflowMode: "cutout", // Step 1 (Upload) -> Step 2 (Move, Zoom & Cutout) -> Step 3 (Studio)
    landingTitle: "Upload Your Photo to Begin",
    landingSubtitle:
      "Drop a photo of a pet, portrait, or vehicle here, or click to browse. Smart framing, background removal, and 60 FPS artist layers run automatically.",
    getLayerDefinitions: () => LAYER_DEFINITIONS,
    generatePayload: (presetKey, useEditedMask) =>
      window.ClientWatercolorEngine.generate(presetKey, useEditedMask),
  });

  // Placeholder slots for upcoming cartridges
  StudioSpine.registerStyle({
    id: "poster_art",
    badgeLabel: "🖼️ Poster Art (Soon)",
    disabled: true,
    tooltip: "Coming soon",
  });
  StudioSpine.registerStyle({
    id: "architecture",
    badgeLabel: "🏛️ Architecture & Boats (Soon)",
    disabled: true,
    tooltip: "Coming soon",
  });

  window.StudioSpine = StudioSpine;

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => {
      StudioSpine.bindLandingDragAndDrop();
      StudioSpine.renderStylePills();
    });
  } else {
    StudioSpine.bindLandingDragAndDrop();
    StudioSpine.renderStylePills();
  }
})();