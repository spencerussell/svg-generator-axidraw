## Architecture Reference

Read ARCHITECTURE.md before making any changes to the contour pipeline. It describes the full 3D DEM-based pipeline (Acquire → Mesh → Slice → Project → Occlude → SVG) that replaces the old raster contour tracing approach.

# SVG Generator for AxiDraw

A Vue 3 + Vite web app that generates plotter-ready SVG files for the AxiDraw pen plotter. Features multiple generation modes:

- **Moiré** — Overlapping wave/circle patterns that create interference effects
- **Topo** — Topographic contour maps from real-world elevation data

## Tech Stack

- **Framework:** Vue 3.4 (reactivity for UI only; SVG rendering is imperative JS)
- **Build:** Vite 5
- **Dependencies:** d3-contour (marching squares for topo mode)
- **No backend** — runs entirely in the browser

## Architecture

SVG rendering is intentionally NOT reactive. Each mode has a pure JS `render*()` function in `src/modules/<mode>/generator.js`. Vue drives the sidebar UI only. New modes should follow this pattern.

## Project Structure

```
src/
  App.vue                    — Mode switcher (Moiré / Topo tabs), owns params
  main.js                    — Vue app entry point
  style.css                  — Global styles
  components/                — Vue components (sidebars, previews, controls)
  lib/                       — Shared utilities (docSize, presets, noise)
  modules/
    moire/generator.js       — Moiré pattern generation + SVG export
    topo/                    — Topo mode (geocoding, tiles, contours, rendering)
user_assets/                 — Static SVG icons
archive/                     — Original single-file HTML version (reference)
```

## Install & Run

```bash
npm install
npm run dev      # Dev server at localhost:5173
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

## Environment Variables

None required. The topo mode uses free public APIs (Nominatim geocoding, AWS Terrain Tiles) with no keys needed.
