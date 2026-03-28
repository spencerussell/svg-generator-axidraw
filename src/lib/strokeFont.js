// EMSSpaceRocks single-stroke font for pen plotter SVG output
// Based on Ed Logg's Asteroids font, created by Trammell Hudson
// Source: https://gitlab.com/oskay/svg-fonts
//
// Coordinates in raw data: y=0 baseline, y increases upward (SVG font convention)
// Parsed into internal format: y=0 cap top, y=CAP baseline, y increases downward

const CAP = 558.55  // glyph cap height in font units
const KERN = 30     // inter-character spacing in font units

// Raw SVG path data — y=0 is baseline, y=558.55 is cap top
const RAW = {
  ' ':  { w: 512, d: '' },
  'A':  { w: 512, d: 'M 0 0 L 0 372.36 L 186.18 558.55 L 372.36 372.36 L 372.36 0 M 0 186.18 L 372.36 186.18' },
  'B':  { w: 512, d: 'M 0 0 L 0 558.55 L 186.18 558.55 L 372.36 465.45 L 186.18 279.27 L 372.36 93.09 L 186.18 0 L 0 0' },
  'C':  { w: 512, d: 'M 372.36 0 L 0 0 L 0 558.55 L 372.36 558.55' },
  'D':  { w: 512, d: 'M 0 0 L 0 558.55 L 186.18 558.55 L 372.36 372.36 L 372.36 186.18 L 186.18 0 L 0 0' },
  'E':  { w: 512, d: 'M 372.36 0 L 0 0 L 0 558.55 L 372.36 558.55 M 0 279.27 L 279.27 279.27' },
  'F':  { w: 512, d: 'M 0 0 L 0 558.55 L 372.36 558.55 M 0 279.27 L 279.27 279.27' },
  'G':  { w: 512, d: 'M 279.27 279.27 L 372.36 186.18 L 372.36 0 L 0 0 L 0 558.55 L 372.36 558.55' },
  'H':  { w: 512, d: 'M 0 0 L 0 558.55 M 0 279.27 L 372.36 279.27 M 372.36 558.55 L 372.36 0' },
  'I':  { w: 512, d: 'M 0 0 L 372.36 0 M 186.18 0 L 186.18 558.55 M 0 558.55 L 372.36 558.55' },
  'J':  { w: 512, d: 'M 0 186.18 L 186.18 0 L 372.36 0 L 372.36 558.55' },
  'K':  { w: 512, d: 'M 0 0 L 0 558.55 M 372.36 558.55 L 0 279.27 L 279.27 0' },
  'L':  { w: 512, d: 'M 372.36 0 L 0 0 L 0 558.55' },
  'M':  { w: 512, d: 'M 0 0 L 0 558.55 L 186.18 372.36 L 372.36 558.55 L 372.36 0' },
  'N':  { w: 512, d: 'M 0 0 L 0 558.55 L 372.36 0 L 372.36 558.55' },
  'O':  { w: 512, d: 'M 0 0 L 0 558.55 L 372.36 558.55 L 372.36 0 L 0 0' },
  'P':  { w: 512, d: 'M 0 0 L 0 558.55 L 372.36 558.55 L 372.36 279.27 L 0 232.73' },
  'Q':  { w: 512, d: 'M 0 0 L 0 558.55 L 372.36 558.55 L 372.36 186.18 L 0 0 M 186.18 186.18 L 372.36 0' },
  'R':  { w: 512, d: 'M 0 0 L 0 558.55 L 372.36 558.55 L 372.36 279.27 L 0 232.73 M 186.18 232.73 L 372.36 0' },
  'S':  { w: 512, d: 'M 0 93.09 L 93.09 0 L 372.36 0 L 372.36 232.73 L 0 325.82 L 0 558.55 L 279.27 558.55 L 372.36 465.45' },
  'T':  { w: 512, d: 'M 0 558.55 L 372.36 558.55 M 186.18 558.55 L 186.18 0' },
  'U':  { w: 512, d: 'M 0 558.55 L 0 93.09 L 186.18 0 L 372.36 93.09 L 372.36 558.55' },
  'V':  { w: 512, d: 'M 0 558.55 L 186.18 0 L 372.36 558.55' },
  'W':  { w: 512, d: 'M 0 558.55 L 93.09 0 L 186.18 186.18 L 279.27 0 L 372.36 558.55' },
  'X':  { w: 512, d: 'M 0 0 L 372.36 558.55 M 0 558.55 L 372.36 0' },
  'Y':  { w: 512, d: 'M 0 558.55 L 186.18 279.27 L 372.36 558.55 M 186.18 279.27 L 186.18 0' },
  'Z':  { w: 512, d: 'M 0 558.55 L 372.36 558.55 L 0 0 L 372.36 0 M 93.09 279.27 L 279.27 279.27' },
  '0':  { w: 512, d: 'M 0 0 L 372.36 0 L 372.36 558.55 L 0 558.55 L 0 0 L 372.36 558.55' },
  '1':  { w: 512, d: 'M 186.18 0 L 186.18 558.55 L 139.64 465.45' },
  '2':  { w: 512, d: 'M 0 558.55 L 372.36 558.55 L 372.36 325.82 L 0 232.73 L 0 0 L 372.36 0' },
  '3':  { w: 512, d: 'M 0 558.55 L 372.36 558.55 L 372.36 0 L 0 0 M 0 279.27 L 372.36 279.27' },
  '4':  { w: 512, d: 'M 0 558.55 L 0 279.27 L 372.36 279.27 M 372.36 558.55 L 372.36 0' },
  '5':  { w: 512, d: 'M 0 0 L 372.36 0 L 372.36 279.27 L 0 325.82 L 0 558.55 L 372.36 558.55' },
  '6':  { w: 512, d: 'M 0 558.55 L 0 0 L 372.36 0 L 372.36 232.73 L 0 325.82' },
  '7':  { w: 512, d: 'M 0 558.55 L 372.36 558.55 L 372.36 279.27 L 186.18 0' },
  '8':  { w: 512, d: 'M 0 0 L 372.36 0 L 372.36 558.55 L 0 558.55 L 0 0 M 0 279.27 L 372.36 279.27' },
  '9':  { w: 512, d: 'M 372.36 0 L 372.36 558.55 L 0 558.55 L 0 325.82 L 372.36 232.73' },
  '.':  { w: 512, d: 'M 139.64 0 L 186.18 0' },
  ',':  { w: 512, d: 'M 93.09 0 L 186.18 93.09' },
  '-':  { w: 512, d: 'M 93.09 279.27 L 279.27 279.27' },
  '+':  { w: 512, d: 'M 46.55 279.27 L 325.82 279.27 M 186.18 418.91 L 186.18 139.64' },
  "'":  { w: 512, d: 'M 93.09 279.27 L 279.27 465.45' },
  '!':  { w: 512, d: 'M 186.18 0 L 139.64 93.09 L 232.73 93.09 L 186.18 0 M 186.18 186.18 L 186.18 558.55' },
  '?':  { w: 512, d: 'M 0 372.36 L 186.18 558.55 L 372.36 372.36 L 186.18 186.18 M 186.18 46.55 L 186.18 0' },
  '/':  { w: 512, d: 'M 0 0 L 372.36 558.55' },
  ':':  { w: 512, d: 'M 186.18 418.91 L 186.18 325.82 M 186.18 232.73 L 186.18 139.64' },
  '#':  { w: 512, d: 'M 0 186.18 L 372.36 186.18 L 279.27 93.09 L 279.27 465.45 L 372.36 372.36 L 0 372.36 L 93.09 465.45 L 93.09 93.09' },
  '"':  { w: 512, d: 'M 93.09 465.45 L 93.09 279.27 M 279.27 465.45 L 279.27 279.27' },
}

// ---------------------------------------------------------------------------
// Parse raw SVG path data into stroke arrays, flipping y to top-down
// ---------------------------------------------------------------------------
function parsePath(d) {
  if (!d) return []
  const strokes = []
  let current = null
  const parts = d.trim().split(/\s+/)
  let i = 0
  while (i < parts.length) {
    const cmd = parts[i]
    if (cmd === 'M' || cmd === 'L') {
      const x = parseFloat(parts[i + 1])
      const y = CAP - parseFloat(parts[i + 2])  // flip y: top-down
      if (cmd === 'M') {
        current = [[x, y]]
        strokes.push(current)
      } else if (current) {
        current.push([x, y])
      }
      i += 3
    } else {
      i++
    }
  }
  return strokes
}

// Build glyph lookup (uppercase + lowercase alias)
const G = {}
for (const [ch, { w, d }] of Object.entries(RAW)) {
  G[ch] = { w, s: parsePath(d) }
}
// Lowercase aliases — font is single-case
for (let c = 65; c <= 90; c++) {
  const upper = String.fromCharCode(c)
  const lower = String.fromCharCode(c + 32)
  if (G[upper] && !G[lower]) G[lower] = G[upper]
}

/**
 * Convert text to SVG path data (single-stroke linework for pen plotters).
 * @param {string} text
 * @param {number} centerX - horizontal center in SVG units
 * @param {number} baselineY - baseline position in SVG units
 * @param {number} capHeight - desired cap height in SVG units
 * @returns {string} SVG path `d` attribute value
 */
export function textToPathD(text, centerX, baselineY, capHeight) {
  const sc = capHeight / CAP

  const glyphs = []
  for (const ch of text) {
    const g = G[ch]
    if (g) glyphs.push(g)
  }
  if (glyphs.length === 0) return ''

  let totalW = 0
  for (const g of glyphs) totalW += g.w
  totalW = (totalW + KERN * (glyphs.length - 1)) * sc

  let x = centerX - totalW / 2
  let d = ''
  for (const g of glyphs) {
    for (const stroke of g.s) {
      for (let i = 0; i < stroke.length; i++) {
        const px = x + stroke[i][0] * sc
        const py = baselineY - (CAP - stroke[i][1]) * sc
        d += `${i === 0 ? 'M' : 'L'}${px.toFixed(2)},${py.toFixed(2)}`
      }
    }
    x += (g.w + KERN) * sc
  }
  return d
}
