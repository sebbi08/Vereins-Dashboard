<script setup lang="ts">
import AutoComplete, {
  type AutoCompleteCompleteEvent,
  type AutoCompleteOptionSelectEvent,
} from 'primevue/autocomplete';
import type { DonorDto } from 'shared';
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: DonorDto | null;
  inputId?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: DonorDto | null];
  neu: [daten: { name: string; street: string; city: string }];
}>();

/** Pseudo option at the end of the list: create a new donor from the typed name. */
const NEW_DONOR_ID = -1;

const query = ref(props.modelValue?.name ?? '');
const suggestions = ref<DonorDto[]>([]);

watch(
  () => props.modelValue,
  (donor) => {
    if (donor) query.value = donor.name;
  },
);

function newDonorOption(name: string): DonorDto {
  return { id: NEW_DONOR_ID, name, street: '', city: '', letterSalutation: '' };
}

async function search(event: AutoCompleteCompleteEvent) {
  const q = event.query.trim();
  if (q.length < 2) {
    suggestions.value = [];
    return;
  }
  let donors: DonorDto[] = [];
  try {
    const res = await fetch(`/api/donor?q=${encodeURIComponent(q)}`);
    if (res.ok) donors = await res.json();
  } catch {
    // offer "new donor" only
  }
  suggestions.value = [...donors, newDonorOption(q)];
}

function onInput(value: string | DonorDto | null) {
  // Picking an option also emits the object here; onSelect handles that case
  if (typeof value === 'string' || value === null) {
    query.value = value ?? '';
    emit('update:modelValue', null);
  }
}

function onSelect(event: AutoCompleteOptionSelectEvent) {
  const donor = event.value as DonorDto;
  query.value = donor.name;
  if (donor.id === NEW_DONOR_ID) {
    emit('neu', { name: donor.name, street: '', city: '' });
  } else {
    emit('update:modelValue', donor);
  }
}
</script>

<template>
  <AutoComplete
    :model-value="query"
    :input-id="inputId"
    :suggestions="suggestions"
    option-label="name"
    placeholder="Search donor…"
    :min-length="2"
    :delay="250"
    fluid
    data-testid="donor-search"
    @complete="search"
    @option-select="onSelect"
    @update:model-value="onInput"
  >
    <template #option="{ option }">
      <span v-if="option.id === NEW_DONOR_ID" class="donor-option donor-option--new">
        <i class="pi pi-plus" aria-hidden="true"></i>
        Create “{{ option.name }}” as new donor
      </span>
      <span v-else class="donor-option">
        <span class="donor-option__name">{{ option.name }}</span>
        <span class="muted">{{ option.city }}</span>
      </span>
    </template>
  </AutoComplete>
</template>

<style scoped>
.donor-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.donor-option__name {
  font-weight: 500;
}

.donor-option--new {
  color: var(--p-primary-color);
}
</style>
