<script setup lang="ts">
import type { DonorDto } from 'shared';
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: DonorDto | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: DonorDto | null];
  neu: [daten: { name: string; street: string; city: string }];
}>();

const query = ref(props.modelValue?.name ?? '');
const results = ref<DonorDto[]>([]);
const offen = ref(false);
let debounceTimer: ReturnType<typeof setTimeout>;

watch(
  () => props.modelValue,
  (v) => {
    if (v) query.value = v.name;
  },
);

function onBlur() {
  window.setTimeout(() => (open.value = false), 150);
}

async function search(q: string) {
  if (q.length < 2) {
    results.value = [];
    open.value = false;
    return;
  }
  const res = await fetch(`/api/donor?q=${encodeURIComponent(q)}`);
  results.value = await res.json();
  open.value = true;
}

function onInput() {
  clearTimeout(debounceTimer);
  emit('update:modelValue', null);
  debounceTimer = setTimeout(() => search(query.value), 250);
}

function select(spender: DonorDto) {
  emit('update:modelValue', spender);
  query.value = spender.name;
  open.value = false;
}

function neu() {
  open.value = false;
  emit('neu', { name: query.value, street: '', city: '' });
}
</script>

<template>
  <div class="relative">
    <input
      v-model="query"
      type="text"
      class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      placeholder="Search donor..."
      @input="onInput"
      @blur="onBlur"
      @focus="results.length ? (offen = true) : null"
    />
    <ul
      v-if="offen"
      class="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
    >
      <li
        v-for="s in results"
        :key="s.id"
        class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"
        @mousedown.prevent="select(s)"
      >
        <span class="font-medium">{{ s.name }}</span>
        <span class="text-gray-400 ml-2 text-xs">{{ s.city }}</span>
      </li>
      <li
        v-if="query.length >= 2"
        class="px-3 py-2 text-sm cursor-pointer text-blue-600 hover:bg-blue-50 border-t border-gray-100"
        @mousedown.prevent="neu"
      >
        + „{{ query }}" als new donor
      </li>
    </ul>
  </div>
</template>
