<template>
  <aside class="sidebar" :class="{ open }">
    <h1>Topo SVG Generator</h1>
    <div class="subtitle">Topographic contours for Axidraw pen plotter</div>

    <!-- Location search -->
    <fieldset>
      <legend>Mountain</legend>

      <!-- Confirmed location display -->
      <template v-if="confirmedLocation">
        <div class="loc-name">{{ confirmedLocation.shortName }}</div>
        <div class="loc-sub">
          {{ confirmedLocation.displayName.split(',').slice(0, 4).join(',') }}
        </div>
        <button class="btn-icon" style="margin-top:8px;width:100%" @click="changeLocation">
          Change Location
        </button>
      </template>

      <!-- Search UI -->
      <template v-else>
        <div ref="searchRowRef" class="row" style="position:relative">
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="e.g. Mount Hood, Oregon"
            @keydown.enter="doSearch"
          />
          <button class="btn-icon" :disabled="searching" @click="doSearch">
            {{ searching ? '…' : 'Search' }}
          </button>

          <Teleport to="body">
            <div v-if="searchResults.length > 0" class="results-dropdown" :style="dropdownStyle">
              <div
                v-for="(r, i) in searchResults"
                :key="i"
                class="result-item"
                @click="confirmLocation(r)"
              >
                <div class="result-name">{{ r.shortName }}</div>
                <div class="result-sub">{{ r.displayName }}</div>
              </div>
            </div>
          </Teleport>
        </div>

        <div v-if="searchError" class="search-error">{{ searchError }}</div>
        <div v-if="searched && searchResults.length === 0 && !searching" class="no-results">
          No results — try a more specific name or add a region.
        </div>
      </template>
    </fieldset>

    <!-- Document Size (always visible) -->
    <fieldset>
      <legend>Document Size</legend>
      <div class="row" style="margin: 6px 0 8px">
        <div style="flex:1">
          <div class="dim-label">Preset</div>
          <select :value="params.doc?.preset" @change="onDocPresetChange">
            <option value="square">Square (150mm)</option>
            <option value="letter-p">Letter 8.5×11"</option>
            <option value="letter-l">Letter 11×8.5"</option>
            <option value="tabloid-p">Tabloid 11×17"</option>
            <option value="tabloid-l">Tabloid 17×11"</option>
            <option value="a4-p">A4 Portrait</option>
            <option value="a4-l">A4 Landscape</option>
            <option value="a3-p">A3 Portrait</option>
            <option value="a3-l">A3 Landscape</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div style="width:72px">
          <div class="dim-label">Units</div>
          <select :value="params.doc?.unit" @change="setDoc({ unit: $event.target.value })">
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="in">in</option>
          </select>
        </div>
      </div>
      <OrientToggle :orientation="docOrientation" @click="onDocOrientClick" />
      <div class="row">
        <div style="flex:1">
          <div class="dim-label">Width</div>
          <input type="number" class="dim-input" min="1" step="0.1"
            :value="displayDocW" @input="onDocDimInput('w', $event)" />
        </div>
        <div style="flex:1">
          <div class="dim-label">Height</div>
          <input type="number" class="dim-input" min="1" step="0.1"
            :value="displayDocH" @input="onDocDimInput('h', $event)" />
        </div>
      </div>
    </fieldset>

    <!-- Parameters (only when location is confirmed) -->
    <template v-if="confirmedLocation">
      <fieldset>
        <legend>Contours</legend>
        <div class="control">
          <div class="control-header"><span>Unit</span></div>
          <div class="seg-row">
            <button
              class="seg-btn"
              :class="{ active: params.unit === 'ft' }"
              @click="setUnit('ft')"
            >Feet</button>
            <button
              class="seg-btn"
              :class="{ active: params.unit === 'm' }"
              @click="setUnit('m')"
            >Meters</button>
          </div>
        </div>
        <SliderControl
          :label="`Interval (${params.unit})`"
          :model-value="params.interval"
          :min="intervalRange.min"
          :max="intervalRange.max"
          :step="intervalRange.step"
          @update:model-value="set({ interval: $event })"
        />
        <SliderControl
          label="Extent (km)"
          :model-value="params.extentKm"
          :min="2" :max="30" :step="1"
          @update:model-value="set({ extentKm: $event })"
        />
      </fieldset>

      <fieldset>
        <legend>View</legend>
        <SliderControl
          label="Rotation (°)"
          :model-value="params.rotation"
          :min="0" :max="360" :step="1"
          @update:model-value="set({ rotation: $event })"
        />
        <SliderControl
          label="View Angle (°)"
          :model-value="params.viewAngle"
          :min="0" :max="90" :step="1"
          @update:model-value="set({ viewAngle: $event })"
        />
        <SliderControl
          label="Height Exaggeration"
          :model-value="Math.round(params.heightExaggeration * 100)"
          :min="100" :max="250" :step="10"
          suffix="%"
          @update:model-value="set({ heightExaggeration: $event / 100 })"
        />
      </fieldset>

      <fieldset>
        <legend>Label</legend>
        <label class="toggle-row">
          <input type="checkbox" :checked="params.showLabel" @change="set({ showLabel: $event.target.checked })" />
          <span>Show mountain name</span>
        </label>
        <label class="toggle-row">
          <input type="checkbox" :checked="params.showElevation" @change="set({ showElevation: $event.target.checked })" />
          <span>Show elevation</span>
        </label>
      </fieldset>

      <div class="btn-row">
        <button class="btn-primary" @click="emit('download')">Download SVG</button>
      </div>
    </template>
  </aside>
</template>

<script setup>
import { ref, computed, toRaw, onMounted } from 'vue'
import SliderControl from './SliderControl.vue'
import OrientToggle from './OrientToggle.vue'
import { searchLocation } from '../modules/topo/nominatim.js'
import { UNIT_TO_MM, DOC_PRESETS_MM, swapPresetOrientation } from '../lib/docSize.js'

const DEFAULT_LOCATION = {
  displayName: 'Mount Hood, Hood River County, Oregon, United States',
  shortName: 'Mount Hood',
  lat: 45.3736,
  lon: -121.6960,
  bbox: { south: 45.27, north: 45.47, west: -121.82, east: -121.57 },
  type: 'peak',
  category: 'natural',
  state: 'Oregon',
  country: 'United States',
}

const searchRowRef = ref(null)
const dropdownStyle = computed(() => {
  if (!searchRowRef.value) return {}
  const rect = searchRowRef.value.getBoundingClientRect()
  return {
    position: 'fixed',
    top:   `${rect.bottom + 2}px`,
    left:  `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: 9999,
  }
})

const props = defineProps({
  params: { type: Object, required: true },
  open:   { type: Boolean, default: false },
})

const emit = defineEmits(['update:params', 'update:location', 'download'])

// ---- Search state ----
const searchQuery    = ref('')
const searchResults  = ref([])
const searching      = ref(false)
const searched       = ref(false)
const searchError    = ref('')
const confirmedLocation = ref(DEFAULT_LOCATION)

onMounted(() => {
  emit('update:location', DEFAULT_LOCATION)
})

async function doSearch() {
  const q = searchQuery.value.trim()
  if (!q) return
  searching.value  = true
  searchError.value = ''
  searchResults.value = []
  searched.value = false
  try {
    searchResults.value = await searchLocation(q)
    searched.value = true
  } catch (e) {
    searchError.value = `Search failed: ${e.message}`
  } finally {
    searching.value = false
  }
}

function confirmLocation(result) {
  confirmedLocation.value = result
  searchResults.value = []
  emit('update:location', result)
}

function changeLocation() {
  confirmedLocation.value = null
  searchResults.value = []
  searched.value = false
  searchQuery.value = ''
}

// ---- Param helpers ----
function set(patch) {
  emit('update:params', { ...toRaw(props.params), ...patch })
}

function setDoc(patch) {
  const p = toRaw(props.params)
  emit('update:params', { ...p, doc: { ...p.doc, ...patch } })
}

// ---- Document size helpers ----
const docFactor  = computed(() => UNIT_TO_MM[props.params.doc?.unit] || 1)
const docDp      = computed(() => props.params.doc?.unit === 'mm' ? 1 : 3)
const displayDocW = computed(() => ((props.params.doc?.w_mm ?? 150) / docFactor.value).toFixed(docDp.value))
const displayDocH = computed(() => ((props.params.doc?.h_mm ?? 150) / docFactor.value).toFixed(docDp.value))

const docOrientation = computed(() => {
  const { w_mm, h_mm } = props.params.doc ?? {}
  if (w_mm < h_mm - 0.01) return 'portrait'
  if (w_mm > h_mm + 0.01) return 'landscape'
  return null
})

function onDocPresetChange(e) {
  const val = e.target.value
  const p   = toRaw(props.params)
  if (DOC_PRESETS_MM[val]) {
    const [w_mm, h_mm] = DOC_PRESETS_MM[val]
    emit('update:params', { ...p, doc: { ...p.doc, preset: val, w_mm, h_mm } })
  } else {
    setDoc({ preset: val })
  }
}

function onDocOrientClick(orient) {
  const { w_mm, h_mm, preset } = props.params.doc ?? {}
  const isPortrait  = w_mm < h_mm - 0.01
  const isLandscape = w_mm > h_mm + 0.01
  if (orient === 'portrait'  && !isPortrait  && isLandscape)
    setDoc({ w_mm: h_mm, h_mm: w_mm, preset: swapPresetOrientation(preset) })
  if (orient === 'landscape' && !isLandscape && isPortrait)
    setDoc({ w_mm: h_mm, h_mm: w_mm, preset: swapPresetOrientation(preset) })
}

function onDocDimInput(axis, e) {
  const v = parseFloat(e.target.value)
  if (v > 0) {
    if (axis === 'w') setDoc({ w_mm: v * docFactor.value, preset: 'custom' })
    else              setDoc({ h_mm: v * docFactor.value, preset: 'custom' })
  }
}

function setUnit(unit) {
  const defaults = { ft: 100, m: 30 }
  emit('update:params', { ...toRaw(props.params), unit, interval: defaults[unit] })
}

const intervalRange = computed(() =>
  props.params.unit === 'ft'
    ? { min: 20, max: 500, step: 20 }
    : { min: 5,  max: 200, step: 5  },
)
</script>

<style scoped>
.sidebar {
  width: 360px;
  min-width: 360px;
  flex: 1;
  min-height: 0;
  background: var(--bg-panel);
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

h1 { font-size: 17px; font-weight: 700; margin-bottom: 2px; letter-spacing: -0.2px; color: var(--fg); }
.subtitle { font-size: 11px; color: var(--fg-hint); margin-bottom: 12px; }

fieldset {
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 10px 12px 8px;
  background: var(--bg-fieldset);
  position: relative;
  overflow: visible;
}
legend {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 0 6px;
  color: var(--fg);
}

.row { display: flex; gap: 6px; }

.dim-label {
  font-size: 11px;
  color: var(--fg-faint);
  margin-bottom: 3px;
}
.dim-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  color: var(--fg);
  background: var(--bg-input);
  font-variant-numeric: tabular-nums;
}
.dim-input:focus { outline: none; border-color: var(--accent); }

.control { margin: 6px 0 2px; }
.control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin-bottom: 3px;
  color: var(--fg-muted);
}

/* Search */
.search-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  min-width: 0;
  color: var(--fg);
  background: var(--bg-input);
}
.search-input:focus { outline: none; border-color: var(--accent); }
.search-input::placeholder { color: var(--fg-placeholder); }

.btn-icon {
  flex: none;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 600;
  background: var(--bg-btn-secondary);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.btn-icon:hover:not(:disabled) { background: var(--bg-btn-secondary-hover); }
.btn-icon:disabled { opacity: 0.5; cursor: default; }


.search-error { font-size: 11px; color: var(--error-fg); margin-top: 4px; }
.no-results   { font-size: 11px; color: var(--fg-faint); margin-top: 4px; }

/* Confirmed location */
.loc-name { font-size: 14px; font-weight: 700; color: var(--fg); margin-top: 2px; }
.loc-sub  { font-size: 10px; color: var(--fg-faint); margin-top: 2px; line-height: 1.5; }

/* Unit toggle */
.seg-row {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.seg-btn {
  flex: 1;
  padding: 6px 0;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-seg-inactive);
  color: var(--fg-muted);
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.1s, color 0.1s;
}
.seg-btn + .seg-btn { border-left: 1px solid var(--border); }
.seg-btn.active { background: var(--accent); color: var(--accent-fg); }
.seg-btn:hover:not(.active) { background: var(--bg-seg-inactive-hover); }

.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--fg-muted);
  cursor: pointer;
}
.toggle-row input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
}

.btn-row { display: flex; gap: 8px; margin-top: 8px; }

/* Mobile: bottom drawer */
@media (max-width: 767px) {
  .sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    min-width: unset;
    max-height: 70dvh;
    border-top: 1px solid var(--border);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -4px 24px var(--shadow-card);
    z-index: 100;
    transform: translateY(100%);
    transition: transform 0.3s ease;
  }
  .sidebar.open { transform: translateY(0); }
}
</style>

<style>
/* Teleported dropdown — must be global (not scoped) since it renders in <body> */
.results-dropdown {
  background: var(--bg-panel);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 4px 16px var(--shadow-card);
}
.results-dropdown .result-item {
  padding: 8px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-light);
}
.results-dropdown .result-item:last-child { border-bottom: none; }
.results-dropdown .result-item:hover { background: var(--bg-fieldset); }
.results-dropdown .result-name { font-size: 13px; font-weight: 600; color: var(--fg); font-family: system-ui, sans-serif; }
.results-dropdown .result-sub {
  font-size: 10px; color: var(--fg-faint); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: system-ui, sans-serif;
}
</style>
