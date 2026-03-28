# SVG Generator for AxiDraw

A browser-based tool for generating plotter-ready SVG files, designed for the [AxiDraw](https://www.axidraw.com/) pen plotter. Built with Vue 3 and Vite.

## Modes

### Moiré

Generates interference patterns by overlaying two configurable layers of geometric shapes. Supports five pattern types:

- Concentric circles
- Radial lines
- Spirals
- Wave lines
- Grid lines

Each layer has independent controls for line count, center offset, rotation, and scale. Global controls include stroke width, wave amplitude/frequency, noise distortion, and crop shape (circle, square, rectangle, or none). Paths are automatically reordered using nearest-neighbor optimization to minimize pen-up travel time.

### Topo

Generates topographic contour maps from real-world elevation data. Search for any location by name, and the app fetches terrain tiles, builds an elevation grid, and renders contour lines at configurable intervals.

Features adjustable contour interval, rotation, oblique view angle, and height exaggeration.

## Features

- Real-time preview with live parameter adjustment
- SVG export with physical dimensions (mm/cm/in) for direct plotter use
- Document size presets: Letter, Tabloid, A4, A3, Square, and custom sizes
- Portrait/landscape orientation toggle
- Save and load parameter presets (stored in localStorage)
- Dark/light theme toggle
- Responsive layout with mobile support (bottom drawer sidebar)
- Parameter export as readable .txt alongside SVG files

## Tech Stack

- **Vue 3** — UI framework (reactivity drives sidebar controls only)
- **Vite 5** — Dev server and build tooling
- **d3-contour** — Marching squares algorithm for topo mode
- **No backend** — runs entirely in the browser

## Getting Started

```bash
git clone https://github.com/spencerussell/svg-generator-axidraw.git
cd svg-generator-axidraw
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for Production

```bash
npm run build
npm run preview   # preview the production build locally
```

## Project Structure

```
src/
  App.vue                        Mode switcher + top-level state
  main.js                        Vue app entry point
  style.css                      Global styles
  components/
    Sidebar.vue                  Moiré parameter controls
    TopoSidebar.vue              Topo parameter controls
    PreviewPane.vue              Moiré live preview
    TopoPreviewPane.vue          Topo live preview + loading indicator
    SliderControl.vue            Reusable slider component
    SegmentedControl.vue         Reusable segmented toggle
    OrientToggle.vue             Portrait/landscape toggle
  lib/
    docSize.js                   Document size presets and unit conversion
    presets.js                   localStorage preset CRUD
    noise.js                     Noise distortion utilities
  modules/
    moire/generator.js           Pattern generation, clipping, path reorder, SVG export
    topo/
      generator.js               Orchestration: fetch tiles, build contours, render SVG
      nominatim.js               Geocoding via Nominatim API
      tiles.js                   AWS Terrain Tiles fetch + Terrarium decode
      contours.js                d3-contour integration + clip ring detection
user_assets/                     Mode icons (SVG)
archive/                         Original single-file HTML version (reference)
```

## License

Private project. All rights reserved.
