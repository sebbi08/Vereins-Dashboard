<script setup lang="ts">
import type { AmountRange } from '../../utils/tableFilters';
import DecimalInput from './DecimalInput.vue';

const props = defineProps<{
  modelValue: AmountRange | undefined;
  label: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: AmountRange];
}>();

function update(index: 0 | 1, value: number | null) {
  const next: [number | null, number | null] = [
    props.modelValue?.[0] ?? null,
    props.modelValue?.[1] ?? null,
  ];
  next[index] = value;
  emit('update:modelValue', next[0] === null && next[1] === null ? null : next);
}
</script>

<template>
  <div class="amount-range">
    <DecimalInput
      :model-value="modelValue?.[0] ?? null"
      size="small"
      placeholder="from"
      :aria-label="`${label} from`"
      data-testid="amount-from"
      @update:model-value="(value: number | null) => update(0, value)"
    />
    <DecimalInput
      :model-value="modelValue?.[1] ?? null"
      size="small"
      placeholder="to"
      :aria-label="`${label} to`"
      data-testid="amount-to"
      @update:model-value="(value: number | null) => update(1, value)"
    />
  </div>
</template>

<style scoped>
.amount-range {
  display: flex;
  gap: 0.25rem;
  width: 9.5rem;
}

.amount-range > * {
  flex: 1;
  min-width: 4.5rem;
}
</style>
