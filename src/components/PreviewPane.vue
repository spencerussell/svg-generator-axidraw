<template>
  <div class="preview" ref="containerEl">
    <svg ref="svgEl" xmlns="http://www.w3.org/2000/svg"></svg>
    <div class="hint">Continuous paths optimized for pen plotter</div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { renderMoire } from '../modules/moire/generator.js'

const props = defineProps({
  params: { type: Object, required: true },
})

const emit = defineEmits(['stats'])

const containerEl = ref(null)
const svgEl = ref(null)

function render() {
  if (!svgEl.value || !containerEl.value) return
  const el = containerEl.value
  const availW = Math.max(el.clientWidth  - 40, 80)
  const availH = Math.max(el.clientHeight - 40, 80)
  const stats = renderMoire(props.params, svgEl.value, availW, availH)
  emit('stats', stats)
}

// Re-render whenever params change (deep watch)
watch(() => props.params, render, { deep: true })

// Re-render on container resize
let ro
onMounted(() => {
  ro = new ResizeObserver(render)
  ro.observe(containerEl.value)
  render()
})
onUnmounted(() => ro?.disconnect())

// Expose the SVG element so the parent can call exportSVG on it
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

.hint {
  position: absolute;
  bottom: 12px;
  right: 18px;
  font-size: 10px;
  color: var(--fg-hint);
  pointer-events: none;
}
</style>
