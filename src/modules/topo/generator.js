import { getBoundingTiles, fetchTerrariumTile, stitchTiles } from './tiles.js'
import { buildContours, findClipRing, pointInPolygon } from './contours.js'

const ZOOM = 12

// ---------------------------------------------------------------------------
// Step 1 — fetch tiles, stitch into elevation grid, find summit
// ---------------------------------------------------------------------------
export async function loadElevationData(location, onProgress) {
  onProgress({ stage: 'Fetching elevation tiles', pct: 5 })

  const tiles = getBoundingTiles(location.lat, location.lon, location.bbox, ZOOM)
  let loaded = 0
  const tileDataList = await Promise.all(
    tiles.map(async ({ x, y }) => {
      const imageData = await fetchTerrariumTile(ZOOM, x, y)
      loaded++
      onProgress({
        stage: `Fetching elevation tiles (${loaded}/${tiles.length})`,
        pct: 5 + (loaded / tiles.length) * 57,
      })
      return { x, y, imageData }
    }),
  )

  onProgress({ stage: 'Processing elevation data', pct: 64 })
  const { grid, gridWidth, gridHeight, pixelSizeMeters } = stitchTiles(tileDataList, ZOOM)

  // Find highest point → summit
  let summitIdx = 0
  let summitElev = -Infinity
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] > summitElev) { summitElev = grid[i]; summitIdx = i }
  }

  onProgress({ stage: 'Processing elevation data', pct: 70 })
  return {
    grid,
    gridWidth,
    gridHeight,
    pixelSizeMeters,
    summitX: summitIdx % gridWidth,
    summitY: Math.floor(summitIdx / gridWidth),
    summitElev,
  }
}

// ---------------------------------------------------------------------------
// Step 2 — build contour rings from cached grid (re-runs when interval changes)
//
// Two filters isolate the mountain:
//   1. Base elevation cutoff — ignores huge low-elevation rings (terrain floor)
//   2. Summit-enclosing filter — at each level, keeps only the ring around the
//      peak, excluding nearby ridges/hills at the same elevation
// ---------------------------------------------------------------------------
export function buildContourData(gridData, params) {
  const { grid, gridWidth, gridHeight, summitX, summitY, summitElev } = gridData
  const intervalM = params.unit === 'ft' ? params.interval * 0.3048 : params.interval

  const { contourRings, minElev, maxElev } = buildContours(
    grid, gridWidth, gridHeight, intervalM,
  )

  // Find the mountain footprint ring (~20% up from base to summit)
  const clipResult = findClipRing(contourRings, summitX, summitY, gridWidth, gridHeight, summitElev)
  const baseElevation = clipResult?.elevation ?? -Infinity

  // Keep only rings that are:
  //   (a) at or above the base elevation, AND
  //   (b) enclose the summit (i.e. belong to this mountain, not nearby terrain)
  // Exception: near the peak, skip the pointInPolygon test — tiny rings can fail
  // the test after simplification distorts their geometry, and at high elevation
  // there's no ambiguity about which mountain they belong to.
  const peakThreshold = summitElev - (summitElev - baseElevation) * 0.15
  const mountainRings = contourRings
    .filter(({ elevation }) => elevation >= baseElevation)
    .map(({ elevation, rings }) => ({
      elevation,
      rings: elevation >= peakThreshold
        ? rings  // keep all rings near peak
        : rings.filter(ring => pointInPolygon(summitX, summitY, ring)),
    }))
    .filter(({ rings }) => rings.length > 0)
    .sort((a, b) => a.elevation - b.elevation)

  return { contourRings: mountainRings, minElev, maxElev }
}

// ---------------------------------------------------------------------------
// Step 3 — project + render SVG (re-runs on any param change)
//
// Painter's algorithm — elevation ascending (lowest first, peak last):
//   • Each ring: fill=white (erases the far-side of lower rings) + stroke=black
//   • Near-side strokes stay visible; far-side strokes get covered by the fill
//     of the next ring up — giving correct hidden-line removal
//   • No clip path needed — contours are pre-filtered to the mountain only
// ---------------------------------------------------------------------------
export function renderTopoSVG(svgEl, contourData, gridData, params, svgW, svgH) {
  const { contourRings } = contourData
  const { gridWidth, gridHeight, pixelSizeMeters, summitX, summitY, summitElev } = gridData

  const cx = gridWidth / 2
  const cy = gridHeight / 2
  const rotRad = params.rotation * Math.PI / 180
  const vaRad  = params.viewAngle * Math.PI / 180
  const hExag  = params.heightExaggeration

  function projectPoint(gx, gy, elev) {
    const x = gx - cx
    const y = gy - cy
    const rx = x * Math.cos(rotRad) - y * Math.sin(rotRad)
    const ry = x * Math.sin(rotRad) + y * Math.cos(rotRad)
    const zPx = (elev / pixelSizeMeters) * hExag
    return [rx, ry * Math.sin(vaRad) - zPx * Math.cos(vaRad)]
  }

  function projectRing(ring, elev) {
    return ring.map(([gx, gy]) => projectPoint(gx, gy, elev))
  }

  // Project all rings (already filtered to mountain-only, sorted low→high)
  const projectedRings = contourRings.map(({ elevation, rings }) => ({
    elevation,
    projected: rings.map(ring => projectRing(ring, elevation)),
  }))

  // Bounding box from all projected mountain rings, including Catmull-Rom
  // spline control points so the bbox accounts for curve overshoot.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  function expandBBox(x, y) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  for (const { projected } of projectedRings) {
    for (const pts of projected) {
      const n = pts.length
      if (n < 3) { for (const [x, y] of pts) expandBBox(x, y); continue }
      // Include both the points and the Catmull-Rom control points
      for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n]
        const p1 = pts[i]
        const p2 = pts[(i + 1) % n]
        const p3 = pts[(i + 2) % n]
        expandBBox(p1[0], p1[1])
        // Bezier control points (same tension calc as ptsToPathD)
        const v1x = p1[0] - p0[0], v1y = p1[1] - p0[1]
        const v2x = p2[0] - p1[0], v2y = p2[1] - p1[1]
        const dot = v1x * v2x + v1y * v2y
        const m1 = Math.sqrt(v1x * v1x + v1y * v1y)
        const m2 = Math.sqrt(v2x * v2x + v2y * v2y)
        const cosA = (m1 > 0 && m2 > 0) ? dot / (m1 * m2) : 1
        const t1 = (1 + Math.min(cosA, 1)) * 0.5 * (1 / 6)
        const w1x = v2x, w1y = v2y
        const w2x = p3[0] - p2[0], w2y = p3[1] - p2[1]
        const dotB = w1x * w2x + w1y * w2y
        const mw1 = Math.sqrt(w1x * w1x + w1y * w1y)
        const mw2 = Math.sqrt(w2x * w2x + w2y * w2y)
        const cosB = (mw1 > 0 && mw2 > 0) ? dotB / (mw1 * mw2) : 1
        const t2 = (1 + Math.min(cosB, 1)) * 0.5 * (1 / 6)
        // CP1 and CP2 bound the cubic Bezier segment
        expandBBox(p1[0] + (p2[0] - p0[0]) * t1, p1[1] + (p2[1] - p0[1]) * t1)
        expandBBox(p2[0] - (p3[0] - p1[0]) * t2, p2[1] - (p3[1] - p1[1]) * t2)
      }
    }
  }
  // Include summit (may project slightly above highest contour ring)
  {
    const [px, py] = projectPoint(summitX, summitY, summitElev)
    expandBBox(px, py)
  }

  if (minX === Infinity) { svgEl.innerHTML = ''; return }

  // Auto-fit to viewport
  const pad = Math.max(32, Math.min(svgW, svgH) * 0.06)
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const scale = Math.min((svgW - 2 * pad) / rangeX, (svgH - 2 * pad) / rangeY)
  const tx = (svgW - rangeX * scale) / 2 - minX * scale
  const ty = (svgH - rangeY * scale) / 2 - minY * scale

  function toSVG([x, y]) {
    return [x * scale + tx, y * scale + ty]
  }

  function ptsToPathD(pts) {
    if (pts.length < 2) return ''
    const svgPts = pts.map(p => toSVG(p))

    // Detect closed ring: last point duplicates first (from d3-contour/simplifyRing)
    const last = svgPts[svgPts.length - 1]
    const first = svgPts[0]
    const isClosed = svgPts.length > 2 &&
      Math.abs(first[0] - last[0]) < 0.05 && Math.abs(first[1] - last[1]) < 0.05
    const pts2d = isClosed ? svgPts.slice(0, -1) : svgPts
    const n = pts2d.length

    if (isClosed && n >= 3) {
      // Catmull-Rom spline → cubic bezier with adaptive tension.
      // Sharp angles (< ~90°) get reduced smoothing to preserve detail;
      // gentle curves get full smoothing for natural topo contours.
      let d = `M${pts2d[0][0].toFixed(1)},${pts2d[0][1].toFixed(1)}`
      for (let i = 0; i < n; i++) {
        const p0 = pts2d[(i - 1 + n) % n]
        const p1 = pts2d[i]
        const p2 = pts2d[(i + 1) % n]
        const p3 = pts2d[(i + 2) % n]

        // Compute angle at p1 to adapt tension
        const v1x = p1[0] - p0[0], v1y = p1[1] - p0[1]
        const v2x = p2[0] - p1[0], v2y = p2[1] - p1[1]
        const dot = v1x * v2x + v1y * v2y
        const m1 = Math.sqrt(v1x * v1x + v1y * v1y)
        const m2 = Math.sqrt(v2x * v2x + v2y * v2y)
        const cosA = (m1 > 0 && m2 > 0) ? dot / (m1 * m2) : 1
        // tension: 1/6 for smooth curves, dropping toward 0 for sharp angles
        const t1 = (1 + Math.min(cosA, 1)) * 0.5 * (1 / 6)

        // Same for angle at p2
        const w1x = p2[0] - p1[0], w1y = p2[1] - p1[1]
        const w2x = p3[0] - p2[0], w2y = p3[1] - p2[1]
        const dotB = w1x * w2x + w1y * w2y
        const mw1 = Math.sqrt(w1x * w1x + w1y * w1y)
        const mw2 = Math.sqrt(w2x * w2x + w2y * w2y)
        const cosB = (mw1 > 0 && mw2 > 0) ? dotB / (mw1 * mw2) : 1
        const t2 = (1 + Math.min(cosB, 1)) * 0.5 * (1 / 6)

        const cp1x = p1[0] + (p2[0] - p0[0]) * t1
        const cp1y = p1[1] + (p2[1] - p0[1]) * t1
        const cp2x = p2[0] - (p3[0] - p1[0]) * t2
        const cp2y = p2[1] - (p3[1] - p1[1]) * t2

        d += `C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
      }
      return d + 'Z'
    }

    // Open path fallback (rare for contours)
    return svgPts.map(([x, y], i) =>
      `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    ).join('') + 'Z'
  }

  const NS = 'http://www.w3.org/2000/svg'
  svgEl.innerHTML = ''
  svgEl.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`)
  svgEl.setAttribute('width', String(svgW))
  svgEl.setAttribute('height', String(svgH))

  const g = document.createElementNS(NS, 'g')

  // White base from the lowest ring so the painter's algorithm has a clean
  // background to erase against
  if (projectedRings.length > 0) {
    for (const pts of projectedRings[0].projected) {
      if (pts.length < 2) continue
      const bg = document.createElementNS(NS, 'path')
      bg.setAttribute('d', ptsToPathD(pts))
      bg.setAttribute('fill', '#fff')
      bg.setAttribute('stroke', 'none')
      g.appendChild(bg)
    }
  }

  // Draw rings lowest→highest elevation.
  // White fill erases the far-side portion of each lower ring; black stroke
  // draws the contour line. Near-side strokes remain exposed; far-side strokes
  // get painted over by the next ring's fill.
  for (const { projected } of projectedRings) {
    for (const pts of projected) {
      if (pts.length < 2) continue
      const path = document.createElementNS(NS, 'path')
      path.setAttribute('d', ptsToPathD(pts))
      path.setAttribute('fill', '#fff')
      path.setAttribute('stroke', '#000')
      path.setAttribute('stroke-width', '0.5')
      path.setAttribute('stroke-linejoin', 'round')
      g.appendChild(path)
    }
  }

  svgEl.appendChild(g)
}

// ---------------------------------------------------------------------------
// Export — serialize SVG for download
// ---------------------------------------------------------------------------
export function exportTopoSVG(svgEl, docW_mm, docH_mm) {
  const clone = svgEl.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width',  docW_mm.toFixed(3) + 'mm')
  clone.setAttribute('height', docH_mm.toFixed(3) + 'mm')
  return new XMLSerializer().serializeToString(clone)
}
