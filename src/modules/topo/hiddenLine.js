/**
 * Stage 5: Occlude — hidden-line removal using a depth buffer.
 *
 * Rasterizes the terrain mesh into a depth buffer from the same camera viewpoint
 * used for contour projection, then tests each contour segment against the buffer
 * to determine visibility. Segments are split at visibility transitions.
 */

/**
 * Rasterize a triangle mesh into a depth buffer.
 *
 * @param {Float32Array} positions - Interleaved [x,y,z,...] mesh vertices
 * @param {Uint32Array} indices - Triangle indices (3 per triangle)
 * @param {Function} projectVertex - (x,y,z) => [sx, sy, depth]
 * @param {number} bufferSize - Depth buffer resolution (square)
 * @returns {{ depthBuffer: Float32Array, minSX: number, minSY: number, scale: number, size: number }}
 */
export function rasterizeDepthBuffer(positions, indices, projectVertex, bufferSize = 2048) {
  const triCount = indices.length / 3

  // First pass: project all vertices and find screen-space bounds
  const vertCount = positions.length / 3
  const projected = new Float32Array(vertCount * 3) // [sx, sy, depth] per vertex

  let minSX = Infinity, maxSX = -Infinity
  let minSY = Infinity, maxSY = -Infinity

  for (let i = 0; i < vertCount; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    const z = positions[i * 3 + 2]
    const [sx, sy, depth] = projectVertex(x, y, z)
    projected[i * 3] = sx
    projected[i * 3 + 1] = sy
    projected[i * 3 + 2] = depth
    if (sx < minSX) minSX = sx; if (sx > maxSX) maxSX = sx
    if (sy < minSY) minSY = sy; if (sy > maxSY) maxSY = sy
  }

  const rangeX = maxSX - minSX || 1
  const rangeY = maxSY - minSY || 1
  const scale = (bufferSize - 2) / Math.max(rangeX, rangeY)

  // Initialize depth buffer to -Infinity (farthest)
  const depthBuffer = new Float32Array(bufferSize * bufferSize)
  depthBuffer.fill(-Infinity)

  // Rasterize each triangle
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3]
    const i1 = indices[t * 3 + 1]
    const i2 = indices[t * 3 + 2]

    // Screen-space coordinates
    const x0 = (projected[i0 * 3] - minSX) * scale + 1
    const y0 = (projected[i0 * 3 + 1] - minSY) * scale + 1
    const d0 = projected[i0 * 3 + 2]

    const x1 = (projected[i1 * 3] - minSX) * scale + 1
    const y1 = (projected[i1 * 3 + 1] - minSY) * scale + 1
    const d1 = projected[i1 * 3 + 2]

    const x2 = (projected[i2 * 3] - minSX) * scale + 1
    const y2 = (projected[i2 * 3 + 1] - minSY) * scale + 1
    const d2 = projected[i2 * 3 + 2]

    rasterizeTriangle(depthBuffer, bufferSize, x0, y0, d0, x1, y1, d1, x2, y2, d2)
  }

  return { depthBuffer, minSX, minSY, scale, size: bufferSize }
}

/**
 * Rasterize a single triangle into the depth buffer using bounding-box traversal.
 * Uses barycentric coordinates with a small negative threshold to ensure
 * sub-pixel triangles and shared edges are always filled (conservative rasterization).
 * Writes the maximum depth at each pixel (closest to viewer).
 */
function rasterizeTriangle(buffer, size, x0, y0, d0, x1, y1, d1, x2, y2, d2) {
  // Edge function denominator (2x signed triangle area)
  const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
  if (Math.abs(denom) < 1e-10) return
  const invDenom = 1 / denom

  // Bounding box in pixel space
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2)))
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2)))

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) * invDenom
      const w1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) * invDenom
      const w2 = 1 - w0 - w1

      // Small negative threshold ensures shared edges and sub-pixel triangles are filled
      if (w0 >= -0.01 && w1 >= -0.01 && w2 >= -0.01) {
        const depth = w0 * d0 + w1 * d1 + w2 * d2
        const idx = y * size + x
        if (depth > buffer[idx]) {
          buffer[idx] = depth
        }
      }
    }
  }
}

/**
 * Test contour segments against the depth buffer and split at visibility boundaries.
 *
 * @param {Array} projectedContours - Output from projection.projectContours()
 * @param {object} depthBuf - Output from rasterizeDepthBuffer()
 * @param {number} epsilon - Depth tolerance (contour is visible if its depth >= buffer - epsilon)
 * @returns {Array<{elevation, isIndex, segments: [number,number][][]}>}
 *   Each segment is an array of [sx, sy] points that are visible.
 */
export function occludeContours(projectedContours, depthBuf, epsilon = 4) {
  const { depthBuffer, minSX, minSY, scale, size } = depthBuf

  /**
   * Bilinear depth buffer sampling for smoother visibility transitions.
   */
  function sampleDepth(sx, sy) {
    const fx = (sx - minSX) * scale + 1
    const fy = (sy - minSY) * scale + 1
    const x0 = Math.floor(fx), y0 = Math.floor(fy)
    const x1 = x0 + 1, y1 = y0 + 1
    if (x0 < 0 || x1 >= size || y0 < 0 || y1 >= size) return -Infinity

    const dx = fx - x0, dy = fy - y0
    const d00 = depthBuffer[y0 * size + x0]
    const d10 = depthBuffer[y0 * size + x1]
    const d01 = depthBuffer[y1 * size + x0]
    const d11 = depthBuffer[y1 * size + x1]

    // If any neighbor is unfilled, fall back to nearest
    if (d00 === -Infinity || d10 === -Infinity || d01 === -Infinity || d11 === -Infinity) {
      const bx = Math.round(fx), by = Math.round(fy)
      if (bx < 0 || bx >= size || by < 0 || by >= size) return -Infinity
      return depthBuffer[by * size + bx]
    }

    return d00 * (1 - dx) * (1 - dy) + d10 * dx * (1 - dy) +
           d01 * (1 - dx) * dy + d11 * dx * dy
  }

  function isVisible(sx, sy, depth) {
    const bufDepth = sampleDepth(sx, sy)
    return depth >= bufDepth - epsilon
  }

  const result = []

  for (const { elevation, isIndex, projectedRings, projectedEdges } of projectedContours) {
    const segments = []

    // Process full rings
    for (const { points2D, depths } of projectedRings) {
      const visSegs = splitByVisibility(points2D, depths, isVisible)
      segments.push(...visSegs)
    }

    // Process edge segments
    for (const { points2D, depths } of projectedEdges) {
      const visSegs = splitByVisibility(points2D, depths, isVisible)
      segments.push(...visSegs)
    }

    if (segments.length > 0) {
      result.push({ elevation, isIndex, segments })
    }
  }

  return result
}

/**
 * Split a polyline into visible segments based on depth testing.
 * Bridges over small gaps (up to MAX_BRIDGE hidden vertices) to reduce
 * false breaks from depth buffer quantization.
 */
function splitByVisibility(points2D, depths, isVisible) {
  const n = points2D.length
  if (n < 2) return []

  const MAX_BRIDGE = 3 // Bridge gaps of up to this many hidden vertices

  // Pre-compute per-vertex visibility
  const vis = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    vis[i] = isVisible(points2D[i][0], points2D[i][1], depths[i]) ? 1 : 0
  }

  // Bridge small gaps: if a run of hidden vertices is <= MAX_BRIDGE
  // and has visible vertices on both sides, mark them as visible
  let i = 0
  while (i < n) {
    if (vis[i]) { i++; continue }
    // Found start of a hidden run
    let j = i
    while (j < n && !vis[j]) j++
    const gapLen = j - i
    if (gapLen <= MAX_BRIDGE && i > 0 && vis[i - 1] && j < n && vis[j]) {
      for (let k = i; k < j; k++) vis[k] = 1
    }
    i = j
  }

  // Build segments from visibility array
  const segments = []
  let current = null

  for (let k = 0; k < n; k++) {
    if (vis[k]) {
      if (!current) current = []
      current.push(points2D[k])
    } else {
      if (current && current.length >= 2) segments.push(current)
      current = null
    }
  }
  if (current && current.length >= 2) segments.push(current)

  return segments
}
