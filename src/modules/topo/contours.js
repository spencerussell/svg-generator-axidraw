import { contours } from 'd3-contour'

// Elevation below this is treated as nodata (void tiles, deep ocean)
const NODATA_THRESHOLD = -400

export function buildContours(grid, gridWidth, gridHeight, intervalM) {
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

  // Build threshold array at fixed interval
  const startElev = Math.ceil(minElev / intervalM) * intervalM
  const thresholds = []
  for (let e = startElev; e <= maxElev + 0.001; e += intervalM) {
    thresholds.push(e)
  }
  if (thresholds.length === 0) {
    return { contourRings: [], minElev, maxElev }
  }
  // Safety cap: don't run marching squares on 500+ levels.
  // Sample evenly so peak contours are never dropped.
  if (thresholds.length > 500) {
    const sampled = []
    for (let i = 0; i < 500; i++) {
      sampled.push(thresholds[Math.round(i * (thresholds.length - 1) / 499)])
    }
    thresholds.length = 0
    thresholds.push(...sampled)
  }

  // Replace nodata with (minElev - intervalM) so d3-contour treats it as below-all-thresholds
  const cleanGrid = new Float32Array(grid.length)
  const nodataFill = minElev - intervalM
  for (let i = 0; i < grid.length; i++) {
    cleanGrid[i] = grid[i] > NODATA_THRESHOLD ? grid[i] : nodataFill
  }

  const gen = contours().size([gridWidth, gridHeight]).thresholds(thresholds)
  const features = gen(cleanGrid)

  // Extract outer rings only (index 0 of each polygon).
  // Filter out degenerate rings (< 3 pts or tiny area) that appear as triangle artifacts
  // near nodata boundaries or grid edges — but preserve small rings near the peak.
  const MIN_RING_AREA = 9  // square grid pixels
  const MIN_PEAK_RING_AREA = 4  // smaller threshold for peak rings, but still filters noise
  const peakThreshold = maxElev - (maxElev - minElev) * 0.15  // top 15% always kept
  const contourRings = features.map(feature => ({
    elevation: feature.value,
    rings: feature.coordinates
      .map(polygon => polygon[0])
      .filter(r => r && r.length >= 3)
      .filter(r => {
        const area = Math.abs(polygonArea(r))
        if (feature.value >= peakThreshold) return area >= MIN_PEAK_RING_AREA
        return area >= MIN_RING_AREA
      })
      .map(r => {
        // Don't simplify tiny peak rings — tolerance 0.5 is too aggressive
        // relative to their size, distorting their geometry
        if (feature.value >= peakThreshold && Math.abs(polygonArea(r)) < 100) return r
        return simplifyRing(r, 0.5)
      }),
  }))

  return { contourRings, minElev, maxElev }
}

export function findClipRing(contourRings, summitX, summitY, gridWidth, gridHeight, summitElev) {
  // Collect all outer rings that enclose the summit and aren't grid-wide.
  const maxArea = gridWidth * gridHeight * 0.70
  const candidates = []
  for (const { elevation, rings } of contourRings) {
    for (const ring of rings) {
      if (pointInPolygon(summitX, summitY, ring)) {
        const area = Math.abs(polygonArea(ring))
        if (area < maxArea) {
          candidates.push({ ring, elevation })
        }
      }
    }
  }
  if (candidates.length === 0) return null

  // Sort ascending so candidates[0] is the lowest valid ring.
  candidates.sort((a, b) => a.elevation - b.elevation)

  // Target a ring ~20% of the way from the lowest valid ring to the summit.
  // This gives a natural mountain-base footprint rather than a near-sea-level ring.
  const lowestElev = candidates[0].elevation
  const targetElev = lowestElev + (summitElev - lowestElev) * 0.20

  let best = candidates[0]
  let bestDist = Math.abs(best.elevation - targetElev)
  for (const c of candidates) {
    const dist = Math.abs(c.elevation - targetElev)
    if (dist < bestDist) { bestDist = dist; best = c }
  }
  return { ring: best.ring, elevation: best.elevation }
}

// Iterative Ramer-Douglas-Peucker simplification (avoids recursion stack limits)
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
  // d3-contour closes rings (last pt === first pt); strip before simplifying
  const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  const open = isClosed ? ring.slice(0, -1) : ring
  const simplified = dpSimplify(open, tol)
  if (simplified.length < 3) return ring   // don't collapse ring
  return isClosed ? [...simplified, simplified[0]] : simplified
}

function polygonArea(ring) {
  // Shoelace formula
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
