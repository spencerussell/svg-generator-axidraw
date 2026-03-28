<template>
  <!-- Sidebar column: mode tabs + active sidebar -->
  <div class="sidebar-wrap">
    <div class="mode-tabs">
      <button :class="{ active: mode === 'moire' }" @click="mode = 'moire'">
        <svg class="mode-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <g><circle cx="47.463" cy="47.463" r="8.33"/><circle cx="47.463" cy="47.463" r="16.555"/><circle cx="47.463" cy="47.463" r="24.78"/><circle cx="47.463" cy="47.463" r="33.006"/></g>
          <g><circle cx="52.537" cy="52.537" r="8.33"/><circle cx="52.537" cy="52.537" r="16.555"/><circle cx="52.537" cy="52.537" r="24.78"/><circle cx="52.537" cy="52.537" r="33.006"/></g>
        </svg>
        Moiré
      </button>
      <button :class="{ active: mode === 'topo'  }" @click="mode = 'topo'">
        <svg class="mode-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <polygon points="16.419 75.696 83.581 75.696 60.946 24.304 48.429 42.335 36.085 33.766 16.419 75.696"/>
        </svg>
        Topo
      </button>
    </div>

    <Sidebar
      v-if="mode === 'moire'"
      :params="moireParams"
      :stats="stats"
      :saveParamsTxt="saveParamsTxt"
      :class="{ open: sidebarOpen }"
      @update:params="moireParams = $event"
      @update:saveParamsTxt="saveParamsTxt = $event"
      @download="onMoireDownload"
      @randomize="onRandomize"
    />

    <TopoSidebar
      v-if="mode === 'topo'"
      :params="topoParams"
      :open="sidebarOpen"
      @update:params="topoParams = $event"
      @update:location="topoLocation = $event"
      @download="onTopoDownload"
    />
  </div>

  <!-- Preview pane -->
  <PreviewPane
    v-if="mode === 'moire'"
    ref="moirePreviewRef"
    :params="moireParams"
    @stats="stats = $event"
  />

  <TopoPreviewPane
    v-if="mode === 'topo'"
    ref="topoPreviewRef"
    :params="topoParams"
    :location="topoLocation"
  />

  <!-- Theme toggle -->
  <button class="theme-toggle" @click="toggleTheme" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'">
    <svg v-if="isDark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  </button>

  <!-- Mobile sidebar toggle FAB -->
  <button
    class="sidebar-toggle"
    :class="{ open: sidebarOpen }"
    @click="sidebarOpen = !sidebarOpen"
    aria-label="Toggle controls"
  >{{ sidebarOpen ? '✕' : '⚙' }}</button>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Sidebar         from './components/Sidebar.vue'
import PreviewPane     from './components/PreviewPane.vue'
import TopoSidebar     from './components/TopoSidebar.vue'
import TopoPreviewPane from './components/TopoPreviewPane.vue'
import { exportSVG, paramsToText } from './modules/moire/generator.js'
import { exportTopoSVG }           from './modules/topo/generator.js'

const mode = ref('topo')

// ---- Theme ----
const isDark = ref(false)
function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}
onMounted(() => {
  const saved = localStorage.getItem('theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  isDark.value = saved ? saved === 'dark' : prefersDark
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
})

// ---- Moiré params ----
const moireParams = ref({
  patternType: 'concentric-circles',
  layerA: { count: 40, cx: 0,  cy: 0, rot: 0, scale: 1 },
  layerB: { count: 40, cx: 30, cy: 0, rot: 3, scale: 1 },
  global: { strokeWidth: 0.5, amplitude: 0, frequency: 3 },
  crop:   { type: 'circle', margin_mm: 12.7 },
  noise:  { type: 'none', seed: 42, scale: 0.01, multiplier: 5 },
  doc:    { preset: 'letter-p', unit: 'in', w_mm: 215.9, h_mm: 279.4 },
})

// ---- Topo params ----
const topoParams = ref({
  unit:               'ft',
  interval:           100,
  extentKm:           10,
  rotation:           0,
  viewAngle:          30,
  heightExaggeration: 1.0,
  showLabel:          true,
  showElevation:      true,
  doc: { preset: 'letter-l', unit: 'in', w_mm: 279.4, h_mm: 215.9 },
})
const topoLocation = ref(null)

const stats         = ref(null)
const saveParamsTxt = ref(false)
const sidebarOpen   = ref(false)
const moirePreviewRef = ref(null)
const topoPreviewRef  = ref(null)

// ---- Moiré download ----
function onMoireDownload() {
  const svgEl = moirePreviewRef.value?.svgEl
  if (!svgEl) return
  const { w_mm, h_mm } = moireParams.value.doc
  const source   = exportSVG(svgEl, w_mm, h_mm)
  const basename = `moire-axidraw-${Date.now()}`
  triggerDownload(`${basename}.svg`, new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))
  if (saveParamsTxt.value) {
    const text = paramsToText(moireParams.value, `${basename}.svg`)
    triggerDownload(`${basename}.txt`, new Blob([text], { type: 'text/plain;charset=utf-8' }))
  }
}

// ---- Topo download ----
function onTopoDownload() {
  const svgEl = topoPreviewRef.value?.svgEl
  if (!svgEl) return
  const { w_mm, h_mm } = topoParams.value.doc
  const source   = exportTopoSVG(svgEl, w_mm, h_mm)
  const basename = `topo-axidraw-${Date.now()}`
  triggerDownload(`${basename}.svg`, new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))
}

function triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ---- Moiré randomize ----
function onRandomize() {
  const rand  = (mn, mx) => Math.round(mn + Math.random() * (mx - mn))
  const randF = (mn, mx, s) => Math.round((mn + Math.random() * (mx - mn)) / s) * s
  const types = ['concentric-circles', 'radial-lines', 'spiral', 'wave-lines', 'grid']
  moireParams.value = {
    ...moireParams.value,
    patternType: types[Math.floor(Math.random() * types.length)],
    layerA: { count: rand(15,80), cx: rand(-100,100), cy: rand(-100,100), rot: randF(0,45,0.5), scale: randF(0.6,1.8,0.01) },
    layerB: { count: rand(15,80), cx: rand(-100,100), cy: rand(-100,100), rot: randF(0,45,0.5), scale: randF(0.6,1.8,0.01) },
    global: { ...moireParams.value.global, amplitude: randF(0,20,0.5), frequency: randF(1,12,0.5) },
  }
}
</script>

<style>
/* ---- Mode tabs ---- */
.sidebar-wrap {
  display: flex;
  flex-direction: column;
}

.mode-tabs {
  display: flex;
  background: var(--bg-tabs);
  border-bottom: 1px solid var(--border-tab);
  flex-shrink: 0;
}
.mode-tabs button {
  flex: 1;
  padding: 10px 0;
  font-size: 12px;
  font-weight: 700;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--fg-tab-inactive);
  cursor: pointer;
  font-family: inherit;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  transition: color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.mode-tabs button.active  { color: var(--fg); border-bottom-color: var(--accent); }
.mode-tabs button:hover:not(.active) { color: var(--fg-muted); }

/* Mode icons */
.mode-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 4px;
  stroke-miterlimit: 10;
}

/* ---- Theme toggle ---- */
.theme-toggle {
  position: fixed;
  top: 10px;
  right: 14px;
  z-index: 200;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--fg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.theme-toggle:hover { background: var(--bg-btn-secondary-hover); }

/* ---- Mobile toggle ---- */
.sidebar-toggle { display: none; }

#app { position: relative; }

@media (max-width: 767px) {
  #app { flex-direction: column; }

  /* Mode tabs stay fixed at top on mobile */
  .sidebar-wrap {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 150;
    /* sidebar inside is position:fixed itself, so wrap height = tabs only */
    height: 42px;
    overflow: visible;
  }

  /* Preview fills screen below the fixed tabs */
  .preview {
    flex: 1;
    height: 100dvh;
    padding-top: calc(20px + 42px); /* tab bar + normal padding */
  }

  .sidebar-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-fg);
    font-size: 20px;
    border: none;
    cursor: pointer;
    z-index: 200;
    box-shadow: 0 2px 12px var(--shadow-fab);
  }
  .sidebar-toggle.open { background: var(--fg-muted); }

  .theme-toggle {
    top: auto;
    bottom: 20px;
    right: 76px;
  }
}
</style>
