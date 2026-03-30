/**
 * Web Worker for heavy contour pipeline computation (Stages 3-5).
 *
 * Accepts elevation grid data and parameters, runs contour slicing,
 * projection, and optional hidden-line removal, then posts back
 * the result data for SVG rendering on the main thread.
 *
 * Messages:
 *   IN:  { grid: Float32Array, gridWidth, gridHeight, pixelSizeMeters,
 *          summitX, summitY, summitElev, params }
 *   OUT: { type: 'progress', stage, pct }
 *        { type: 'result', contourData, projectedContours?, visibleContours? }
 *        { type: 'error', message }
 */

import { sliceContours, filterByMountain } from './contours.js'
import { buildMesh } from './mesh.js'
import { createProjection } from './projection.js'
import { rasterizeDepthBuffer, occludeContours } from './hiddenLine.js'

self.onmessage = function (e) {
  try {
    const { grid, gridWidth, gridHeight, pixelSizeMeters, summitX, summitY, summitElev, params } = e.data

    // Stage 3: Slice contours
    self.postMessage({ type: 'progress', stage: 'Generating contours', pct: 10 })
    const intervalM = params.unit === 'ft' ? params.interval * 0.3048 : params.interval
    const baseClipElev = params.baseClipElev ?? null
    const { contours: rawContours, minElev, maxElev } = sliceContours(
      grid, gridWidth, gridHeight, intervalM, baseClipElev,
    )

    // Filter to mountain
    self.postMessage({ type: 'progress', stage: 'Filtering contours', pct: 30 })
    const extentKm = params.extentKm ?? 10
    const maxDistPx = (extentKm * 1000) / pixelSizeMeters
    const filtered = filterByMountain(rawContours, summitX, summitY, summitElev, maxDistPx, minElev)

    const contourData = { contours: filtered, minElev, maxElev }

    // Stage 4: Project
    self.postMessage({ type: 'progress', stage: 'Projecting contours', pct: 50 })
    const proj = createProjection(
      gridWidth, gridHeight, pixelSizeMeters,
      params.rotation, params.viewAngle, params.heightExaggeration,
    )
    const projectedContours = proj.projectContours(filtered)

    if (params.useDepthBuffer) {
      // Compute content bbox from all projected points (before occlusion)
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

      // Stage 2: Build mesh
      self.postMessage({ type: 'progress', stage: 'Building terrain mesh', pct: 60 })
      const mesh = buildMesh(grid, gridWidth, gridHeight)

      // Stage 5: Depth buffer HLR
      self.postMessage({ type: 'progress', stage: 'Hidden-line removal', pct: 70 })
      const depthBuf = rasterizeDepthBuffer(mesh.positions, mesh.indices, proj.projectVertex)

      self.postMessage({ type: 'progress', stage: 'Occluding contours', pct: 85 })
      const visibleContours = occludeContours(projectedContours, depthBuf)

      self.postMessage({
        type: 'result',
        contourData,
        visibleContours,
        contentBBox,
        mode: 'depthBuffer',
      })
    } else {
      self.postMessage({
        type: 'result',
        contourData,
        projectedContours,
        mode: 'painter',
      })
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message })
  }
}
