<script setup lang="ts">
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { computed, ref, watch } from 'vue';
import { formatDecimal, parseDecimal } from '../../utils/decimalInput';

const props = withDefaults(
  defineProps<{
    modelValue: number | null;
    inputId?: string;
    minFractionDigits?: number;
    maxFractionDigits?: number;
    suffix?: string;
    placeholder?: string;
    ariaLabel?: string;
    invalid?: boolean;
    size?: 'small' | 'large';
  }>(),
  { minFractionDigits: 0, maxFractionDigits: 2 },
);

const emit = defineEmits<{
  'update:modelValue': [value: number | null];
}>();

function display(value: number | null): string {
  return value === null || Number.isNaN(value)
    ? ''
    : formatDecimal(value, props.minFractionDigits, props.maxFractionDigits);
}

const text = ref(display(props.modelValue));
const focused = ref(false);

const parsed = computed(() => parseDecimal(text.value, props.maxFractionDigits));
const formatError = computed(() => Number.isNaN(parsed.value));
const example = computed(() => (props.maxFractionDigits === 0 ? '6' : '12,50'));

// The user's own typing wins while the field has focus; other changes (load, reset) show up
watch(
  () => props.modelValue,
  (value) => {
    if (!focused.value) text.value = display(value);
  },
);

function onInput(value: string | undefined) {
  text.value = value ?? '';
  const result = parsed.value;
  emit('update:modelValue', result === null || Number.isNaN(result) ? null : result);
}

function onBlur() {
  focused.value = false;
  if (!formatError.value) text.value = display(props.modelValue);
}
</script>

<template>
  <div class="decimal-input">
    <InputGroup>
      <InputText
        :id="inputId"
        :model-value="text"
        inputmode="decimal"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        :invalid="invalid || formatError"
        :size="size"
        class="decimal-input__field"
        @update:model-value="onInput"
        @focus="focused = true"
        @blur="onBlur"
      />
      <InputGroupAddon v-if="suffix">{{ suffix }}</InputGroupAddon>
    </InputGroup>
    <Message
      v-if="formatError"
      severity="error"
      size="small"
      variant="simple"
      data-testid="decimal-format-error"
    >
      Enter a number like {{ example }}
    </Message>
  </div>
</template>

<style scoped>
.decimal-input {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.decimal-input__field {
  text-align: right;
  font-variant-numeric: tabular-nums;
  min-width: 0;
}
</style>
