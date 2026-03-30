import { jsPDF } from 'jspdf'
import 'svg2pdf.js'

/**
 * Convert an SVG element to a PDF blob, preserving vector paths.
 * @param {SVGSVGElement} svgEl - The SVG element to export
 * @param {number} w_mm - Document width in millimeters
 * @param {number} h_mm - Document height in millimeters
 * @returns {Promise<Blob>} PDF blob
 */
export async function svgToPdf(svgEl, w_mm, h_mm) {
  const orientation = w_mm > h_mm ? 'landscape' : 'portrait'
  const doc = new jsPDF({ orientation, unit: 'mm', format: [w_mm, h_mm] })

  const clone = svgEl.cloneNode(true)
  clone.setAttribute('width', w_mm)
  clone.setAttribute('height', h_mm)

  await doc.svg(clone, { x: 0, y: 0, width: w_mm, height: h_mm })
  return doc.output('blob')
}
