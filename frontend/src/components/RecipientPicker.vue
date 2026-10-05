<script setup lang="ts">
import type { InvoiceRecipientDto } from 'shared';
import { ref, watch } from 'vue';
import { emptyRecipient, fromRecipientDto, type RecipientFormValue } from '../utils/recipientForm';

const props = defineProps<{
  modelValue: RecipientFormValue;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: RecipientFormValue];
}>();

const search = ref(props.modelValue.name);
const suggestions = ref<InvoiceRecipientDto[]>([]);
let debounceTimer: ReturnType<typeof setTimeout>;

watch(
  () => props.modelValue.id,
  () => {
    search.value = props.modelValue.name;
  },
);

function onSearchInput() {
  clearTimeout(debounceTimer);
  if (!search.value.trim()) {
    suggestions.value = [];
    return;
  }
  debounceTimer = setTimeout(async () => {
    const res = await fetch(`/api/invoice-recipient?search=${encodeURIComponent(search.value)}`);
    if (res.ok) suggestions.value = await res.json();
  }, 250);
}

function select(recipient: InvoiceRecipientDto) {
  suggestions.value = [];
  search.value = recipient.name;
  emit('update:modelValue', fromRecipientDto(recipient));
}

function startNew() {
  suggestions.value = [];
  emit('update:modelValue', { ...emptyRecipient(), name: search.value.trim() });
}

function update(field: keyof Omit<RecipientFormValue, 'id'>, value: string) {
  const next = { ...props.modelValue };
  next[field] = value;
  emit('update:modelValue', next);
}

const fields: { key: keyof Omit<RecipientFormValue, 'id'>; label: string }[] = [
  { key: 'salutation', label: 'Salutation' },
  { key: 'name', label: 'Name' },
  { key: 'street', label: 'Street' },
  { key: 'city', label: 'Postal code / City' },
  { key: 'email', label: 'Email' },
];
</script>

<template>
  <div>
    <div class="mb-3 relative">
      <label for="recipient-search" class="block text-sm font-medium text-gray-700 mb-1"
        >Search or create recipient</label
      >
      <div class="flex gap-2">
        <input
          id="recipient-search"
          v-model="search"
          data-testid="recipient-search"
          type="text"
          placeholder="Enter name…"
          class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          @input="onSearchInput"
        />
        <button
          type="button"
          data-testid="recipient-new"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          @click="startNew"
        >
          New recipient
        </button>
      </div>
      <div
        v-if="suggestions.length > 0"
        class="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-auto"
      >
        <button
          v-for="r in suggestions"
          :key="r.id"
          type="button"
          data-testid="recipient-suggestion"
          class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
          @click="select(r)"
        >
          {{ r.name }} — {{ r.street }}, {{ r.city }}
        </button>
      </div>
    </div>

    <p
      v-if="modelValue.id !== null"
      data-testid="recipient-linked-hint"
      class="text-xs text-gray-500 mb-3"
    >
      Linked to an existing recipient. Editing these fields updates that recipient.
    </p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div v-for="f in fields" :key="f.key">
        <label :for="`recipient-${f.key}`" class="block text-sm font-medium text-gray-700 mb-1">{{
          f.label
        }}</label>
        <input
          :id="`recipient-${f.key}`"
          :data-testid="`recipient-${f.key}`"
          :value="modelValue[f.key]"
          type="text"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          @input="update(f.key, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
  </div>
</template>
