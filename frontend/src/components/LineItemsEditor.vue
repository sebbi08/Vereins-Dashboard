<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import type { InvoiceLineItem } from 'shared';
import { ref, toRaw, watch } from 'vue';
import DecimalInput from './ui/DecimalInput.vue';

const props = defineProps<{
  modelValue: InvoiceLineItem[];
  error?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [items: InvoiceLineItem[]];
  /** True while any price field holds text that is not a valid amount. */
  'update:invalid': [invalid: boolean];
}>();

// Stable keys, so inputs keep their identity (and focus) when an item above is removed
let nextKey = 0;
const keys = ref<number[]>(props.modelValue.map(() => nextKey++));
const invalidKeys = ref(new Set<number>());
/** The last list this editor emitted; any other new list comes from outside (load, copy…). */
let lastEmitted: InvoiceLineItem[] | null = null;

watch(
  () => props.modelValue,
  (items) => {
    // A parent's reactive state hands our own list back as a proxy: compare the raw arrays
    if (lastEmitted && toRaw(items) === toRaw(lastEmitted)) return;
    keys.value = items.map(() => nextKey++);
    setInvalidKeys(new Set());
  },
);

function setInvalidKeys(next: Set<number>) {
  const wasInvalid = invalidKeys.value.size > 0;
  invalidKeys.value = next;
  if (wasInvalid !== next.size > 0) emit('update:invalid', next.size > 0);
}

function update(items: InvoiceLineItem[]) {
  lastEmitted = items;
  emit('update:modelValue', items);
}

function setItem(index: number, change: Partial<InvoiceLineItem>) {
  update(props.modelValue.map((item, i) => (i === index ? { ...item, ...change } : item)));
}

function setPrice(index: number, euros: number | null) {
  setItem(index, { priceInCents: euros === null ? 0 : Math.round(euros * 100) });
}

function setPriceValidity(key: number, valid: boolean) {
  const next = new Set(invalidKeys.value);
  if (valid) next.delete(key);
  else next.add(key);
  setInvalidKeys(next);
}

function addItem() {
  keys.value = [...keys.value, nextKey++];
  update([...props.modelValue, { text: '', priceInCents: 0 }]);
}

function removeItem(index: number) {
  if (props.modelValue.length <= 1) return;
  const removedKey = keys.value[index];
  keys.value = keys.value.filter((_, i) => i !== index);
  const next = new Set(invalidKeys.value);
  next.delete(removedKey);
  setInvalidKeys(next);
  update(props.modelValue.filter((_, i) => i !== index));
}
</script>

<template>
  <div class="field line-items" role="group" aria-labelledby="line-items-label">
    <span id="line-items-label" class="field-label">Line Items</span>
    <div v-for="(item, idx) in modelValue" :key="keys[idx]" class="line-item">
      <Textarea
        :model-value="item.text"
        data-testid="line-item-text"
        rows="1"
        auto-resize
        :aria-label="`Line item ${idx + 1} text`"
        class="line-item__text"
        @update:model-value="(text: string | undefined) => setItem(idx, { text: text ?? '' })"
      />
      <DecimalInput
        :model-value="item.priceInCents / 100"
        :min-fraction-digits="2"
        suffix="€"
        :aria-label="`Line item ${idx + 1} price`"
        data-testid="line-item-price"
        class="line-item__price"
        @update:model-value="(value: number | null) => setPrice(idx, value)"
        @validity="(valid: boolean) => setPriceValidity(keys[idx], valid)"
      />
      <Button
        v-if="modelValue.length > 1"
        icon="pi pi-times"
        text
        severity="danger"
        :aria-label="`Remove line item ${idx + 1}`"
        @click="removeItem(idx)"
      />
    </div>
    <Message
      v-if="error"
      severity="error"
      size="small"
      variant="simple"
      data-testid="error-line-items"
    >
      {{ error }}
    </Message>
    <div>
      <Button
        label="Add Line Item"
        icon="pi pi-plus"
        text
        data-testid="add-line-item"
        @click="addItem"
      />
    </div>
  </div>
</template>

<style scoped>
.line-items {
  margin: 1rem 0;
}

.line-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.line-item__text {
  flex: 1;
  min-width: 0;
}

.line-item__price {
  width: 10rem;
}
</style>
