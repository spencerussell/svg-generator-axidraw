/**
 * Stage 6: SVG — convert visible 2D contour segments into plotter-ready SVG.
 *
 * Handles coordinate fitting, Catmull-Rom smoothing, stroke widths for
 * regular vs index contours, and label rendering.
 */

import { textToPathD } from '../../lib/strokeFont.js'

const NS = 'http://www.w3.org/2000/svg'

/**
 * Render projected (and optionally occluded) contours into an SVG element.
 *
 * @param {SVGElement} svgEl - Target SVG DOM element
 * @param {Array} visibleContours - Array of { elevation, isIndex, segments: [[sx,sy][], ...] }
 * @param {object} gridData - { summitX, summitY, summitElev, pixelSizeMeters, gridWidth, gridHeight }
 * @param {object} params - UI params (viewAngle, rotation, heightExaggeration, showLabel, showElevation, unit, doc)
 * @param {number} svgW - SVG viewport width in px
 * @param {number} svgH - SVG viewport height in px
 * @param {object} [location] - Location info for labels { shortName, state, country }
 * @param {Function} [projectPoint] - Optional projection function for summit label positioning
 */
export function renderSVG(svgEl, visibleContours, gridData, params, svgW, svgH, location, projectPoint, contentBBox) {
  // Use pre-computed bbox (from all projected contours before occlusion) if provided,
  // otherwise compute from visible segments only
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  function expandBBox(x, y) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }

  if (contentBBox) {
    minX = contentBBox.minX; maxX = contentBBox.maxX
    minY = contentBBox.minY; maxY = contentBBox.maxY
  } else {
    for (const { segments } of visibleContours) {
      for (const seg of segments) {
        for (const [x, y] of seg) expandBBox(x, y)
      }
    }
  }

  // Include summit projection in bbox if available
  if (projectPoint && gridData.summitX != null) {
    const p = projectPoint(gridData.summitX, gridData.summitY, gridData.summitElev)
    expandBBox(p.sx, p.sy)
  }

  if (minX === Infinity) { svgEl.innerHTML = ''; return }

  // Auto-fit to viewport
  const pad = Math.max(32, Math.min(svgW, svgH) * 0.06)
  let labelReserve = 0
  if (params.showLabel && location) {
    const pxPerMM = svgH / (params.doc?.h_mm || svgH)
    const PT = 25.4 / 72
    const bottomMM = Math.min(12, (params.doc?.h_mm || 215.9) * 0.06)
    let reserveMM = 8 * PT + 2 + bottomMM + 4
    if (params.showState !== false) reserveMM += 5 * PT + 2
    if (params.showElevation) reserveMM += 5 * PT + 2
    labelReserve = reserveMM * pxPerMM
  }

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const availH = svgH - labelReserve
  const scale = Math.min((svgW - 2 * pad) / rangeX, (availH - 2 * pad) / rangeY)
  const tx = (svgW - rangeX * scale) / 2 - minX * scale
  const ty = (availH - rangeY * scale) / 2 - minY * scale

  function toSVG(x, y) {
    return [x * scale + tx, y * scale + ty]
  }

  svgEl.innerHTML = ''
  svgEl.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`)
  svgEl.setAttribute('width', String(svgW))
  svgEl.setAttribute('height', String(svgH))

  const g = document.createElementNS(NS, 'g')
  const strokeW = String(params.strokeWidth ?? 0.5)

  // Draw contours sorted by elevation (already sorted from pipeline)
  for (const { segments } of visibleContours) {
    for (const seg of segments) {
      if (seg.length < 2) continue
      const path = document.createElementNS(NS, 'path')
      path.setAttribute('d', smoothPathD(seg, toSVG))
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', '#000')
      path.setAttribute('stroke-width', strokeW)
      path.setAttribute('stroke-linejoin', 'round')
      g.appendChild(path)
    }
  }

  // Labels
  if (params.showLabel && location) {
    renderLabels(g, params, location, gridData.summitElev, svgW, svgH)
  }

  svgEl.appendChild(g)
}

/**
 * Render with painter's algorithm (fallback when HLR is disabled).
 * Uses white fills to occlude far-side contours, same as the original approach.
 */
export function renderSVGPainter(svgEl, projectedContours, gridData, params, svgW, svgH, location, projectPoint) {
  // Compute bounding box including Catmull-Rom overshoot
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  function expandBBox(x, y) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }

  for (const { projectedRings, projectedEdges } of projectedContours) {
    for (const { points2D } of projectedRings) {
      for (const [x, y] of points2D) expandBBox(x, y)
    }
    for (const { points2D } of projectedEdges) {
      for (const [x, y] of points2D) expandBBox(x, y)
    }
  }

  if (projectPoint && gridData.summitX != null) {
    const p = projectPoint(gridData.summitX, gridData.summitY, gridData.summitElev)
    expandBBox(p.sx, p.sy)
  }

  if (minX === Infinity) { svgEl.innerHTML = ''; return }

  const pad = Math.max(32, Math.min(svgW, svgH) * 0.06)
  let labelReserve = 0
  if (params.showLabel && location) {
    const pxPerMM = svgH / (params.doc?.h_mm || svgH)
    const PT = 25.4 / 72
    const bottomMM = Math.min(12, (params.doc?.h_mm || 215.9) * 0.06)
    let reserveMM = 8 * PT + 2 + bottomMM + 4
    if (params.showState !== false) reserveMM += 5 * PT + 2
    if (params.showElevation) reserveMM += 5 * PT + 2
    labelReserve = reserveMM * pxPerMM
  }

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const availH = svgH - labelReserve
  const scale = Math.min((svgW - 2 * pad) / rangeX, (availH - 2 * pad) / rangeY)
  const tx = (svgW - rangeX * scale) / 2 - minX * scale
  const ty = (availH - rangeY * scale) / 2 - minY * scale

  function toSVG(x, y) {
    return [x * scale + tx, y * scale + ty]
  }

  svgEl.innerHTML = ''
  svgEl.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`)
  svgEl.setAttribute('width', String(svgW))
  svgEl.setAttribute('height', String(svgH))

  const g = document.createElementNS(NS, 'g')
  const strokeW = String(params.strokeWidth ?? 0.5)

  // White base from lowest ring
  if (projectedContours.length > 0) {
    for (const { points2D } of projectedContours[0].projectedRings) {
      if (points2D.length < 2) continue
      const bg = document.createElementNS(NS, 'path')
      bg.setAttribute('d', closedPathD(points2D, toSVG))
      bg.setAttribute('fill', '#fff')
      bg.setAttribute('stroke', 'none')
      g.appendChild(bg)
    }
  }

  // Draw rings low→high with painter's algorithm
  for (const { projectedRings, projectedEdges } of projectedContours) {
    // White fill for occlusion
    for (const { points2D } of projectedRings) {
      if (points2D.length < 2) continue
      const fill = document.createElementNS(NS, 'path')
      fill.setAttribute('d', closedPathD(points2D, toSVG))
      fill.setAttribute('fill', '#fff')
      fill.setAttribute('stroke', 'none')
      g.appendChild(fill)
    }

    // Near-side strokes only
    for (const { points2D, depths } of projectedRings) {
      if (points2D.length < 2) continue
      const pts3 = points2D.map(([x, y], i) => [x, y, depths[i]])
      const visSegs = extractVisibleSegments(pts3, true)
      for (const seg of visSegs) {
        const seg2D = seg.map(([x, y]) => [x, y])
        const path = document.createElementNS(NS, 'path')
        path.setAttribute('d', smoothPathD(seg2D, toSVG))
        path.setAttribute('fill', 'none')
        path.setAttribute('stroke', '#000')
        path.setAttribute('stroke-width', strokeW)
        path.setAttribute('stroke-linejoin', 'round')
        g.appendChild(path)
      }
    }

    // Edge segments
    for (const { points2D, depths } of projectedEdges) {
      if (points2D.length < 2) continue
      const pts3 = points2D.map(([x, y], i) => [x, y, depths[i]])
      const visSegs = extractVisibleSegments(pts3, false)
      for (const seg of visSegs) {
        const seg2D = seg.map(([x, y]) => [x, y])
        const path = document.createElementNS(NS, 'path')
        path.setAttribute('d', smoothPathD(seg2D, toSVG))
        path.setAttribute('fill', 'none')
        path.setAttribute('stroke', '#000')
        path.setAttribute('stroke-width', strokeW)
        path.setAttribute('stroke-linejoin', 'round')
        g.appendChild(path)
      }
    }
  }

  if (params.showLabel && location) {
    renderLabels(g, params, location, gridData.summitElev, svgW, svgH)
  }

  svgEl.appendChild(g)
}

/**
 * Serialize SVG element for download with physical dimensions.
 */
export function exportSVG(svgEl, docW_mm, docH_mm) {
  const clone = svgEl.cloneNode(true)
  clone.setAttribute('xmlns', NS)
  clone.setAttribute('width', docW_mm.toFixed(3) + 'mm')
  clone.setAttribute('height', docH_mm.toFixed(3) + 'mm')
  return new XMLSerializer().serializeToString(clone)
}

// ---------------------------------------------------------------------------
// Path generation helpers
// ---------------------------------------------------------------------------

/**
 * Generate a smooth SVG path for an open polyline using Catmull-Rom splines.
 */
function smoothPathD(pts, toSVG) {
  if (pts.length < 2) return ''
  const svgPts = pts.map(([x, y]) => toSVG(x, y))
  const n = svgPts.length

  if (n === 2) {
    return `M${svgPts[0][0].toFixed(1)},${svgPts[0][1].toFixed(1)}L${svgPts[1][0].toFixed(1)},${svgPts[1][1].toFixed(1)}`
  }

  let d = `M${svgPts[0][0].toFixed(1)},${svgPts[0][1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? svgPts[i - 1]
      : [2 * svgPts[0][0] - svgPts[1][0], 2 * svgPts[0][1] - svgPts[1][1]]
    const p1 = svgPts[i]
    const p2 = svgPts[i + 1]
    const p3 = i + 2 < n ? svgPts[i + 2]
      : [2 * svgPts[n - 1][0] - svgPts[n - 2][0], 2 * svgPts[n - 1][1] - svgPts[n - 2][1]]

    const { t1, t2 } = adaptiveTension(p0, p1, p2, p3)

    const cp1x = p1[0] + (p2[0] - p0[0]) * t1
    const cp1y = p1[1] + (p2[1] - p0[1]) * t1
    const cp2x = p2[0] - (p3[0] - p1[0]) * t2
    const cp2y = p2[1] - (p3[1] - p1[1]) * t2

    d += `C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/**
 * Generate a closed Catmull-Rom SVG path for a contour ring.
 */
function closedPathD(pts, toSVG) {
  if (pts.length < 2) return ''
  const svgPts = pts.map(([x, y]) => toSVG(x, y))

  // Strip closing duplicate
  const last = svgPts[svgPts.length - 1]
  const first = svgPts[0]
  const isClosed = svgPts.length > 2 &&
    Math.abs(first[0] - last[0]) < 0.05 && Math.abs(first[1] - last[1]) < 0.05
  const pts2d = isClosed ? svgPts.slice(0, -1) : svgPts
  const n = pts2d.length

  if (n >= 3) {
    let d = `M${pts2d[0][0].toFixed(1)},${pts2d[0][1].toFixed(1)}`
    for (let i = 0; i < n; i++) {
      const p0 = pts2d[(i - 1 + n) % n]
      const p1 = pts2d[i]
      const p2 = pts2d[(i + 1) % n]
      const p3 = pts2d[(i + 2) % n]

      const { t1, t2 } = adaptiveTension(p0, p1, p2, p3)

      const cp1x = p1[0] + (p2[0] - p0[0]) * t1
      const cp1y = p1[1] + (p2[1] - p0[1]) * t1
      const cp2x = p2[0] - (p3[0] - p1[0]) * t2
      const cp2y = p2[1] - (p3[1] - p1[1]) * t2

      d += `C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
    }
    return d + 'Z'
  }

  // Fallback for very small rings
  return svgPts.map(([x, y], i) =>
    `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  ).join('') + 'Z'
}

/**
 * Adaptive tension for Catmull-Rom: sharp angles get less smoothing.
 */
function adaptiveTension(p0, p1, p2, p3) {
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

  return { t1, t2 }
}

/**
 * Extract near-side (viewer-facing) portions of a projected contour path.
 * Each point is [screenX, screenY, depth] where positive depth = near side.
 */
function extractVisibleSegments(pts, isClosed) {
  const n = pts.length
  if (n < 2) return []

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

  if (!isClosed && current && current.length >= 2) segments.push(current)
  if (isClosed && current && current.length >= 2) {
    if (segments.length > 0 && isVis(ring[0])) {
      segments[0] = [...current, ...segments[0].slice(1)]
    } else {
      segments.push(current)
    }
  }

  return segments.filter(s => s.length >= 2)
}

/**
 * Render label text as single-stroke paths.
 */
function renderLabels(g, params, location, summitElev, svgW, svgH) {
  const pxPerMM = svgH / (params.doc?.h_mm || svgH)
  const PT = 25.4 / 72
  const bottomMM = Math.min(25, (params.doc?.h_mm || 215.9) * 0.12)

  const nameCapH = 10 * PT * pxPerMM
  const stateCapH = 6 * PT * pxPerMM
  const elevCapH = 6 * PT * pxPerMM

  let bottomY = svgH - bottomMM * pxPerMM
  let stateBaseline = null
  if (params.showState !== false) {
    stateBaseline = bottomY
    bottomY -= stateCapH + 2 * pxPerMM
  }
  let elevBaseline = null
  if (params.showElevation) {
    elevBaseline = bottomY
    bottomY -= elevCapH + 2 * pxPerMM
  }
  const nameBaseline = bottomY

  const centerX = svgW / 2
  const mountainName = (location.shortName || '').toUpperCase()
  const stateName = (location.state || location.country || '').toUpperCase()

  let elevText = null
  if (params.showElevation && summitElev != null) {
    const elevVal = params.unit === 'ft' ? Math.round(summitElev * 3.28084) : Math.round(summitElev)
    const formatted = String(elevVal).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const suffix = params.unit === 'ft' ? "'" : ' M'
    elevText = `ELEV. ${formatted}${suffix}`
  }

  const labels = [[mountainName, nameBaseline, nameCapH]]
  if (elevText) labels.push([elevText, elevBaseline, elevCapH])
  if (stateBaseline) labels.push([stateName, stateBaseline, stateCapH])

  for (const [text, baseline, capH] of labels) {
    if (!text) continue
    const d = textToPathD(text, centerX, baseline, capH)
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
