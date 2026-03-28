const STORAGE_KEY = 'moire_presets_v1'

export function loadPresetsStore() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {} }
  catch { return {} }
}

export function savePresetsStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function getPresetNames() {
  return Object.keys(loadPresetsStore()).sort()
}

export function savePreset(name, params) {
  const store = loadPresetsStore()
  store[name] = params
  savePresetsStore(store)
}

export function loadPreset(name) {
  return loadPresetsStore()[name] ?? null
}

export function deletePreset(name) {
  const store = loadPresetsStore()
  delete store[name]
  savePresetsStore(store)
}

export function presetExists(name) {
  return name in loadPresetsStore()
}
