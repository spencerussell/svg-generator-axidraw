<template>
  <div class="seg-control">
    <button
      v-for="opt in options"
      :key="opt.value"
      class="seg-btn"
      :class="{ active: modelValue === opt.value }"
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, required: true },
  options:    { type: Array,  required: true }, // [{ value, label }]
})
const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
.seg-control { display: flex; gap: 0; margin: 6px 0 4px; }

.seg-btn {
  flex: 1;
  padding: 6px 4px;
  font-size: 11px;
  font-weight: 700;
  background: var(--bg-seg-inactive);
  color: var(--fg-tab-inactive);
  border: 1px solid var(--border);
  cursor: pointer;
  text-align: center;
  font-family: inherit;
}
.seg-btn:first-child { border-radius: 4px 0 0 4px; }
.seg-btn + .seg-btn   { border-left: none; }
.seg-btn:last-child   { border-radius: 0 4px 4px 0; }
.seg-btn.active { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
</style>
