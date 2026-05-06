<script setup lang="ts">
import type { SpenderDto } from 'shared';
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: SpenderDto | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: SpenderDto | null];
  neu: [daten: { anrede: string; name: string; strasse: string; ort: string }];
}>();

const query = ref(props.modelValue?.name ?? '');
const ergebnisse = ref<SpenderDto[]>([]);
const offen = ref(false);
let debounceTimer: ReturnType<typeof setTimeout>;

watch(
  () => props.modelValue,
  (v) => {
    if (v) query.value = v.name;
  },
);

function onBlur() {
  window.setTimeout(() => (offen.value = false), 150);
}

async function suchen(q: string) {
  if (q.length < 2) {
    ergebnisse.value = [];
    offen.value = false;
    return;
  }
  const res = await fetch(`/api/spender?q=${encodeURIComponent(q)}`);
  ergebnisse.value = await res.json();
  offen.value = true;
}

function onInput() {
  clearTimeout(debounceTimer);
  emit('update:modelValue', null);
  debounceTimer = setTimeout(() => suchen(query.value), 250);
}

function auswaehlen(spender: SpenderDto) {
  emit('update:modelValue', spender);
  query.value = spender.name;
  offen.value = false;
}

function neu() {
  offen.value = false;
  emit('neu', { anrede: '', name: query.value, strasse: '', ort: '' });
}
</script>

<template>
  <div class="relative">
    <input
      v-model="query"
      type="text"
      class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      placeholder="Spender suchen..."
      @input="onInput"
      @blur="onBlur"
      @focus="ergebnisse.length ? (offen = true) : null"
    />
    <ul
      v-if="offen"
      class="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
    >
      <li
        v-for="s in ergebnisse"
        :key="s.id"
        class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"
        @mousedown.prevent="auswaehlen(s)"
      >
        <span class="font-medium">{{ s.name }}</span>
        <span class="text-gray-400 ml-2 text-xs">{{ s.ort }}</span>
      </li>
      <li
        v-if="query.length >= 2"
        class="px-3 py-2 text-sm cursor-pointer text-blue-600 hover:bg-blue-50 border-t border-gray-100"
        @mousedown.prevent="neu"
      >
        + „{{ query }}" als neuen Spender anlegen
      </li>
    </ul>
  </div>
</template>
