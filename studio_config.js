/**
 * ⚙️ Watercolor Studio — Global Configuration & Framing Defaults
 * Edit this file to tune default zoom levels, bottom fade-out, aspect ratios, and target margins.
 */

window.STUDIO_CONFIG = {
  // Ordered modular workflow steps
  WORKFLOW_STEPS: [
    { id: "upload", label: "1. Upload Photo" },
    { id: "crop",   label: "2. Move & Zoom" },
    { id: "studio", label: "3. Artist Studio" },
  ],

  // Global default zoom (%) applied automatically in Step 2 (Move & Zoom)
  DEFAULT_ZOOM_BY_PROFILE: {
    animal: 97,
    person: 97,
    car:    100,
    object: 100,
  },

  DEFAULT_ZOOM_BY_PRESET: {
    animals:       97,
    animals_black: 97,
    people:        97,
    cars:          100,
    cars_black:    100,
    cars_color:    100,
    auto:          97,
  },

  // ==========================================================================
  // SUBJECT BOTTOM FADE-OUT DEFAULTS
  //   - BOTTOM_FADE_FRACTION: 0.25 means the lower 25% of the frame fades out
  //   - 0% = full opacity everywhere
  //   - 100% = lower 25% fades linearly from 100% down to 0% at the bottom edge
  // ==========================================================================
  BOTTOM_FADE_FRACTION: 0.25,

  DEFAULT_BOTTOM_FADE_BY_PROFILE: {
    animal: 100,
    person: 100,
    car:    0,
    object: 0,
  },

  DEFAULT_BOTTOM_FADE_BY_PRESET: {
    animals:       100,
    animals_black: 100,
    people:        100,
    cars:          0,
    cars_black:    0,
    cars_color:    0,
    auto:          100,
  },

  // Reference framing measurements (in metres on reference canvas)
  FRAMING_TARGETS_METERS: {
    animal: { canvasW: 1.0,  canvasH: 1.43, sideMargin: 0.18, headTop: 0.25, eyeY: 0.45 },
    car:    { canvasW: 1.43, canvasH: 1.0,  left: 0.10, right: 0.10, bottom: 0.10, top: 0.30 },
  },

  // Aspect ratio choices available in both Step 2 (Placement) and Step 3 (Studio)
  // Base dimensions are defined in Portrait (shortSide x longSide); Landscape flips them.
  ASPECT_RATIOS: [
    { id: "iso_a", label: "A2 / A3 / A4 (ISO √2)", short: 100, long: 141.421356 },
    { id: "4:3",   label: "4:3 Standard",          short: 105, long: 140 },
    { id: "3:2",   label: "3:2 Classic",           short: 100, long: 150 },
    { id: "16:9",  label: "16:9 Widescreen",       short: 90,  long: 160 },
  ],

  getAspectDimensions(ratioId, orientation = "portrait") {
    const found = this.ASPECT_RATIOS.find((r) => r.id === ratioId) || this.ASPECT_RATIOS[0];
    const isLandscape = orientation === "landscape";
    return {
      id: found.id,
      orientation: isLandscape ? "landscape" : "portrait",
      width: isLandscape ? found.long : found.short,
      height: isLandscape ? found.short : found.long,
    };
  },

  getCanvasPixelSize(ratioId, orientation = "portrait", baseLongSide = 1782) {
    const dim = this.getAspectDimensions(ratioId, orientation);
    if (dim.id === "iso_a") {
      return dim.orientation === "landscape"
        ? { width: 1782, height: 1260 }
        : { width: 1260, height: 1782 };
    }
    if (dim.width >= dim.height) {
      return {
        width: baseLongSide,
        height: Math.max(2, Math.round((baseLongSide * dim.height) / dim.width / 2) * 2),
      };
    }
    return {
      width: Math.max(2, Math.round((baseLongSide * dim.width) / dim.height / 2) * 2),
      height: baseLongSide,
    };
  },

  getDefaultZoomPercent(presetKey, profileKey) {
    if (presetKey && this.DEFAULT_ZOOM_BY_PRESET[presetKey] !== undefined) {
      return this.DEFAULT_ZOOM_BY_PRESET[presetKey];
    }
    if (profileKey && this.DEFAULT_ZOOM_BY_PROFILE[profileKey] !== undefined) {
      return this.DEFAULT_ZOOM_BY_PROFILE[profileKey];
    }
    return 97;
  },

  getDefaultBottomFadePercent(presetKey, profileKey) {
    if (presetKey && presetKey !== "auto" && this.DEFAULT_BOTTOM_FADE_BY_PRESET[presetKey] !== undefined) {
      return this.DEFAULT_BOTTOM_FADE_BY_PRESET[presetKey];
    }
    if (profileKey && this.DEFAULT_BOTTOM_FADE_BY_PROFILE[profileKey] !== undefined) {
      return this.DEFAULT_BOTTOM_FADE_BY_PROFILE[profileKey];
    }
    return 100;
  },
};