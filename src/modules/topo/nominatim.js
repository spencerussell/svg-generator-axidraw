const BASE = 'https://nominatim.openstreetmap.org/search'

async function fetchNominatim(query, { layer, limit = 10 } = {}) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: String(limit),
    addressdetails: '1',
  })
  if (layer) params.set('layer', layer)
  const res = await fetch(`${BASE}?${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Nominatim request failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return []
  return data
}

function parseResults(data) {
  const seen = new Set()
  return data
    .map(r => ({
      displayName: r.display_name,
      shortName: r.name || r.display_name.split(',')[0].trim(),
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
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

export async function searchLocation(query) {
  // Use Nominatim's layer=natural to restrict to peaks, volcanoes, mountain ranges, etc.
  const natural = await fetchNominatim(query, { layer: 'natural', limit: 10 })
  if (natural.length > 0) {
    return parseResults(natural).slice(0, 5)
  }

  // Fallback: retry with "mountain" appended to help match ranges/peaks
  const withMountain = await fetchNominatim(`${query} mountain`, { layer: 'natural', limit: 10 })
  if (withMountain.length > 0) {
    return parseResults(withMountain).slice(0, 5)
  }

  // No natural features found — return empty rather than non-geographic results
  return []
}
