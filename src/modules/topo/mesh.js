/**
 * Stage 2: Build a triangle mesh from the DEM grid.
 * Used for depth-buffer rasterization in hidden-line removal.
 *
 * Each 2x2 quad of grid cells becomes 2 triangles:
 *   (x,y)---(x+1,y)        Triangle A: (x,y), (x+1,y), (x,y+1)
 *     |  \    |             Triangle B: (x+1,y), (x+1,y+1), (x,y+1)
 *     |   \   |
 *   (x,y+1)-(x+1,y+1)
 */

/**
 * Build a triangle mesh from the DEM grid.
 * @param {Float32Array} grid - Elevation values
 * @param {number} gridWidth
 * @param {number} gridHeight
 * @returns {{ positions: Float32Array, indices: Uint32Array, vertexCount: number, triangleCount: number }}
 *   positions: interleaved [x, y, z, x, y, z, ...] in grid-pixel space (z = elevation)
 *   indices: triangle vertex indices (3 per triangle)
 */
export function buildMesh(grid, gridWidth, gridHeight) {
  const vertexCount = gridWidth * gridHeight
  const positions = new Float32Array(vertexCount * 3)

  // Fill vertex positions: x = grid column, y = grid row, z = elevation
  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const vi = row * gridWidth + col
      positions[vi * 3] = col
      positions[vi * 3 + 1] = row
      positions[vi * 3 + 2] = grid[vi]
    }
  }

  // Two triangles per quad, (gridWidth-1) * (gridHeight-1) quads
  const quadCols = gridWidth - 1
  const quadRows = gridHeight - 1
  const triangleCount = quadCols * quadRows * 2
  const indices = new Uint32Array(triangleCount * 3)

  let idx = 0
  for (let row = 0; row < quadRows; row++) {
    for (let col = 0; col < quadCols; col++) {
      const tl = row * gridWidth + col
      const tr = tl + 1
      const bl = tl + gridWidth
      const br = bl + 1

      // Triangle A: top-left, top-right, bottom-left
      indices[idx++] = tl
      indices[idx++] = tr
      indices[idx++] = bl

      // Triangle B: top-right, bottom-right, bottom-left
      indices[idx++] = tr
      indices[idx++] = br
      indices[idx++] = bl
    }
  }

  return { positions, indices, vertexCount, triangleCount }
}
