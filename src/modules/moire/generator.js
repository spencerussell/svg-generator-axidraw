import { applyNoiseDistortion } from '../../lib/noise.js'

// ---- Pattern generators ----
// Each returns an array of polylines; each polyline = [[x,y], ...]
// Every polyline is one continuous pen-down stroke.

function concentricCircles(cx, cy, count, scale, amplitude, frequency) {
  const lines = []
  const maxR = 200 * scale
  for (let i = 1; i <= count; i++) {
    const r = (maxR / count) * i
    const pts = []
    const steps = Math.max(72, Math.round(r * 1.5))
    for (let j = 0; j <= steps; j++) {
      const angle = (j / steps) * Math.PI * 2
      const warp = amplitude ? amplitude * Math.sin(frequency * angle) : 0
      const rr = r + warp
      pts.push([cx + rr * Math.cos(angle), cy + rr * Math.sin(angle)])
    }
    lines.push(pts)
  }
  return lines
}

function radialLines(cx, cy, count, scale, amplitude, frequency) {
  const lines = []
  const maxR = 200 * scale
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const pts = []
    const steps = 100
    for (let j = 0; j <= steps; j++) {
      const t = j / steps
      const r = maxR * t
      const warp = amplitude ? amplitude * Math.sin(frequency * t * Math.PI * 2) : 0
      const a = angle + warp * 0.01
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    lines.push(pts)
  }
  return lines
}

function spiral(cx, cy, count, scale, amplitude, frequency) {
  const maxR = 200 * scale
  const turns = count * 0.4
  const totalSteps = Math.round(turns * 250)
  const pts = []
  for (let j = 0; j <= totalSteps; j++) {
    const t = j / totalSteps
    const angle = t * turns * Math.PI * 2
    const r = maxR * t
    const warp = amplitude ? amplitude * Math.sin(frequency * angle) : 0
    pts.push([cx + (r + warp) * Math.cos(angle), cy + (r + warp) * Math.sin(angle)])
  }
  return [pts]
}

function waveLines(cx, cy, count, scale, amplitude, frequency) {
  const lines = []
  const size = 200 * scale
  const amp = amplitude || 5
  for (let i = 0; i < count; i++) {
    const y0 = cy - size + (2 * size / count) * i
    const pts = []
    const steps = 250
    for (let j = 0; j <= steps; j++) {
      const t = j / steps
      const x = cx - size + 2 * size * t
      const y = y0 + amp * Math.sin(frequency * t * Math.PI * 2)
      pts.push([x, y])
    }
    lines.push(pts)
  }
  return lines
}

function gridLines(cx, cy, count, scale, amplitude, frequency) {
  const lines = []
  const size = 200 * scale
  for (let i = 0; i < count; i++) {
    const y0 = cy - size + (2 * size / (count - 1)) * i
    const pts = []
    const steps = 200
    for (let j = 0; j <= steps; j++) {
      const t = j / steps
      const x = cx - size + 2 * size * t
      const warp = amplitude ? amplitude * Math.sin(frequency * t * Math.PI * 2) : 0
      pts.push([x, y0 + warp])
    }
    lines.push(pts)
  }
  for (let i = 0; i < count; i++) {
    const x0 = cx - size + (2 * size / (count - 1)) * i
    const pts = []
    const steps = 200
    for (let j = 0; j <= steps; j++) {
      const t = j / steps
      const y = cy - size + 2 * size * t
      const warp = amplitude ? amplitude * Math.sin(frequency * t * Math.PI * 2) : 0
      pts.push([x0 + warp, y])
    }
    lines.push(pts)
  }
  return lines
}

function generateLayer(type, cx, cy, count, rotation, scale, amplitude, frequency) {
  let lines
  switch (type) {
    case 'concentric-circles': lines = concentricCircles(cx, cy, count, scale, amplitude, frequency); break
    case 'radial-lines':       lines = radialLines(cx, cy, count, scale, amplitude, frequency); break
    case 'spiral':             lines = spiral(cx, cy, count, scale, amplitude, frequency); break
    case 'wave-lines':         lines = waveLines(cx, cy, count, scale, amplitude, frequency); break
    case 'grid':               lines = gridLines(cx, cy, count, scale, amplitude, frequency); break
    default:                   lines = concentricCircles(cx, cy, count, scale, amplitude, frequency)
  }

  if (rotation !== 0) {
    const rad = rotation * Math.PI / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    lines = lines.map(pts => pts.map(([x, y]) => {
      const dx = x - cx, dy = y - cy
      return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
    }))
  }
  return lines
}

// ---- Polyline to SVG path ----
function polylineToPath(pts) {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`
  for (let i = 1; i < pts.length; i++) {
    d += `L${pts[i][0].toFixed(2)},${pts[i][1].toFixed(2)}`
  }
  return d
}

// ---- Nearest-neighbor reorder to minimize pen-up travel ----
function reorderPaths(allLines) {
  if (allLines.length <= 1) return allLines

  const used = new Array(allLines.length).fill(false)
  const result = []

  used[0] = true
  result.push(allLines[0])

  for (let n = 1; n < allLines.length; n++) {
    const lastPath = result[result.length - 1]
    const end = lastPath[lastPath.length - 1]
    let bestIdx = -1, bestDist = Infinity, bestReverse = false

    for (let i = 0; i < allLines.length; i++) {
      if (used[i]) continue
      const line = allLines[i]
      const dStart = Math.hypot(end[0] - line[0][0], end[1] - line[0][1])
      const dEnd   = Math.hypot(end[0] - line[line.length - 1][0], end[1] - line[line.length - 1][1])
      if (dStart < bestDist) { bestDist = dStart; bestIdx = i; bestReverse = false }
      if (dEnd   < bestDist) { bestDist = dEnd;   bestIdx = i; bestReverse = true  }
    }

    if (bestIdx === -1) break
    used[bestIdx] = true
    result.push(bestReverse ? [...allLines[bestIdx]].reverse() : allLines[bestIdx])
  }
  return result
}

// ---- Clip polyline to circle ----
function clipPolylineToCircle(pts, cx, cy, r) {
  const segments = []
  let current = []

  const isInside = p => Math.hypot(p[0] - cx, p[1] - cy) <= r

  function intersectCircle(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const fx = a[0] - cx,   fy = a[1] - cy
    const A = dx * dx + dy * dy
    const B = 2 * (fx * dx + fy * dy)
    const C = fx * fx + fy * fy - r * r
    const disc = B * B - 4 * A * C
    if (disc < 0) return null
    const sqrtDisc = Math.sqrt(disc)
    for (const t of [(-B - sqrtDisc) / (2 * A), (-B + sqrtDisc) / (2 * A)]) {
      if (t >= 0 && t <= 1) return [a[0] + t * dx, a[1] + t * dy]
    }
    return null
  }

  for (let i = 0; i < pts.length; i++) {
    const pIn = isInside(pts[i])
    if (i > 0) {
      const prevIn = isInside(pts[i - 1])
      if (prevIn && !pIn) {
        const bp = intersectCircle(pts[i - 1], pts[i])
        if (bp) current.push(bp)
        if (current.length >= 2) segments.push(current)
        current = []
        continue
      }
      if (!prevIn && pIn) {
        const bp = intersectCircle(pts[i - 1], pts[i])
        current = bp ? [bp] : []
      }
    }
    if (pIn) current.push(pts[i])
  }
  if (current.length >= 2) segments.push(current)
  return segments
}

// ---- Clip polyline to rectangle (Liang-Barsky) ----
function clipPolylineToRect(pts, rx0, ry0, rx1, ry1) {
  const segments = []
  let current = []

  const isInside = p => p[0] >= rx0 && p[0] <= rx1 && p[1] >= ry0 && p[1] <= ry1

  function intersectSegment(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const p = [-dx, dx, -dy, dy]
    const q = [a[0] - rx0, rx1 - a[0], a[1] - ry0, ry1 - a[1]]
    let t0 = 0, t1 = 1
    for (let k = 0; k < 4; k++) {
      if (Math.abs(p[k]) < 1e-10) {
        if (q[k] < 0) return null
      } else {
        const t = q[k] / p[k]
        if (p[k] < 0) t0 = Math.max(t0, t)
        else           t1 = Math.min(t1, t)
      }
    }
    if (t0 > t1 + 1e-10) return null
    return {
      enter: [a[0] + t0 * dx, a[1] + t0 * dy],
      exit:  [a[0] + t1 * dx, a[1] + t1 * dy],
    }
  }

  for (let i = 0; i < pts.length; i++) {
    const pIn = isInside(pts[i])
    if (i > 0) {
      const prevIn = isInside(pts[i - 1])
      if (prevIn && !pIn) {
        const cl = intersectSegment(pts[i - 1], pts[i])
        if (cl) current.push(cl.exit)
        if (current.length >= 2) segments.push(current)
        current = []
        continue
      }
      if (!prevIn && pIn) {
        const cl = intersectSegment(pts[i - 1], pts[i])
        current = cl ? [cl.enter] : []
      }
    }
    if (pIn) current.push(pts[i])
  }
  if (current.length >= 2) segments.push(current)
  return segments
}

// ---- Main render function ----
// Writes directly into the provided SVG element.
// Returns { pathCount, pointCount } for stats display.
export function renderMoire(params, svgEl, availW, availH) {
  const { layerA, layerB, global: glob, crop, doc } = params
  const type = params.patternType

  const docW = doc.w_mm
  const docH = doc.h_mm

  // Art canvas is a square covering the larger dimension
  const canvasSize = Math.max(docW, docH)
  const half = canvasSize / 2
  const s = canvasSize / 400  // coordinate scale factor

  const cxA = layerA.cx * s
  const cyA = layerA.cy * s
  const cxB = layerB.cx * s
  const cyB = layerB.cy * s

  const amp  = glob.amplitude * s
  const freq = glob.frequency

  const linesA = generateLayer(type, half + cxA, half + cyA, layerA.count, layerA.rot, layerA.scale * s, amp, freq)
  const linesB = generateLayer(type, half + cxB, half + cyB, layerB.count, layerB.rot, layerB.scale * s, amp, freq)

  let allLines = [...linesA, ...linesB]

  // Noise distortion (applied before crop so boundaries stay clean)
  if (params.noise) {
    allLines = applyNoiseDistortion(allLines, params.noise)
  }

  // Art crop
  if (crop.type !== 'none') {
    const artOffX = (docW - canvasSize) / 2
    const artOffY = (docH - canvasSize) / 2
    const cX0 = crop.margin_mm - artOffX
    const cY0 = crop.margin_mm - artOffY
    const cX1 = docW - crop.margin_mm - artOffX
    const cY1 = docH - crop.margin_mm - artOffY
    const cW = cX1 - cX0
    const cH = cY1 - cY0
    let clipped = []

    if (crop.type === 'circle') {
      const clipR  = Math.min(cW, cH) / 2
      const clipCX = (cX0 + cX1) / 2
      const clipCY = (cY0 + cY1) / 2
      allLines.forEach(pts => clipped.push(...clipPolylineToCircle(pts, clipCX, clipCY, clipR)))
    } else if (crop.type === 'square') {
      const side = Math.min(cW, cH)
      const sx0 = (cX0 + cX1) / 2 - side / 2
      const sy0 = (cY0 + cY1) / 2 - side / 2
      allLines.forEach(pts => clipped.push(...clipPolylineToRect(pts, sx0, sy0, sx0 + side, sy0 + side)))
    } else {
      allLines.forEach(pts => clipped.push(...clipPolylineToRect(pts, cX0, cY0, cX1, cY1)))
    }
    allLines = clipped
  }

  const ordered = reorderPaths(allLines)

  // Build path elements
  const strokeW = glob.strokeWidth
  let pathsHTML = ''
  let totalPoints = 0
  ordered.forEach(pts => {
    totalPoints += pts.length
    const d = polylineToPath(pts)
    if (d) {
      pathsHTML += `<path d="${d}" fill="none" stroke="black" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round"/>\n`
    }
  })

  // Size SVG to fit available preview area
  const dScale  = Math.min(availW / docW, availH / docH)
  const offsetX = ((docW - canvasSize) / 2).toFixed(3)
  const offsetY = ((docH - canvasSize) / 2).toFixed(3)

  svgEl.setAttribute('width',   Math.round(docW * dScale) + 'px')
  svgEl.setAttribute('height',  Math.round(docH * dScale) + 'px')
  svgEl.setAttribute('viewBox', `0 0 ${docW.toFixed(3)} ${docH.toFixed(3)}`)
  svgEl.innerHTML = `<g transform="translate(${offsetX},${offsetY})">${pathsHTML}</g>`

  return { pathCount: ordered.length, pointCount: totalPoints }
}

// ---- Export SVG with physical mm dimensions ----
export function exportSVG(svgEl, docW_mm, docH_mm) {
  const prevW = svgEl.getAttribute('width')
  const prevH = svgEl.getAttribute('height')
  svgEl.setAttribute('width',  docW_mm.toFixed(3) + 'mm')
  svgEl.setAttribute('height', docH_mm.toFixed(3) + 'mm')

  const serializer = new XMLSerializer()
  let source = serializer.serializeToString(svgEl)

  svgEl.setAttribute('width',  prevW)
  svgEl.setAttribute('height', prevH)

  if (!source.match(/^<\?xml/)) {
    source = '<?xml version="1.0" encoding="UTF-8"?>\n' + source
  }
  if (!source.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  return source
}

// ---- Format params as readable .txt ----
export function paramsToText(params, filename) {
  const { layerA, layerB, global: glob, crop, doc } = params
  const unit = doc.unit
  const factor = { mm: 1, cm: 10, in: 25.4 }[unit] || 1
  const dp = unit === 'mm' ? 1 : 3
  const fmt = mm => (mm / factor).toFixed(dp) + ' ' + unit
  const patternLabels = {
    'concentric-circles': 'Concentric Circles',
    'radial-lines':       'Radial Lines',
    'spiral':             'Spiral',
    'wave-lines':         'Wave Lines',
    'grid':               'Grid Lines',
  }
  return [
    'Moiré SVG Generator — Parameter Settings',
    `File: ${filename}`,
    `Date: ${new Date().toLocaleString()}`,
    '',
    `Pattern Type:    ${patternLabels[params.patternType] || params.patternType}`,
    '',
    'Document:',
    `  Width:             ${fmt(doc.w_mm)}`,
    `  Height:            ${fmt(doc.h_mm)}`,
    '',
    'Layer A:',
    `  Line Count:        ${layerA.count}`,
    `  Center X Offset:   ${layerA.cx}`,
    `  Center Y Offset:   ${layerA.cy}`,
    `  Rotation:          ${layerA.rot}°`,
    `  Scale:             ${layerA.scale}`,
    '',
    'Layer B:',
    `  Line Count:        ${layerB.count}`,
    `  Center X Offset:   ${layerB.cx}`,
    `  Center Y Offset:   ${layerB.cy}`,
    `  Rotation:          ${layerB.rot}°`,
    `  Scale:             ${layerB.scale}`,
    '',
    'Global:',
    `  Stroke Width:      ${glob.strokeWidth}`,
    `  Wave Amplitude:    ${glob.amplitude}`,
    `  Wave Frequency:    ${glob.frequency}`,
    `  Crop:              ${crop.type}`,
    `  Crop Margin:       ${fmt(crop.margin_mm)}`,
  ].join('\n')
}
