<script setup lang="ts">
import AutoComplete, {
  type AutoCompleteCompleteEvent,
  type AutoCompleteOptionSelectEvent,
} from 'primevue/autocomplete';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import type { InvoiceRecipientDto } from 'shared';
import { ref, watch } from 'vue';
import { emptyRecipient, fromRecipientDto, type RecipientFormValue } from '../utils/recipientForm';

const props = defineProps<{
  modelValue: RecipientFormValue;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: RecipientFormValue];
}>();

type FieldKey = keyof Omit<RecipientFormValue, 'id'>;

const fields: { key: FieldKey; label: string }[] = [
  { key: 'salutation', label: 'Salutation' },
  { key: 'name', label: 'Name' },
  { key: 'street', label: 'Street' },
  { key: 'city', label: 'Postal code / City' },
  { key: 'email', label: 'Email' },
];

const search = ref(props.modelValue.name);
const suggestions = ref<InvoiceRecipientDto[]>([]);
/** Bumped by every user action; a search response from an older action is stale. */
let latestAction = 0;

watch(
  () => props.modelValue.id,
  () => {
    search.value = props.modelValue.name;
  },
);

function invalidatePendingSearch() {
  latestAction++;
  suggestions.value = [];
}

async function onComplete(event: AutoCompleteCompleteEvent) {
  const query = event.query.trim();
  const action = ++latestAction;
  if (!query) {
    suggestions.value = [];
    return;
  }
  try {
    const res = await fetch(`/api/invoice-recipient?search=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('search failed');
    const found = (await res.json()) as InvoiceRecipientDto[];
    if (action === latestAction) suggestions.value = found;
  } catch {
    if (action === latestAction) suggestions.value = [];
  }
}

function onSearchInput(value: string | InvoiceRecipientDto | null) {
  // Picking an option also emits the object here; onSelect handles that case
  if (typeof value === 'string' || value === null) {
    search.value = value ?? '';
    // Drop in-flight responses but keep the shown suggestions until the next search
    // answers, so the overlay does not flash "No results found" on every keystroke
    latestAction++;
    if (!search.value) suggestions.value = [];
  }
}

function onSelect(event: AutoCompleteOptionSelectEvent) {
  const recipient = event.value as InvoiceRecipientDto;
  invalidatePendingSearch();
  search.value = recipient.name;
  emit('update:modelValue', fromRecipientDto(recipient));
}

function startNew() {
  invalidatePendingSearch();
  emit('update:modelValue', { ...emptyRecipient(), name: search.value.trim() });
}

function update(field: FieldKey, value: string) {
  emit('update:modelValue', { ...props.modelValue, [field]: value });
}
</script>

<template>
  <div class="stack">
    <div class="field">
      <label for="recipient-search">Search or create recipient</label>
      <div class="row gap-sm recipient-search">
        <AutoComplete
          :model-value="search"
          input-id="recipient-search"
          data-testid="recipient-search"
          :suggestions="suggestions"
          option-label="name"
          placeholder="Enter name…"
          :delay="250"
          class="recipient-search__input"
          fluid
          @complete="onComplete"
          @option-select="onSelect"
          @update:model-value="onSearchInput"
        >
          <template #option="{ option }">
            {{ option.name }} — {{ option.street }}, {{ option.city }}
          </template>
        </AutoComplete>
        <Button
          label="New recipient"
          icon="pi pi-user-plus"
          severity="secondary"
          outlined
          data-testid="recipient-new"
          @click="startNew"
        />
      </div>
    </div>

    <p v-if="modelValue.id !== null" data-testid="recipient-linked-hint" class="muted hint">
      Linked to an existing recipient. Editing these fields updates that recipient.
    </p>

    <div class="grid-2">
      <div v-for="f in fields" :key="f.key" class="field">
        <label :for="`recipient-${f.key}`">{{ f.label }}</label>
        <InputText
          :id="`recipient-${f.key}`"
          :data-testid="`recipient-${f.key}`"
          :model-value="modelValue[f.key]"
          fluid
          @update:model-value="(value: string | undefined) => update(f.key, value ?? '')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.recipient-search {
  flex-wrap: nowrap;
}

.recipient-search__input {
  flex: 1;
  min-width: 0;
}

.hint {
  margin: 0;
  font-size: 0.8125rem;
}
</style>
