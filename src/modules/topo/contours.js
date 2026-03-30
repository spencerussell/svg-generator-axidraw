import { contours } from 'd3-contour'

// Elevation below this is treated as nodata (void tiles, deep ocean)
const NODATA_THRESHOLD = -400

/**
 * Stage 3: Slice — extract contour polylines from the DEM grid.
 *
 * Returns contours as arrays of 3D points [x, y, z] where z is the contour
 * elevation and x,y are in grid-pixel space.
 *
 * @param {Float32Array} grid - Elevation values
 * @param {number} gridWidth
 * @param {number} gridHeight
 * @param {number} intervalM - Contour interval in meters
 * @param {number} [baseClipElev] - Minimum elevation to include (clips lower contours)
 * @returns {{ contours: Array<{elevation: number, isIndex: boolean, rings: [number,number,number][][]}>, minElev: number, maxElev: number }}
 */
export function sliceContours(grid, gridWidth, gridHeight, intervalM, baseClipElev) {
  // Find elevation range, skipping nodata
  let minElev = Infinity
  let maxElev = -Infinity
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i]
    if (v > NODATA_THRESHOLD) {
      if (v < minElev) minElev = v
      if (v > maxElev) maxElev = v
    }
  }
  if (minElev === Infinity) throw new Error('No valid elevation data in tiles')

  // Apply base clip
  const effectiveMin = (baseClipElev != null && baseClipElev > minElev) ? baseClipElev : minElev

  // Build threshold array at fixed interval
  const startElev = Math.ceil(effectiveMin / intervalM) * intervalM
  const thresholds = []
  for (let e = startElev; e <= maxElev + 0.001; e += intervalM) {
    thresholds.push(e)
  }
  if (thresholds.length === 0) {
    return { contours: [], minElev, maxElev }
  }

  // Safety cap: don't run marching squares on 2000+ levels.
  if (thresholds.length > 2000) {
    const sampled = []
    for (let i = 0; i < 2000; i++) {
      sampled.push(thresholds[Math.round(i * (thresholds.length - 1) / 1999)])
    }
    thresholds.length = 0
    thresholds.push(...sampled)
  }

  // Replace nodata with below-all-thresholds value
  const cleanGrid = new Float32Array(grid.length)
  const nodataFill = minElev - intervalM
  for (let i = 0; i < grid.length; i++) {
    cleanGrid[i] = grid[i] > NODATA_THRESHOLD ? grid[i] : nodataFill
  }

  const gen = contours().size([gridWidth, gridHeight]).thresholds(thresholds)
  const features = gen(cleanGrid)

  // Filter and convert to 3D contours
  const MIN_RING_AREA = 9
  const MIN_PEAK_RING_AREA = 4
  const peakThreshold = maxElev - (maxElev - minElev) * 0.15

  // Determine index interval (every 5th contour level)
  const indexInterval = intervalM * 5

  const result = []
  for (const feature of features) {
    const elevation = feature.value
    const isIndex = Math.abs(elevation % indexInterval) < 0.01

    const rings = feature.coordinates
      .map(polygon => polygon[0])
      .filter(r => r && r.length >= 3)
      .filter(r => {
        const area = Math.abs(polygonArea(r))
        if (elevation >= peakThreshold) return area >= MIN_PEAK_RING_AREA
        return area >= MIN_RING_AREA
      })
      .map(r => {
        // Don't simplify tiny peak rings
        if (elevation >= peakThreshold && Math.abs(polygonArea(r)) < 100) {
          return r.map(([x, y]) => [x, y, elevation])
        }
        const simplified = simplifyRing(r, 0.5)
        return simplified.map(([x, y]) => [x, y, elevation])
      })

    if (rings.length > 0) {
      result.push({ elevation, isIndex, rings })
    }
  }

  return { contours: result, minElev, maxElev }
}

/**
 * Filter contours to a specific mountain by extent radius and summit membership.
 *
 * @param {Array} contourSet - Output from sliceContours
 * @param {number} summitX - Summit grid X
 * @param {number} summitY - Summit grid Y
 * @param {number} summitElev - Summit elevation
 * @param {number} maxDistPx - Extent radius in grid pixels
 * @param {number} minElev - Minimum elevation in grid
 * @returns {Array} Filtered contours with full rings and partial edge segments
 */
export function filterByMountain(contourSet, summitX, summitY, summitElev, maxDistPx, minElev) {
  const maxDistSq = maxDistPx * maxDistPx
  const peakThreshold = summitElev - (summitElev - minElev) * 0.15

  return contourSet
    .map(({ elevation, isIndex, rings }) => {
      const fullRings = []
      const edgeSegments = []

      for (const ring of rings) {
        // Mountain membership: non-peak rings must enclose the summit
        const ring2D = ring.map(([x, y]) => [x, y])
        const isMember = elevation >= peakThreshold || pointInPolygon(summitX, summitY, ring2D)
        if (!isMember) continue

        // Distance check: every point must be within extent radius
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
          // Clip to extent circle, extract inside portions as open segments
          const segs = extractInsideSegments(ring, summitX, summitY, maxDistSq)
          edgeSegments.push(...segs)
        }
      }

      return { elevation, isIndex, rings: fullRings, edgeSegments }
    })
    .filter(({ rings, edgeSegments }) => rings.length > 0 || edgeSegments.length > 0)
    .sort((a, b) => a.elevation - b.elevation)
}

// ---------------------------------------------------------------------------
// Geometry utilities
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

  const lerp3 = (p1, p2, t) => [
    p1[0] + t * (p2[0] - p1[0]),
    p1[1] + t * (p2[1] - p1[1]),
    p1[2],  // keep the contour elevation
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
      if (ts.length > 0) current.push(lerp3(curr, next, ts[0]))
      if (current.length >= 2) segments.push(current)
      current = null
    } else if (!cIn && nIn) {
      current = []
      const ts = intersectEdge(curr, next)
      if (ts.length > 0) current.push(lerp3(curr, next, ts[ts.length - 1]))
      current.push(next)
    } else {
      const ts = intersectEdge(curr, next)
      if (ts.length >= 2) {
        segments.push([lerp3(curr, next, ts[0]), lerp3(curr, next, ts[1])])
      }
    }
  }

  if (current && current.length >= 2) {
    if (segments.length > 0 && isInside(verts[0])) {
      segments[0] = [...current, ...segments[0]]
    } else {
      segments.push(current)
    }
  }

  return segments.filter(s => s.length >= 2)
}

// Iterative Ramer-Douglas-Peucker simplification
function dpSimplify(pts, tol) {
  if (pts.length <= 2) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    const [x1, y1] = pts[s]
    const [x2, y2] = pts[e]
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    let maxDist = 0, maxIdx = s
    for (let i = s + 1; i < e; i++) {
      const [px, py] = pts[i]
      const d = len === 0
        ? Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
        : Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len
      if (d > maxDist) { maxDist = d; maxIdx = i }
    }
    if (maxDist > tol) {
      keep[maxIdx] = 1
      stack.push([s, maxIdx], [maxIdx, e])
    }
  }
  return pts.filter((_, i) => keep[i])
}

function simplifyRing(ring, tol) {
  if (ring.length < 4) return ring
  const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  const open = isClosed ? ring.slice(0, -1) : ring
  const simplified = dpSimplify(open, tol)
  if (simplified.length < 3) return ring
  return isClosed ? [...simplified, simplified[0]] : simplified
}

function polygonArea(ring) {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return area / 2
}

export function pointInPolygon(px, py, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}
