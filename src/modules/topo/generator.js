/**
 * Pipeline orchestrator — wires together the 6 stages:
 *   Acquire → Mesh → Slice → Project → Occlude → SVG
 *
 * Each stage is a separate module. The generator manages data flow,
 * caching, and progress reporting between them.
 */

import { getBoundingTiles, getTilesForRadius, zoomForRadius, fetchTerrariumTile, stitchTiles } from './tiles.js'
import { buildMesh } from './mesh.js'
import { sliceContours, filterByMountain } from './contours.js'
import { createProjection } from './projection.js'
import { rasterizeDepthBuffer, occludeContours } from './hiddenLine.js'
import { renderSVG, renderSVGPainter, exportSVG } from './svgExport.js'

const DEFAULT_ZOOM = 12

// ---------------------------------------------------------------------------
// Stage 1: Acquire — fetch tiles, stitch into elevation grid, find summit
// ---------------------------------------------------------------------------
export async function loadElevationData(location, onProgress, radiusKm) {
  onProgress({ stage: 'Fetching elevation tiles', pct: 5 })

  // Determine zoom and tiles
  let tiles
  if (radiusKm != null) {
    const zoom = zoomForRadius(location.lat, radiusKm)
    tiles = getTilesForRadius(location.lat, location.lon, radiusKm, zoom)
    // Store zoom for stitching
    tiles._zoom = zoom
  } else {
    tiles = getBoundingTiles(location.lat, location.lon, location.bbox, DEFAULT_ZOOM)
    tiles._zoom = DEFAULT_ZOOM
  }

  const zoom = tiles._zoom
  let loaded = 0
  const tileDataList = await Promise.all(
    tiles.map(async ({ x, y }) => {
      const imageData = await fetchTerrariumTile(zoom, x, y)
      loaded++
      onProgress({
        stage: `Fetching elevation tiles (${loaded}/${tiles.length})`,
        pct: 5 + (loaded / tiles.length) * 57,
      })
      return { x, y, imageData }
    }),
  )

  onProgress({ stage: 'Processing elevation data', pct: 64 })
  const gridData = stitchTiles(tileDataList, zoom)

  onProgress({ stage: 'Processing elevation data', pct: 70 })
  return gridData
}

// ---------------------------------------------------------------------------
// Stage 2+3: Build contour data (re-runs when interval, extent, or base clip changes)
// ---------------------------------------------------------------------------
export function buildContourData(gridData, params) {
  const { grid, gridWidth, gridHeight, pixelSizeMeters, summitX, summitY, summitElev } = gridData
  const intervalM = params.unit === 'ft' ? params.interval * 0.3048 : params.interval

  // Stage 3: Slice contours
  const baseClipElev = params.baseClipElev ?? null
  const { contours: rawContours, minElev, maxElev } = sliceContours(
    grid, gridWidth, gridHeight, intervalM, baseClipElev,
  )

  // Filter to mountain extent
  const extentKm = params.extentKm ?? 10
  const maxDistPx = (extentKm * 1000) / pixelSizeMeters
  const filtered = filterByMountain(rawContours, summitX, summitY, summitElev, maxDistPx, minElev)

  return { contours: filtered, minElev, maxElev }
}

// ---------------------------------------------------------------------------
// Stage 4+5+6: Project, occlude, and render SVG
// ---------------------------------------------------------------------------
export function renderTopoSVG(svgEl, contourData, gridData, params, svgW, svgH, location) {
  const { gridWidth, gridHeight, pixelSizeMeters } = gridData

  // Stage 4: Create projection
  const proj = createProjection(
    gridWidth, gridHeight, pixelSizeMeters,
    params.rotation, params.viewAngle, params.heightExaggeration,
  )

  // Project all contours
  const projectedContours = proj.projectContours(contourData.contours)

  if (params.useDepthBuffer) {
    // Compute bbox from all projected points (before occlusion) so framing matches painter's path
    let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity
    for (const { projectedRings, projectedEdges } of projectedContours) {
      for (const { points2D } of projectedRings) {
        for (const [x, y] of points2D) {
          if (x < bMinX) bMinX = x; if (x > bMaxX) bMaxX = x
          if (y < bMinY) bMinY = y; if (y > bMaxY) bMaxY = y
        }
      }
      for (const { points2D } of projectedEdges) {
        for (const [x, y] of points2D) {
          if (x < bMinX) bMinX = x; if (x > bMaxX) bMaxX = x
          if (y < bMinY) bMinY = y; if (y > bMaxY) bMaxY = y
        }
      }
    }
    const contentBBox = { minX: bMinX, maxX: bMaxX, minY: bMinY, maxY: bMaxY }

    // Stage 2: Build mesh (only needed for depth-buffer HLR)
    const mesh = buildMesh(gridData.grid, gridWidth, gridHeight)

    // Stage 5: Rasterize depth buffer and occlude
    const depthBuf = rasterizeDepthBuffer(
      mesh.positions, mesh.indices, proj.projectVertex,
    )
    const visibleContours = occludeContours(projectedContours, depthBuf)

    // Stage 6: Render SVG (pass pre-occlusion bbox for consistent framing)
    renderSVG(svgEl, visibleContours, gridData, params, svgW, svgH, location, proj.project, contentBBox)
  } else {
    // Fallback: painter's algorithm (original approach, no depth buffer)
    renderSVGPainter(svgEl, projectedContours, gridData, params, svgW, svgH, location, proj.project)
  }
}

// ---------------------------------------------------------------------------
// Export — serialize SVG for download
// ---------------------------------------------------------------------------
export { exportSVG as exportTopoSVG } from './svgExport.js'
