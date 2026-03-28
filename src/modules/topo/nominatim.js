const BASE = 'https://nominatim.openstreetmap.org/search'

export async function searchLocation(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '5',
    addressdetails: '1',
  })
  const res = await fetch(`${BASE}?${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Nominatim request failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return []
  const seen = new Set()
  return data
    .map(r => ({
      displayName: r.display_name,
      shortName: r.name || r.display_name.split(',')[0].trim(),
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      // boundingbox = [south, north, west, east]
      bbox: {
        south: parseFloat(r.boundingbox[0]),
        north: parseFloat(r.boundingbox[1]),
        west:  parseFloat(r.boundingbox[2]),
        east:  parseFloat(r.boundingbox[3]),
      },
      type: r.type,
      category: r.class,
      state: r.address?.state || '',
      country: r.address?.country || '',
    }))
    .filter(r => {
      if (seen.has(r.shortName)) return false
      seen.add(r.shortName)
      return true
    })
}
