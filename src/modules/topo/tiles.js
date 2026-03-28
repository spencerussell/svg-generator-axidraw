const TILE_SIZE = 256
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137 // meters

export function latLonToTile(lat, lon, zoom) {
  const n = 2 ** zoom
  const x = Math.floor((lon + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n,
  )
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) }
}

export function tileToBBox(tx, ty, zoom) {
  const n = 2 ** zoom
  const west = tx / n * 360 - 180
  const east = (tx + 1) / n * 360 - 180
  const northRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n)))
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 1) / n)))
  return {
    north: northRad * 180 / Math.PI,
    south: southRad * 180 / Math.PI,
    west,
    east,
  }
}

export function decodeTerrariumPixel(r, g, b) {
  return (r * 256 + g + b / 256) - 32768
}

export async function fetchTerrariumTile(z, x, y) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load tile ${z}/${x}/${y}`))
    image.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = TILE_SIZE
  canvas.height = TILE_SIZE
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE)
}

export function getBoundingTiles(lat, lon, bbox, zoom) {
  // Ensure at least ~minExpand degrees in each direction from center
  const minExpand = 0.12
  const expanded = {
    north: Math.max(bbox.north, lat + minExpand),
    south: Math.min(bbox.south, lat - minExpand),
    east:  Math.max(bbox.east,  lon + minExpand),
    west:  Math.min(bbox.west,  lon - minExpand),
  }
  const nw = latLonToTile(expanded.north, expanded.west, zoom)
  const se = latLonToTile(expanded.south, expanded.east, zoom)
  const tiles = []
  for (let tx = nw.x; tx <= se.x; tx++) {
    for (let ty = nw.y; ty <= se.y; ty++) {
      tiles.push({ x: tx, y: ty })
    }
  }
  // Cap to 49 tiles (7×7) to prevent runaway fetching on large bboxes
  if (tiles.length > 49) {
    const center = latLonToTile(lat, lon, zoom)
    const r = 3
    const capped = []
    for (let tx = center.x - r; tx <= center.x + r; tx++) {
      for (let ty = center.y - r; ty <= center.y + r; ty++) {
        capped.push({ x: tx, y: ty })
      }
    }
    return capped
  }
  return tiles
}

export function stitchTiles(tileDataList, zoom) {
  if (tileDataList.length === 0) throw new Error('No tile data to stitch')

  const minTileX = Math.min(...tileDataList.map(t => t.x))
  const maxTileX = Math.max(...tileDataList.map(t => t.x))
  const minTileY = Math.min(...tileDataList.map(t => t.y))
  const maxTileY = Math.max(...tileDataList.map(t => t.y))

  const tilesWide = maxTileX - minTileX + 1
  const tilesTall = maxTileY - minTileY + 1
  const gridWidth  = tilesWide * TILE_SIZE
  const gridHeight = tilesTall * TILE_SIZE
  const grid = new Float32Array(gridWidth * gridHeight)

  for (const { x, y, imageData } of tileDataList) {
    const offX = (x - minTileX) * TILE_SIZE
    const offY = (y - minTileY) * TILE_SIZE
    const d = imageData.data
    for (let py = 0; py < TILE_SIZE; py++) {
      for (let px = 0; px < TILE_SIZE; px++) {
        const i = (py * TILE_SIZE + px) * 4
        const elev = decodeTerrariumPixel(d[i], d[i + 1], d[i + 2])
        grid[(offY + py) * gridWidth + (offX + px)] = elev
      }
    }
  }

  const nwBox = tileToBBox(minTileX, minTileY, zoom)
  const seBox = tileToBBox(maxTileX, maxTileY, zoom)
  const bounds = {
    north: nwBox.north,
    south: seBox.south,
    west:  nwBox.west,
    east:  seBox.east,
  }

  // Pixel size in meters at center latitude (used for height scaling)
  const centerLat = (bounds.north + bounds.south) / 2
  const tileWidthMeters = EARTH_CIRCUMFERENCE * Math.cos(centerLat * Math.PI / 180) / (2 ** zoom)
  const pixelSizeMeters = tileWidthMeters / TILE_SIZE

  return { grid, gridWidth, gridHeight, bounds, pixelSizeMeters }
}
