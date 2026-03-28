<template>
  <div class="control">
    <div class="control-header">
      <span class="label-text">{{ label }}</span>
      <span class="num-wrap">
        <input
          type="number"
          class="num-input"
          :min="min"
          :max="max"
          :step="step"
          :value="modelValue"
          @input="onNumberInput"
        /><span v-if="suffix" class="num-suffix">{{ suffix }}</span>
      </span>
    </div>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @input="onRangeInput"
    />
  </div>
</template>

<script setup>
const props = defineProps({
  label:      { type: String, required: true },
  modelValue: { type: Number, required: true },
  min:        { type: Number, required: true },
  max:        { type: Number, required: true },
  step:       { type: Number, default: 1 },
  suffix:     { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

function onRangeInput(e) {
  emit('update:modelValue', Number(e.target.value))
}

function onNumberInput(e) {
  const v = Number(e.target.value)
  if (!isNaN(v)) emit('update:modelValue', v)
}
</script>

<style scoped>
.control { margin: 6px 0 2px; }

.control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin-bottom: 3px;
  color: var(--fg-muted);
}

.label-text { flex: 1; }

.num-input {
  width: 58px;
  padding: 2px 5px;
  border: 1px solid var(--border);
  border-radius: 3px;
  font-size: 11px;
  font-family: inherit;
  text-align: right;
  color: var(--fg);
  background: var(--bg-input);
  font-variant-numeric: tabular-nums;
}
.num-input:focus { outline: none; border-color: var(--accent); }

.num-wrap { display: flex; align-items: center; gap: 1px; }
.num-suffix { font-size: 11px; color: var(--fg-muted); }
</style>
