<template>
  <aside class="sidebar">
    <h1>Moiré SVG Generator</h1>
    <div class="subtitle">Optimized for Axidraw pen plotter — continuous paths</div>

    <!-- Presets -->
    <fieldset>
      <legend>Presets</legend>
      <div class="row" style="margin: 6px 0 6px">
        <input
          v-model="presetName"
          type="text"
          class="preset-name-input"
          placeholder="Name this preset…"
          maxlength="60"
        />
        <button class="btn-icon" @click="onSavePreset">Save</button>
      </div>
      <div class="row">
        <select v-model="selectedPreset" style="flex:1">
          <option value="">— Saved presets —</option>
          <option v-for="name in presetNames" :key="name" :value="name">{{ name }}</option>
        </select>
        <button class="btn-icon" @click="onLoadPreset">Load</button>
        <button class="btn-icon danger" title="Delete selected preset" @click="onDeletePreset">✕</button>
      </div>
    </fieldset>

    <!-- Document Size -->
    <fieldset>
      <legend>Document Size</legend>
      <div class="row" style="margin: 6px 0 8px">
        <div style="flex:1">
          <div class="dim-label">Preset</div>
          <select :value="params.doc.preset" @change="onDocPresetChange">
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
          <select :value="params.doc.unit" @change="setDoc({ unit: $event.target.value })">
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="in">in</option>
          </select>
        </div>
      </div>
      <OrientToggle :orientation="orientation" @click="onOrientClick" />
      <div class="row">
        <div style="flex:1">
          <div class="dim-label">Width</div>
          <input
            type="number"
            class="dim-input"
            min="1"
            step="0.1"
            :value="displayW"
            @input="onDimInput('w', $event)"
          />
        </div>
        <div style="flex:1">
          <div class="dim-label">Height</div>
          <input
            type="number"
            class="dim-input"
            min="1"
            step="0.1"
            :value="displayH"
            @input="onDimInput('h', $event)"
          />
        </div>
      </div>
    </fieldset>

    <!-- Pattern Type -->
    <fieldset>
      <legend>Pattern</legend>
      <div class="control">
        <div class="control-header"><span>Type</span></div>
        <select
          :value="params.patternType"
          @change="set({ patternType: $event.target.value })"
        >
          <option value="concentric-circles">Concentric Circles</option>
          <option value="radial-lines">Radial Lines</option>
          <option value="spiral">Spiral</option>
          <option value="wave-lines">Wave Lines</option>
          <option value="grid">Grid Lines</option>
        </select>
      </div>
    </fieldset>

    <!-- Layer A -->
    <fieldset>
      <legend>Layer A</legend>
      <SliderControl label="Line Count"      :model-value="params.layerA.count" :min="5"    :max="120"            @update:model-value="setA({ count: $event })" />
      <SliderControl label="Center X Offset" :model-value="params.layerA.cx"    :min="-200" :max="200"            @update:model-value="setA({ cx: $event })" />
      <SliderControl label="Center Y Offset" :model-value="params.layerA.cy"    :min="-200" :max="200"            @update:model-value="setA({ cy: $event })" />
      <SliderControl label="Rotation (°)"    :model-value="params.layerA.rot"   :min="0"    :max="180" :step="0.5" @update:model-value="setA({ rot: $event })" />
      <SliderControl label="Scale"           :model-value="params.layerA.scale" :min="0.3"  :max="3"   :step="0.01" @update:model-value="setA({ scale: $event })" />
    </fieldset>

    <!-- Layer B -->
    <fieldset>
      <legend>Layer B</legend>
      <SliderControl label="Line Count"      :model-value="params.layerB.count" :min="5"    :max="120"            @update:model-value="setB({ count: $event })" />
      <SliderControl label="Center X Offset" :model-value="params.layerB.cx"    :min="-200" :max="200"            @update:model-value="setB({ cx: $event })" />
      <SliderControl label="Center Y Offset" :model-value="params.layerB.cy"    :min="-200" :max="200"            @update:model-value="setB({ cy: $event })" />
      <SliderControl label="Rotation (°)"    :model-value="params.layerB.rot"   :min="0"    :max="180" :step="0.5" @update:model-value="setB({ rot: $event })" />
      <SliderControl label="Scale"           :model-value="params.layerB.scale" :min="0.3"  :max="3"   :step="0.01" @update:model-value="setB({ scale: $event })" />
    </fieldset>

    <!-- Global -->
    <fieldset>
      <legend>Global</legend>
      <div class="control">
        <div class="control-header"><span class="label-text">Pen Width</span></div>
        <select :value="strokeSelectValue" @change="onStrokeChange">
          <option v-for="s in STROKE_PRESETS" :key="s" :value="String(s)">{{ s }} mm</option>
          <option value="custom">Custom…</option>
        </select>
        <div v-if="strokeSelectValue === 'custom'" class="row" style="align-items:center;gap:6px;margin-top:6px">
          <input
            type="number"
            class="dim-input"
            min="0.01"
            max="10"
            step="0.01"
            :value="params.global.strokeWidth"
            @input="onStrokeCustomInput"
            style="flex:1"
          />
          <div class="dim-label" style="margin:0">mm</div>
        </div>
      </div>
      <SliderControl label="Wave Amplitude" :model-value="params.global.amplitude"   :min="0"   :max="40" :step="0.5"  @update:model-value="setG({ amplitude: $event })" />
      <SliderControl label="Wave Frequency" :model-value="params.global.frequency"   :min="1"   :max="20" :step="0.5"  @update:model-value="setG({ frequency: $event })" />
    </fieldset>

    <!-- Art Crop -->
    <fieldset>
      <legend>Art Crop</legend>
      <SegmentedControl
        :model-value="params.crop.type"
        :options="[
          { value: 'none',   label: 'None'   },
          { value: 'circle', label: 'Circle' },
          { value: 'square', label: 'Square' },
          { value: 'rect',   label: 'Rect'   },
        ]"
        @update:model-value="setCrop({ type: $event })"
      />
      <div class="row" style="margin-top:2px;align-items:center;gap:8px">
        <div class="dim-label" style="margin:0;white-space:nowrap">Margin</div>
        <input
          type="number"
          class="dim-input"
          min="0"
          step="0.1"
          :value="displayMargin"
          @input="onMarginInput"
          style="flex:1"
        />
        <div class="dim-label" style="margin:0;width:20px">{{ params.doc.unit }}</div>
      </div>
    </fieldset>

    <!-- Noise Distortion -->
    <fieldset>
      <legend>Noise Distortion</legend>
      <div class="control">
        <div class="control-header"><span>Type</span></div>
        <select :value="params.noise.type" @change="setNoise({ type: $event.target.value })">
          <option value="none">None</option>
          <option value="perlin">Perlin</option>
          <option value="simplex">Simplex</option>
        </select>
      </div>
      <template v-if="params.noise.type !== 'none'">
        <SliderControl label="Seed"       :model-value="params.noise.seed"       :min="1"     :max="999"  :step="1"     @update:model-value="setNoise({ seed: $event })" />
        <SliderControl label="Scale"      :model-value="params.noise.scale"      :min="0.002" :max="0.05" :step="0.002" @update:model-value="setNoise({ scale: $event })" />
        <SliderControl label="Multiplier" :model-value="params.noise.multiplier" :min="0"     :max="30"   :step="0.5"   @update:model-value="setNoise({ multiplier: $event })" />
      </template>
    </fieldset>

    <!-- Actions -->
    <div class="btn-row">
      <button class="btn-primary" @click="emit('download')">Download SVG</button>
      <button class="btn-secondary" @click="emit('randomize')">Randomize</button>
    </div>
    <div class="check-row">
      <input type="checkbox" id="saveParamsTxt" :checked="saveParamsTxt" @change="emit('update:saveParamsTxt', $event.target.checked)" />
      <label for="saveParamsTxt">Also save parameters as .txt</label>
    </div>
    <div class="stats" v-if="stats">
      Paths: <span>{{ stats.pathCount }}</span> (pen lifts) &nbsp;|&nbsp;
      Points: <span>{{ stats.pointCount.toLocaleString() }}</span> &nbsp;|&nbsp;
      Doc: <span>{{ displayW }}&times;{{ displayH }} {{ params.doc.unit }}</span>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, toRaw } from 'vue'
import SliderControl from './SliderControl.vue'
import SegmentedControl from './SegmentedControl.vue'
import OrientToggle from './OrientToggle.vue'
import { UNIT_TO_MM, DOC_PRESETS_MM, swapPresetOrientation } from '../lib/docSize.js'
import {
  getPresetNames, savePreset, loadPreset, deletePreset, presetExists,
} from '../lib/presets.js'

const props = defineProps({
  params:        { type: Object,  required: true },
  stats:         { type: Object,  default: null },
  saveParamsTxt: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:params',
  'update:saveParamsTxt',
  'download',
  'randomize',
])

// ---- Param update helpers ----
// Always read from toRaw(props.params) to avoid spreading reactive proxies
function set(patch) {
  emit('update:params', { ...toRaw(props.params), ...patch })
}
function setA(patch) {
  const p = toRaw(props.params)
  emit('update:params', { ...p, layerA: { ...p.layerA, ...patch } })
}
function setB(patch) {
  const p = toRaw(props.params)
  emit('update:params', { ...p, layerB: { ...p.layerB, ...patch } })
}
function setG(patch) {
  const p = toRaw(props.params)
  emit('update:params', { ...p, global: { ...p.global, ...patch } })
}
function setCrop(patch) {
  const p = toRaw(props.params)
  emit('update:params', { ...p, crop: { ...p.crop, ...patch } })
}
function setNoise(patch) {
  const p = toRaw(props.params)
  emit('update:params', { ...p, noise: { ...p.noise, ...patch } })
}
function setDoc(patch) {
  const p = toRaw(props.params)
  emit('update:params', { ...p, doc: { ...p.doc, ...patch } })
}

// ---- Pen width presets ----
const STROKE_PRESETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.8, 1.0, 2.0]

const strokeSelectValue = computed(() => {
  const sw = props.params.global.strokeWidth
  return STROKE_PRESETS.some(p => Math.abs(p - sw) < 0.001) ? String(sw) : 'custom'
})

function onStrokeChange(e) {
  if (e.target.value !== 'custom') {
    setG({ strokeWidth: parseFloat(e.target.value) })
  }
  // 'custom' selected: keep current strokeWidth, custom input appears
}

function onStrokeCustomInput(e) {
  const v = parseFloat(e.target.value)
  if (v > 0) setG({ strokeWidth: v })
}

// ---- Document size display helpers ----
const factor  = computed(() => UNIT_TO_MM[props.params.doc.unit] || 1)
const dp      = computed(() => props.params.doc.unit === 'mm' ? 1 : 3)
const displayW = computed(() => (props.params.doc.w_mm / factor.value).toFixed(dp.value))
const displayH = computed(() => (props.params.doc.h_mm / factor.value).toFixed(dp.value))
const displayMargin = computed(() => (props.params.crop.margin_mm / factor.value).toFixed(dp.value))

const orientation = computed(() => {
  const { w_mm, h_mm } = props.params.doc
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

function onOrientClick(orient) {
  const { w_mm, h_mm, preset } = props.params.doc
  const isPortrait  = w_mm < h_mm - 0.01
  const isLandscape = w_mm > h_mm + 0.01
  if (orient === 'portrait'  && !isPortrait  && isLandscape)
    setDoc({ w_mm: h_mm, h_mm: w_mm, preset: swapPresetOrientation(preset) })
  if (orient === 'landscape' && !isLandscape && isPortrait)
    setDoc({ w_mm: h_mm, h_mm: w_mm, preset: swapPresetOrientation(preset) })
}

function onDimInput(axis, e) {
  const v = parseFloat(e.target.value)
  if (v > 0) {
    if (axis === 'w') setDoc({ w_mm: v * factor.value, preset: 'custom' })
    else              setDoc({ h_mm: v * factor.value, preset: 'custom' })
  }
}

function onMarginInput(e) {
  const v = parseFloat(e.target.value)
  if (v >= 0) setCrop({ margin_mm: v * factor.value })
}

// ---- Presets ----
const presetName     = ref('')
const selectedPreset = ref('')
const presetNames    = ref(getPresetNames())

function refreshPresets() {
  presetNames.value = getPresetNames()
}

function onSavePreset() {
  const name = presetName.value.trim()
  if (!name) { alert('Enter a name for this preset.'); return }
  if (presetExists(name) && !confirm(`Overwrite preset "${name}"?`)) return
  savePreset(name, toRaw(props.params))
  refreshPresets()
  selectedPreset.value = name
  presetName.value = ''
}

function onLoadPreset() {
  if (!selectedPreset.value) return
  const p = loadPreset(selectedPreset.value)
  if (p) emit('update:params', p)
}

function onDeletePreset() {
  if (!selectedPreset.value) return
  if (!confirm(`Delete preset "${selectedPreset.value}"?`)) return
  deletePreset(selectedPreset.value)
  selectedPreset.value = ''
  refreshPresets()
}
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
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

h1 {
  font-size: 17px;
  color: var(--fg);
  margin-bottom: 2px;
  letter-spacing: -0.2px;
  font-weight: 700;
}
.subtitle {
  font-size: 11px;
  color: var(--fg-hint);
  margin-bottom: 12px;
}

fieldset {
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 10px 12px 8px;
  background: var(--bg-fieldset);
}
legend {
  font-size: 11px;
  font-weight: 700;
  color: var(--fg);
  padding: 0 6px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.control { margin: 6px 0 2px; }
.control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin-bottom: 3px;
  color: var(--fg-muted);
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

.btn-row { display: flex; gap: 8px; margin-top: 8px; }

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
.btn-icon:hover { background: var(--bg-btn-secondary-hover); }
.btn-icon.danger { color: var(--error-fg); }
.btn-icon.danger:hover { background: var(--error-bg); }

.preset-name-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  color: var(--fg);
  background: var(--bg-input);
  min-width: 0;
}
.preset-name-input:focus { outline: none; border-color: var(--accent); }
.preset-name-input::placeholder { color: var(--fg-placeholder); }

.check-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0;
  font-size: 12px;
  color: var(--fg-muted);
}
.check-row input[type="checkbox"] { accent-color: var(--accent); }

.stats {
  font-size: 11px;
  color: var(--fg-hint);
  margin-top: 2px;
  line-height: 1.6;
}
.stats span { color: var(--fg); font-weight: 600; }

/* Mobile: sidebar becomes a bottom drawer */
@media (max-width: 767px) {
  .sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    min-width: unset;
    max-height: 70dvh;
    border-right: none;
    border-top: 1px solid var(--border);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -4px 24px var(--shadow-card);
    z-index: 100;
    transform: translateY(100%);
    transition: transform 0.3s ease;
  }
  .sidebar.open {
    transform: translateY(0);
  }
}
</style>
