# 3D Contour Pipeline — Architecture

This document describes the new 3D DEM-based contour pipeline that replaces the current raster contour tracing approach. The goal is to produce oblique-view topographic SVGs with proper hidden-line removal for the AxiDraw pen plotter.

## Pipeline Overview

The pipeline has 6 stages:

```
Acquire → Mesh → Slice → Project → Occlude → SVG
```

### Stage 1: Acquire (Elevation Data)

Fetch Mapbox Terrain RGB tiles for a given lat/lon center and bounding box radius.

- **Input:** lat, lon, radius (km), zoom level (auto-calculated from radius)
- **Process:** Convert center + radius to tile coordinates, fetch PNG tiles, decode RGB → elevation using `height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)`
- **Output:** `DEMGrid { data: Float32Array, width, height, bounds: {north, south, east, west}, pixelSizeMeters, summitElev, summitIdx }`
- **Notes:** Mapbox Terrain RGB uses a different encoding than the current AWS Terrarium tiles. We migrate to Mapbox for better global coverage and accuracy. Fallback: keep AWS Terrarium as an option.

### Stage 2: Mesh (Triangle Mesh from DEM)

Build a triangle mesh from the DEM grid for depth-buffer rasterization.

- **Input:** `DEMGrid`
- **Process:** Each 2x2 quad of grid cells → 2 triangles. Vertices carry (gridX, gridY, elevation). Optional: decimate flat regions to reduce triangle count.
- **Output:** `TerrainMesh { vertices: Float32Array, indices: Uint32Array, vertexCount, triangleCount }`
- **Notes:** The mesh is used only for hidden-line removal (depth buffer), not for contour generation.

### Stage 3: Slice (Contour Extraction)

Run marching squares on the DEM grid to extract contour polylines at fixed elevation intervals.

- **Input:** `DEMGrid`, contour interval (meters), base elevation clip
- **Process:** d3-contour marching squares → extract rings → chain segments into polylines → each point becomes [x, y, z] where z = contour elevation → filter by extent radius → simplify (RDP)
- **Output:** `ContourSet { contours: Contour[], minElev, maxElev }` where `Contour { points: [x,y,z][], elevation, isIndex: boolean }`
- **Notes:** Index contours are every 5th level. Points are in grid-pixel space at this stage.

### Stage 4: Project (3D → 2D Orthographic)

Project 3D contour polylines to 2D screen space using an orthographic camera.

- **Input:** `ContourSet`, azimuth (0-360), elevation angle (0-90), height exaggeration
- **Process:** For each point [x, y, z]:
  1. Center on grid midpoint
  2. Rotate by azimuth around vertical axis
  3. Tilt by elevation angle
  4. Apply height exaggeration to z
  5. Orthographic projection drops the depth axis → [screenX, screenY]
  6. Retain depth value per vertex for occlusion testing
- **Output:** `ProjectedContours { contours: ProjectedContour[] }` where `ProjectedContour { points2D: [sx,sy][], depths: float[], elevation, isIndex }`

### Stage 5: Occlude (Hidden-Line Removal)

Remove portions of contour lines hidden behind terrain using a depth buffer.

- **Input:** `ProjectedContours`, `TerrainMesh`, camera parameters (same as Stage 4)
- **Process (Depth Buffer approach):**
  1. Rasterize `TerrainMesh` into a depth buffer (1024x1024) from the same camera viewpoint
  2. For each projected contour segment, sample the depth buffer at multiple points
  3. If the segment's depth > buffer value + epsilon → hidden
  4. Split segments at visibility transitions → keep only visible portions
- **Output:** `VisibleContours { contours: VisibleContour[] }` where segments are split at visibility boundaries

### Stage 6: SVG (Export)

Convert visible 2D contour segments into plotter-ready SVG.

- **Input:** `VisibleContours`, document size, margins
- **Process:**
  1. Convert polylines to SVG `<path>` elements using M/L commands (or Catmull-Rom smoothing)
  2. Stroke width: 0.3mm regular contours, 0.6mm index contours (every 5th)
  3. Group paths by elevation in `<g>` elements
  4. Fit viewBox to content with 10mm margins
  5. Add optional labels (peak name, elevation) using stroke font
- **Output:** SVG DOM or string, ready for download

## Tech Stack

- **Framework:** Vue 3.4 (UI only; SVG rendering is imperative JS)
- **Build:** Vite 5
- **Dependencies:**
  - `d3-contour` — marching squares for Stage 3
  - Existing stroke font library for labels
- **Compute:** Web Worker for Stages 3-5 (heavy computation off main thread)
- **No backend** — browser-only, public tile APIs

## File Structure

```
src/
  modules/
    topo/
      nominatim.js         — Location geocoding (existing, unchanged)
      tiles.js             — Stage 1: tile fetching + DEM grid assembly
      mesh.js              — Stage 2: triangle mesh from DEM (NEW)
      contours.js          — Stage 3: contour slicing (REWRITE)
      projection.js        — Stage 4: 3D → 2D orthographic projection (NEW)
      hiddenLine.js        — Stage 5: depth-buffer hidden-line removal (NEW)
      svgExport.js         — Stage 6: SVG path generation + export (NEW)
      generator.js         — Pipeline orchestrator (REWRITE)
      contourWorker.js     — Web Worker for Stages 3-5 (NEW)
  components/
      TopoSidebar.vue      — Updated controls for new pipeline
      TopoPreviewPane.vue  — Updated preview with progress
```

## UI Controls

The topo sidebar will have these controls:

1. **Location** — Text input for place name or lat/lon (existing search with Nominatim)
2. **Document size** — Preset dropdown + manual dimensions (existing)
3. **Bounding box radius** — Slider, 1-50 km
4. **Contour interval** — Dropdown: 25m, 50m, 100m, 200m
5. **Base elevation clip** — Slider, sets minimum elevation to include
6. **Azimuth** — Slider, 0-360 degrees (viewing direction)
7. **Elevation angle** — Slider, 0-90 degrees (tilt)
8. **Height exaggeration** — Slider (existing)
9. **Labels** — Checkboxes for mountain name + elevation (existing)
10. **Generate button** — Explicitly triggers pipeline (no auto-regen for heavy compute)
11. **Download SVG** — Export button (existing)

## Implementation Order

1. Update CLAUDE.md with architecture reference
2. Rewrite `tiles.js` for Mapbox Terrain RGB encoding (or keep Terrarium, parameterize)
3. Create `mesh.js` — triangle mesh builder
4. Rewrite `contours.js` — clean contour slicing with 3D points
5. Create `projection.js` — orthographic projection
6. Create `svgExport.js` — basic SVG export (no HLR yet, test end-to-end)
7. Create `hiddenLine.js` — depth-buffer HLR
8. Rewrite `generator.js` — orchestrate full pipeline
9. Update UI components for new controls
10. Create `contourWorker.js` — move heavy compute to Web Worker
