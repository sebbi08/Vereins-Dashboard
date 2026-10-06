<script setup lang="ts">
import { FilterMatchMode } from '@primevue/core/api';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, {
  type DataTableFilterMeta,
  type DataTableRowClickEvent,
} from 'primevue/datatable';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import {
  DEFAULT_WEEKS_PER_MONTH,
  type InstructorListItemDto,
  type InstructorSettingsDto,
  validateWeeksPerMonth,
} from 'shared';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import InvoiceTextSettings from '../components/InvoiceTextSettings.vue';
import AmountRangeFilter from '../components/ui/AmountRangeFilter.vue';
import DecimalInput from '../components/ui/DecimalInput.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useNotify } from '../composables/useNotify';
import { useTableFilters } from '../composables/useTableFilters';
import { useAppStore } from '../stores/app';
import { formatCents, formatHours } from '../utils/format';
import { globalFilter, TABLE_DEFAULTS } from '../utils/tableDefaults';
import { AMOUNT_RANGE } from '../utils/tableFilters';
import { isControlClick } from '../utils/tableRowClick';

const router = useRouter();
const store = useAppStore();
const notify = useNotify();

// ── Instructors ─────────────────────────────
const instructors = ref<InstructorListItemDto[]>([]);
/** Rows left after filtering; the footer sum follows them. */
const visibleInstructors = ref<InstructorListItemDto[]>([]);
const loading = ref(false);
const loadFailed = ref(false);

watch(instructors, (all) => {
  visibleInstructors.value = all;
});

function defaultFilters(): DataTableFilterMeta {
  return {
    ...globalFilter(),
    name: { value: null, matchMode: FilterMatchMode.CONTAINS },
    'calculation.totalCents': { value: null, matchMode: AMOUNT_RANGE },
  };
}

const { filters, globalSearch, clearFilters } = useTableFilters(defaultFilters);

const visibleTotalCents = computed(() =>
  visibleInstructors.value.reduce((sum, i) => sum + i.calculation.totalCents, 0),
);

function onValueChange(rows: InstructorListItemDto[]) {
  visibleInstructors.value = rows;
}

async function loadInstructors() {
  loading.value = true;
  loadFailed.value = false;
  try {
    const res = await fetch('/api/instructor');
    if (!res.ok) throw new Error('load failed');
    instructors.value = await res.json();
  } catch {
    loadFailed.value = true;
    notify.error('Error loading instructors');
  } finally {
    loading.value = false;
  }
}

function onRowClick(event: DataTableRowClickEvent<InstructorListItemDto>) {
  if (isControlClick(event.originalEvent)) return;
  router.push(`/instructor/${event.data.id}`);
}

// ── Calculation settings ─────────────────────────────
const weeksPerMonth = ref<number | null>(DEFAULT_WEEKS_PER_MONTH);
const savedWeeksPerMonth = ref(DEFAULT_WEEKS_PER_MONTH);
const settingsLoaded = ref(false);
const settingsLoadError = ref('');
const savingSettings = ref(false);

const weeksError = computed(() => validateWeeksPerMonth(weeksPerMonth.value ?? Number.NaN));
const canSaveSettings = computed(
  () => settingsLoaded.value && !weeksError.value && !savingSettings.value,
);

const weeksFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const panelHeader = computed(
  () => `Calculation settings (${weeksFormat.format(savedWeeksPerMonth.value)} weeks/month)`,
);

async function loadSettings() {
  try {
    const res = await fetch('/api/instructor/settings');
    if (!res.ok) throw new Error('load failed');
    const value = ((await res.json()) as InstructorSettingsDto).weeksPerMonth;
    weeksPerMonth.value = value;
    savedWeeksPerMonth.value = value;
    settingsLoaded.value = true;
  } catch {
    settingsLoadError.value = 'Could not load settings';
  }
}

async function saveSettings() {
  if (!canSaveSettings.value || weeksPerMonth.value === null) return;
  const value = weeksPerMonth.value;
  savingSettings.value = true;
  try {
    const res = await fetch('/api/instructor/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeksPerMonth: value }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      notify.error(body.error ?? 'Saving failed');
      return;
    }
  } catch {
    notify.error('Saving failed');
    return;
  } finally {
    savingSettings.value = false;
  }
  savedWeeksPerMonth.value = value;
  notify.success('Weeks per month saved');
  await loadInstructors();
}

onMounted(async () => {
  await Promise.all([
    loadSettings(),
    loadInstructors(),
    store.invoiceTemplateAvailable === null ? store.checkTemplates() : Promise.resolve(),
  ]);
});
</script>

<template>
  <div class="page">
    <PageHeader title="Instructor Rent">
      <template #actions>
        <Button
          label="New instructor"
          icon="pi pi-plus"
          data-testid="new-instructor"
          @click="router.push('/instructor/new')"
        />
      </template>
    </PageHeader>

    <div class="stack">
      <Panel :header="panelHeader" toggleable collapsed data-testid="calculation-settings">
        <div class="stack gap-lg">
          <div class="stack gap-sm">
            <div class="row gap-sm weeks-row">
              <div class="field">
                <label for="weeks-per-month">Weeks per month</label>
                <DecimalInput
                  v-model="weeksPerMonth"
                  input-id="weeks-per-month"
                  data-testid="weeks-per-month"
                  :max-fraction-digits="2"
                  :invalid="!!weeksError"
                  class="weeks-input"
                />
              </div>
              <Button
                label="Save"
                icon="pi pi-check"
                severity="secondary"
                outlined
                :disabled="!canSaveSettings"
                :loading="savingSettings"
                data-testid="save-settings"
                @click="saveSettings"
              />
            </div>
            <Message
              v-if="settingsLoadError"
              severity="error"
              size="small"
              data-testid="settings-load-error"
            >
              {{ settingsLoadError }}
            </Message>
            <Message
              v-else-if="weeksError"
              severity="error"
              size="small"
              variant="simple"
              data-testid="weeks-error"
            >
              {{ weeksError }}
            </Message>
          </div>

          <InvoiceTextSettings
            :preview-instructor-id="instructors[0]?.id ?? null"
            :weeks-per-month="weeksPerMonth ?? 0"
          />
        </div>
      </Panel>

      <DataTable
        v-model:filters="filters"
        :value="instructors"
        data-key="id"
        v-bind="TABLE_DEFAULTS"
        :global-filter-fields="['name']"
        :loading="loading"
        row-hover
        :row-class="() => 'instructor-row'"
        @row-click="onRowClick"
        @value-change="onValueChange"
      >
        <template #header>
          <div class="row row--between">
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText
                v-model="globalSearch"
                placeholder="Search by name…"
                aria-label="Search instructors"
                data-testid="global-search"
              />
            </IconField>
            <Button
              label="Clear filters"
              icon="pi pi-filter-slash"
              text
              data-testid="clear-filters"
              @click="clearFilters"
            />
          </div>
        </template>
        <template #empty>
          <span v-if="loadFailed" data-testid="list-load-error"
            >Instructors could not be loaded. Reload the page to try again.</span
          >
          <span v-else>No instructors yet.</span>
        </template>

        <Column field="name" header="Name" sortable :show-filter-menu="false">
          <template #body="{ data }">
            <RouterLink :to="`/instructor/${data.id}`">{{ data.name }}</RouterLink>
          </template>
          <template #filter="{ filterModel, filterCallback }">
            <InputText
              v-model="filterModel.value"
              size="small"
              placeholder="Name"
              fluid
              aria-label="Filter by name"
              @input="filterCallback()"
            />
          </template>
          <template #footer><span class="strong">Sum</span></template>
        </Column>
        <Column field="hourlyRateCents" header="Hourly rate (net)" sortable class="col-amount">
          <template #body="{ data }">{{ formatCents(data.hourlyRateCents) }}</template>
        </Column>
        <Column field="calculation.netMinutesPerWeek" header="h/week" sortable class="col-amount">
          <template #body="{ data }">{{
            formatHours(data.calculation.netMinutesPerWeek)
          }}</template>
        </Column>
        <Column
          field="calculation.monthlyCents"
          header="Per month (net)"
          sortable
          class="col-amount"
        >
          <template #body="{ data }">{{ formatCents(data.calculation.monthlyCents) }}</template>
        </Column>
        <Column field="months" header="Months" sortable class="col-amount" />
        <Column
          field="calculation.totalCents"
          header="Total (net)"
          sortable
          :show-filter-menu="false"
          class="col-amount"
        >
          <template #body="{ data }">
            <span class="strong">{{ formatCents(data.calculation.totalCents) }}</span>
          </template>
          <template #filter="{ filterModel, filterCallback }">
            <AmountRangeFilter
              :model-value="filterModel.value"
              label="Total"
              @update:model-value="
                (value) => {
                  filterModel.value = value;
                  filterCallback();
                }
              "
            />
          </template>
          <template #footer>
            <span data-testid="footer-total" class="strong">{{
              formatCents(visibleTotalCents)
            }}</span>
          </template>
        </Column>
        <Column header-style="width: 10rem">
          <template #body="{ data }">
            <Button
              label="Create invoice"
              icon="pi pi-file"
              size="small"
              text
              :disabled="store.invoiceTemplateAvailable === false"
              :title="store.invoiceTemplateAvailable === false ? 'No active invoice template' : ''"
              :data-testid="`create-invoice-${data.id}`"
              @click.stop="router.push(`/invoice/new?fromInstructor=${data.id}`)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.weeks-row {
  align-items: flex-end;
}

.weeks-input {
  width: 8rem;
}

.strong {
  font-weight: 600;
}

:deep(.instructor-row) {
  cursor: pointer;
}
</style>
