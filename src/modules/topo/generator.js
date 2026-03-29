import { getBoundingTiles, fetchTerrariumTile, stitchTiles } from './tiles.js'
import { buildContours, pointInPolygon } from './contours.js'
import { textToPathD } from '../../lib/strokeFont.js'

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
// Step 2 — build contour rings from cached grid (re-runs when interval or
// extent changes)
//
// Isolation uses a distance-based approach: only keep contour rings whose
// every point falls within the user-controlled extent radius (km) from the
// summit.  This works universally regardless of mountain shape or surrounding
// terrain.  An additional pointInPolygon test keeps only rings belonging to
// this peak (not adjacent ridges at the same elevation).
// ---------------------------------------------------------------------------
export function buildContourData(gridData, params) {
  const { grid, gridWidth, gridHeight, pixelSizeMeters, summitX, summitY, summitElev } = gridData
  const intervalM = params.unit === 'ft' ? params.interval * 0.3048 : params.interval

  const { contourRings, minElev, maxElev } = buildContours(
    grid, gridWidth, gridHeight, intervalM,
  )

  // Convert extent (km) to grid pixels
  const extentKm = params.extentKm ?? 10
  const maxDistPx = (extentKm * 1000) / pixelSizeMeters
  const maxDistSq = maxDistPx * maxDistPx

  // Near the peak, skip pointInPolygon — tiny simplified rings can fail the
  // test, and at high elevation there's no ambiguity about which mountain
  // they belong to.
  const peakThreshold = summitElev - (summitElev - minElev) * 0.15

  const mountainRings = contourRings
    .map(({ elevation, rings }) => {
      const fullRings = []
      const extraSegments = []

      for (const ring of rings) {
        // Mountain membership: non-peak rings must enclose the summit
        const isMember = elevation >= peakThreshold || pointInPolygon(summitX, summitY, ring)
        if (!isMember) continue

        // Distance check: every point must be within the extent radius
        let allInside = true
        let hasInside = false
        for (const [gx, gy] of ring) {
          const dx = gx - summitX, dy = gy - summitY
          if (dx * dx + dy * dy > maxDistSq) allInside = false
          else hasInside = true
        }

        if (allInside) {
          fullRings.push(ring)
        } else if (hasInside) {
          // Ring extends beyond extent — extract inside portions as
          // stroke-only segments (no fill) so they don't interfere with
          // the painter's algorithm but still fill contour gaps.
          const segs = extractInsideSegments(ring, summitX, summitY, maxDistSq)
          extraSegments.push(...segs)
        }
      }

      return { elevation, rings: fullRings, extraSegments }
    })
    .filter(({ rings, extraSegments }) => rings.length > 0 || extraSegments.length > 0)
    .sort((a, b) => a.elevation - b.elevation)

  return { contourRings: mountainRings, minElev, maxElev }
}

// ---------------------------------------------------------------------------
// Extract the portions of a contour ring that fall inside the extent circle.
// Returns an array of open polyline segments (each an array of [x,y] points).
// Used for rings that partially extend beyond the extent — the inside portions
// are rendered as stroke-only paths (no fill) to avoid interfering with the
// painter's algorithm while still showing contour detail near the boundary.
// ---------------------------------------------------------------------------
function extractInsideSegments(ring, cx, cy, rSq) {
  const n = ring.length
  if (n < 3) return []

  const isInside = (p) => {
    const dx = p[0] - cx, dy = p[1] - cy
    return dx * dx + dy * dy <= rSq
  }

  const intersectEdge = (p1, p2) => {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1]
    const fx = p1[0] - cx, fy = p1[1] - cy
    const a = dx * dx + dy * dy
    if (a < 1e-12) return []
    const b = 2 * (fx * dx + fy * dy)
    const c = fx * fx + fy * fy - rSq
    const disc = b * b - 4 * a * c
    if (disc < 0) return []
    const sq = Math.sqrt(disc)
    const t1 = (-b - sq) / (2 * a)
    const t2 = (-b + sq) / (2 * a)
    const ts = []
    if (t1 > 1e-8 && t1 < 1 - 1e-8) ts.push(t1)
    if (t2 > 1e-8 && t2 < 1 - 1e-8 && Math.abs(t2 - t1) > 1e-8) ts.push(t2)
    return ts
  }

  const lerp = (p1, p2, t) => [
    p1[0] + t * (p2[0] - p1[0]),
    p1[1] + t * (p2[1] - p1[1]),
  ]

  // Strip closing duplicate if present
  const isClosed = ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]
  const verts = isClosed ? ring.slice(0, -1) : ring
  const m = verts.length
  if (m < 2) return []

  const segments = []
  let current = null

  for (let i = 0; i < m; i++) {
    const curr = verts[i]
    const next = verts[(i + 1) % m]
    const cIn = isInside(curr)
    const nIn = isInside(next)

    if (cIn && nIn) {
      if (!current) current = [curr]
      current.push(next)
    } else if (cIn && !nIn) {
      if (!current) current = [curr]
      const ts = intersectEdge(curr, next)
      if (ts.length > 0) current.push(lerp(curr, next, ts[0]))
      if (current.length >= 2) segments.push(current)
      current = null
    } else if (!cIn && nIn) {
      current = []
      const ts = intersectEdge(curr, next)
      if (ts.length > 0) current.push(lerp(curr, next, ts[ts.length - 1]))
      current.push(next)
    } else {
      // Both outside — edge may pass through circle
      const ts = intersectEdge(curr, next)
      if (ts.length >= 2) {
        segments.push([lerp(curr, next, ts[0]), lerp(curr, next, ts[1])])
      }
    }
  }

  // Handle wrap-around for closed rings
  if (current && current.length >= 2) {
    if (segments.length > 0 && isInside(verts[0])) {
      segments[0] = [...current, ...segments[0]]
    } else {
      segments.push(current)
    }
  }

  return segments.filter(s => s.length >= 2)
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
export function renderTopoSVG(svgEl, contourData, gridData, params, svgW, svgH, location) {
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
    return [rx, ry * Math.sin(vaRad) - zPx * Math.cos(vaRad), ry]
  }

  function projectRing(ring, elev) {
    return ring.map(([gx, gy]) => projectPoint(gx, gy, elev))
  }

  // Project all rings (already filtered to mountain-only, sorted low→high)
  const projectedRings = contourRings.map(({ elevation, rings, extraSegments }) => ({
    elevation,
    projected: rings.map(ring => projectRing(ring, elevation)),
    extraProjected: (extraSegments || []).map(seg => projectRing(seg, elevation)),
  }))

  // Bounding box from all projected mountain rings, including Catmull-Rom
  // spline control points so the bbox accounts for curve overshoot.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  function expandBBox(x, y) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  for (const { projected, extraProjected } of projectedRings) {
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
    // Include extra stroke segments in the bounding box
    for (const pts of extraProjected) {
      for (const [x, y] of pts) expandBBox(x, y)
    }
  }
  // Include summit (may project slightly above highest contour ring)
  {
    const [px, py] = projectPoint(summitX, summitY, summitElev)
    expandBBox(px, py)
  }

  if (minX === Infinity) { svgEl.innerHTML = ''; return }

  // Auto-fit to viewport (reserve bottom space for label when enabled)
  const pad = Math.max(32, Math.min(svgW, svgH) * 0.06)
  let labelReserve = 0
  if (params.showLabel && location) {
    const pxPerMM = svgH / (params.doc?.h_mm || svgH)
    const PT = 25.4 / 72
    const bottomMM = Math.min(12, (params.doc?.h_mm || 215.9) * 0.06)
    let reserveMM = 8 * PT + 2 + 5 * PT + bottomMM + 4
    if (params.showElevation) reserveMM += 5 * PT + 2
    labelReserve = reserveMM * pxPerMM
  }
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const availH = svgH - labelReserve
  const scale = Math.min((svgW - 2 * pad) / rangeX, (availH - 2 * pad) / rangeY)
  const tx = (svgW - rangeX * scale) / 2 - minX * scale
  const ty = (availH - rangeY * scale) / 2 - minY * scale

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

  // Smooth open-path variant using Catmull-Rom splines (same adaptive tension
  // as ptsToPathD but for non-closed segments).
  function ptsToOpenSmoothPathD(pts) {
    if (pts.length < 2) return ''
    const svgPts = pts.map(p => toSVG(p))
    const n = svgPts.length
    if (n === 2) {
      return `M${svgPts[0][0].toFixed(1)},${svgPts[0][1].toFixed(1)}L${svgPts[1][0].toFixed(1)},${svgPts[1][1].toFixed(1)}`
    }
    let d = `M${svgPts[0][0].toFixed(1)},${svgPts[0][1].toFixed(1)}`
    for (let i = 0; i < n - 1; i++) {
      // Phantom endpoints: reflect across boundary for natural tangent
      const p0 = i > 0 ? svgPts[i - 1]
        : [2 * svgPts[0][0] - svgPts[1][0], 2 * svgPts[0][1] - svgPts[1][1]]
      const p1 = svgPts[i]
      const p2 = svgPts[i + 1]
      const p3 = i + 2 < n ? svgPts[i + 2]
        : [2 * svgPts[n - 1][0] - svgPts[n - 2][0], 2 * svgPts[n - 1][1] - svgPts[n - 2][1]]

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

      const cp1x = p1[0] + (p2[0] - p0[0]) * t1
      const cp1y = p1[1] + (p2[1] - p0[1]) * t1
      const cp2x = p2[0] - (p3[0] - p1[0]) * t2
      const cp2y = p2[1] - (p3[1] - p1[1]) * t2

      d += `C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
    }
    return d
  }

  // ---------------------------------------------------------------------------
  // Extract near-side (viewer-facing) portions of a projected contour path.
  // Each projected point is [screenX, screenY, ry] where ry is the rotated
  // depth coordinate — positive ry = near side, negative = far side.
  // Returns an array of open polyline segments on the viewer's side.
  // ---------------------------------------------------------------------------
  function extractVisibleSegments(pts, isClosed) {
    const n = pts.length
    if (n < 2) return []

    // Strip closing duplicate for closed rings
    let ring = pts
    if (isClosed && n > 2) {
      const f = pts[0], l = pts[n - 1]
      if (Math.abs(f[0] - l[0]) < 0.001 && Math.abs(f[1] - l[1]) < 0.001) {
        ring = pts.slice(0, -1)
      }
    }
    const m = ring.length
    if (m < 2) return []

    const isVis = p => p[2] >= 0
    const interp = (a, b) => {
      const t = -a[2] / (b[2] - a[2])
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), 0]
    }

    const segments = []
    let current = null
    const limit = isClosed ? m : m - 1

    for (let i = 0; i < limit; i++) {
      const p = ring[i]
      const q = ring[isClosed ? (i + 1) % m : i + 1]
      const pV = isVis(p), qV = isVis(q)

      if (pV && qV) {
        if (!current) current = [p]
        current.push(q)
      } else if (pV && !qV) {
        if (!current) current = [p]
        current.push(interp(p, q))
        segments.push(current)
        current = null
      } else if (!pV && qV) {
        current = [interp(p, q), q]
      }
    }

    if (!isClosed && current && current.length >= 2) {
      segments.push(current)
    }
    if (isClosed && current && current.length >= 2) {
      if (segments.length > 0 && isVis(ring[0])) {
        segments[0] = [...current, ...segments[0].slice(1)]
      } else {
        segments.push(current)
      }
    }

    return segments.filter(s => s.length >= 2)
  }

  // Draw rings lowest→highest elevation (painter's algorithm).
  // White fill erases the far-side of each lower ring.  Strokes are only
  // drawn on the near side (ry ≥ 0) so that back-side contour lines never
  // appear through gaps between ridges on the viewer's side.
  for (const { projected, extraProjected } of projectedRings) {
    // Full-ring white fill for occlusion (painter's algorithm)
    for (const pts of projected) {
      if (pts.length < 2) continue
      const fill = document.createElementNS(NS, 'path')
      fill.setAttribute('d', ptsToPathD(pts))
      fill.setAttribute('fill', '#fff')
      fill.setAttribute('stroke', 'none')
      g.appendChild(fill)
    }
    // Near-side strokes only
    for (const pts of projected) {
      if (pts.length < 2) continue
      const visSegs = extractVisibleSegments(pts, true)
      for (const seg of visSegs) {
        const path = document.createElementNS(NS, 'path')
        path.setAttribute('d', ptsToOpenSmoothPathD(seg))
        path.setAttribute('fill', 'none')
        path.setAttribute('stroke', '#000')
        path.setAttribute('stroke-width', '0.5')
        path.setAttribute('stroke-linejoin', 'round')
        g.appendChild(path)
      }
    }
    // Extra stroke segments: also filter to near-side only
    for (const pts of extraProjected) {
      if (pts.length < 2) continue
      const visSegs = extractVisibleSegments(pts, false)
      for (const seg of visSegs) {
        const path = document.createElementNS(NS, 'path')
        path.setAttribute('d', ptsToOpenSmoothPathD(seg))
        path.setAttribute('fill', 'none')
        path.setAttribute('stroke', '#000')
        path.setAttribute('stroke-width', '0.5')
        path.setAttribute('stroke-linejoin', 'round')
        g.appendChild(path)
      }
    }
  }

  // Render label text as single-stroke paths
  if (params.showLabel && location) {
    const pxPerMM = svgH / (params.doc?.h_mm || svgH)
    const PT = 25.4 / 72
    const bottomMM = Math.min(25, (params.doc?.h_mm || 215.9) * 0.12)

    const nameCapH  = 10 * PT * pxPerMM
    const stateCapH = 6 * PT * pxPerMM
    const elevCapH  = 6 * PT * pxPerMM

    // Stack baselines from the bottom up
    let bottomY = svgH - bottomMM * pxPerMM
    let elevBaseline = null
    if (params.showElevation) {
      elevBaseline = bottomY
      bottomY -= elevCapH + 2 * pxPerMM
    }
    const stateBaseline = bottomY
    const nameBaseline  = stateBaseline - stateCapH - 2 * pxPerMM

    const cx = svgW / 2
    const mountainName = (location.shortName || '').toUpperCase()
    const stateName    = (location.state || location.country || '').toUpperCase()

    // Format elevation: convert meters to feet if unit is ft, add comma separators
    let elevText = null
    if (params.showElevation && summitElev != null) {
      const elevVal = params.unit === 'ft' ? Math.round(summitElev * 3.28084) : Math.round(summitElev)
      const formatted = String(elevVal).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      const suffix = params.unit === 'ft' ? "'" : ' M'
      elevText = `ELEV. ${formatted}${suffix}`
    }

    const labels = [[mountainName, nameBaseline, nameCapH], [stateName, stateBaseline, stateCapH]]
    if (elevText) labels.push([elevText, elevBaseline, elevCapH])

    for (const [text, baseline, capH] of labels) {
      if (!text) continue
      const d = textToPathD(text, cx, baseline, capH)
      if (!d) continue
      const path = document.createElementNS(NS, 'path')
      path.setAttribute('d', d)
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', '#000')
      path.setAttribute('stroke-width', '0.5')
      path.setAttribute('stroke-linecap', 'round')
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
