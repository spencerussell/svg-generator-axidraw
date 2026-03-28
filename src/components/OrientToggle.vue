<template>
  <div class="orient-toggle">
    <button
      class="orient-btn"
      :class="{ active: orientation === 'portrait' }"
      @click="emit('click', 'portrait')"
    >Portrait</button>
    <button
      class="orient-btn"
      :class="{ active: orientation === 'landscape' }"
      @click="emit('click', 'landscape')"
    >Landscape</button>
  </div>
</template>

<script setup>
defineProps({
  orientation: { type: String, default: null }, // 'portrait' | 'landscape' | null (square)
})
const emit = defineEmits(['click'])
</script>

<style scoped>
.orient-toggle { display: flex; gap: 0; margin: 2px 0 8px; }

.orient-btn {
  flex: 1;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 700;
  background: var(--bg-seg-inactive);
  color: var(--fg-tab-inactive);
  border: 1px solid var(--border);
  cursor: pointer;
  text-align: center;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  font-family: inherit;
}
.orient-btn:first-child { border-radius: 4px 0 0 4px; border-right: none; }
.orient-btn:last-child  { border-radius: 0 4px 4px 0; }
.orient-btn.active { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
</style>
