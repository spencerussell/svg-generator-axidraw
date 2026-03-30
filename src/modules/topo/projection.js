/**
 * Stage 4: Project — orthographic projection of 3D contour polylines to 2D.
 *
 * Projects [x, y, z] grid-space points to [screenX, screenY] with a retained
 * depth value per vertex for later hidden-line removal.
 */

/**
 * Create a projection function for the given camera parameters.
 *
 * @param {number} gridWidth - DEM grid width (for centering)
 * @param {number} gridHeight - DEM grid height (for centering)
 * @param {number} pixelSizeMeters - Meters per grid pixel
 * @param {number} azimuthDeg - Viewing direction, 0-360 degrees
 * @param {number} elevAngleDeg - Tilt angle, 0-90 degrees
 * @param {number} heightExag - Height exaggeration multiplier
 * @returns {{ project: (x,y,z) => {sx, sy, depth}, projectContours: (contours) => projected }}
 */
export function createProjection(gridWidth, gridHeight, pixelSizeMeters, azimuthDeg, elevAngleDeg, heightExag) {
  const cx = gridWidth / 2
  const cy = gridHeight / 2
  const azRad = azimuthDeg * Math.PI / 180
  const elRad = elevAngleDeg * Math.PI / 180
  const sinAz = Math.sin(azRad)
  const cosAz = Math.cos(azRad)
  const sinEl = Math.sin(elRad)
  const cosEl = Math.cos(elRad)

  /**
   * Project a single 3D point to 2D screen space.
   * @param {number} x - Grid X
   * @param {number} y - Grid Y
   * @param {number} z - Elevation in meters
   * @returns {{ sx: number, sy: number, depth: number }}
   */
  function project(x, y, z) {
    // Center on grid midpoint
    const dx = x - cx
    const dy = y - cy

    // Rotate around vertical axis by azimuth
    const rx = dx * cosAz - dy * sinAz
    const ry = dx * sinAz + dy * cosAz

    // Convert elevation to grid-pixel scale and apply exaggeration
    const zPx = (z / pixelSizeMeters) * heightExag

    // Tilt by elevation angle (orthographic)
    // sx = rx (horizontal stays the same)
    // sy = ry * sin(elevation) - z * cos(elevation) (tilt view)
    // depth = ry (the rotated Y is depth — positive = near side)
    const sx = rx
    const sy = ry * sinEl - zPx * cosEl

    return { sx, sy, depth: ry }
  }

  /**
   * Project an array of 3D points, returning parallel arrays.
   * @param {[number,number,number][]} points3D
   * @returns {{ points2D: [number,number][], depths: number[] }}
   */
  function projectPoints(points3D) {
    const points2D = []
    const depths = []
    for (const [x, y, z] of points3D) {
      const { sx, sy, depth } = project(x, y, z)
      points2D.push([sx, sy])
      depths.push(depth)
    }
    return { points2D, depths }
  }

  /**
   * Project all contours in a contour set.
   * @param {Array<{elevation, isIndex, rings, edgeSegments?}>} contourSet
   * @returns {Array<{elevation, isIndex, projectedRings, projectedEdges}>}
   */
  function projectContours(contourSet) {
    return contourSet.map(({ elevation, isIndex, rings, edgeSegments }) => {
      const projectedRings = rings.map(ring => {
        const { points2D, depths } = projectPoints(ring)
        return { points2D, depths, isClosed: true }
      })

      const projectedEdges = (edgeSegments || []).map(seg => {
        const { points2D, depths } = projectPoints(seg)
        return { points2D, depths, isClosed: false }
      })

      return { elevation, isIndex, projectedRings, projectedEdges }
    })
  }

  /**
   * Project a mesh vertex (for depth buffer rasterization).
   * Same transform as project() but returns [sx, sy, depth] as an array.
   */
  function projectVertex(x, y, z) {
    const dx = x - cx
    const dy = y - cy
    const rx = dx * cosAz - dy * sinAz
    const ry = dx * sinAz + dy * cosAz
    const zPx = (z / pixelSizeMeters) * heightExag
    return [rx, ry * sinEl - zPx * cosEl, ry]
  }

  return { project, projectPoints, projectContours, projectVertex }
}
