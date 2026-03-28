<template>
  <div class="preview" ref="containerEl">
    <!-- Loading progress -->
    <Transition name="fade">
      <div class="loading-card" v-if="loading.active">
        <div class="loading-stage">{{ loading.stage }}</div>
        <div class="loading-track">
          <div class="loading-fill" :style="{ width: loading.pct + '%' }"></div>
        </div>
        <div class="loading-pct">{{ Math.round(loading.pct) }}%</div>
      </div>
    </Transition>

    <!-- Error message -->
    <div class="error-card" v-if="errorMsg">
      <strong>Error</strong><br>{{ errorMsg }}
    </div>

    <!-- Empty state before any location is set -->
    <div class="empty-hint" v-if="!location && !loading.active">
      Search for a mountain to begin
    </div>

    <svg ref="svgEl" xmlns="http://www.w3.org/2000/svg"></svg>
    <div class="hint">Topographic contours · Axidraw pen plotter</div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import {
  loadElevationData,
  buildContourData,
  renderTopoSVG,
} from '../modules/topo/generator.js'

const props = defineProps({
  params:   { type: Object, required: true },
  location: { type: Object, default: null },
})

const containerEl = ref(null)
const svgEl       = ref(null)
const loading     = ref({ active: false, stage: '', pct: 0 })
const errorMsg    = ref(null)

// Cached computation results
let gridCache    = null   // from loadElevationData
let contourCache = null   // from buildContourData
let lastUnit     = null
let lastInterval = null
let lastExtentKm = null

function onProgress(p) {
  loading.value = { active: true, ...p }
}

// ---- Full reload (new location) ----
async function loadLocation(loc) {
  if (!loc) return
  gridCache    = null
  contourCache = null
  errorMsg.value = null
  onProgress({ stage: 'Fetching elevation tiles', pct: 2 })

  try {
    gridCache = await loadElevationData(loc, onProgress)

    onProgress({ stage: 'Generating contours', pct: 75 })
    contourCache = buildContourData(gridCache, props.params)
    lastUnit     = props.params.unit
    lastInterval = props.params.interval
    lastExtentKm = props.params.extentKm

    onProgress({ stage: 'Rendering', pct: 92 })
    doRender()
    loading.value.active = false
  } catch (e) {
    errorMsg.value = e.message
    loading.value.active = false
  }
}

// ---- Interval/unit changed → rebuild contours ----
function rebuildContours() {
  if (!gridCache) return
  contourCache = buildContourData(gridCache, props.params)
  lastUnit     = props.params.unit
  lastInterval = props.params.interval
  lastExtentKm = props.params.extentKm
  doRender()
}

// ---- Projection params changed → re-render only ----
function doRender() {
  if (!svgEl.value || !containerEl.value || !gridCache || !contourCache) return
  const el = containerEl.value
  const availW = Math.max(el.clientWidth  - 40, 80)
  const availH = Math.max(el.clientHeight - 40, 80)
  const { w_mm = 150, h_mm = 150 } = props.params.doc ?? {}
  const dScale = Math.min(availW / w_mm, availH / h_mm)
  const w = Math.max(Math.round(w_mm * dScale), 80)
  const h = Math.max(Math.round(h_mm * dScale), 80)
  svgEl.value.style.width  = w + 'px'
  svgEl.value.style.height = h + 'px'
  renderTopoSVG(svgEl.value, contourCache, gridCache, props.params, w, h, props.location)
}

// Watch location → full reload
watch(() => props.location, loc => { if (loc) loadLocation(loc) }, { deep: true })

// Watch params → smart dispatch
watch(
  () => props.params,
  (newP) => {
    if (!gridCache) return
    const intervalChanged = newP.interval !== lastInterval || newP.unit !== lastUnit || newP.extentKm !== lastExtentKm
    if (intervalChanged) rebuildContours()
    else doRender()
  },
  { deep: true },
)

let ro
onMounted(() => {
  ro = new ResizeObserver(doRender)
  ro.observe(containerEl.value)
  if (props.location) loadLocation(props.location)
})
onUnmounted(() => ro?.disconnect())

defineExpose({ svgEl })
</script>

<style scoped>
.preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-preview);
  padding: 20px;
  position: relative;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}

svg {
  background: var(--svg-bg);
  box-shadow: 0 2px 20px var(--shadow-card);
  display: block;
  flex-shrink: 0;
  overflow: hidden;
}

/* Loading card */
.loading-card {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 260px;
  background: var(--loading-bg);
  border-radius: 8px;
  padding: 14px 18px;
  box-shadow: 0 2px 16px var(--shadow-card);
  z-index: 10;
  text-align: center;
}
.loading-stage {
  font-size: 12px;
  color: var(--fg-muted);
  margin-bottom: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.loading-track {
  height: 4px;
  background: var(--loading-track);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}
.loading-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.25s ease;
}
.loading-pct {
  font-size: 11px;
  color: var(--fg-hint);
  font-variant-numeric: tabular-nums;
}

/* Error card */
.error-card {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 12px;
  color: var(--error-fg);
  text-align: center;
  z-index: 10;
}

.empty-hint {
  position: absolute;
  font-size: 13px;
  color: var(--fg-hint);
  pointer-events: none;
}

.hint {
  position: absolute;
  bottom: 12px;
  right: 18px;
  font-size: 10px;
  color: var(--fg-hint);
  pointer-events: none;
}

/* Transition */
.fade-enter-active,
.fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
