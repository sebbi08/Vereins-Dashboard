<script setup lang="ts">
import { FilterMatchMode } from '@primevue/core/api';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, {
  type DataTableFilterMeta,
  type DataTableRowClickEvent,
} from 'primevue/datatable';
import DatePicker from 'primevue/datepicker';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import SelectButton from 'primevue/selectbutton';
import type { DonationReceiptListItem } from 'shared';
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import AmountRangeFilter from '../components/ui/AmountRangeFilter.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusTag from '../components/ui/StatusTag.vue';
import { useBatchDownload } from '../composables/useBatchDownload';
import { useNotify } from '../composables/useNotify';
import { useTableFilters } from '../composables/useTableFilters';
import { useAppStore } from '../stores/app';
import { formatCents, formatDate } from '../utils/format';
import { DOCUMENT_STATUS_FILTER_OPTIONS, documentStatusTag } from '../utils/statusTags';
import { globalFilter, TABLE_DEFAULTS } from '../utils/tableDefaults';
import { AMOUNT_RANGE, DATE_RANGE } from '../utils/tableFilters';
import { isControlClick } from '../utils/tableRowClick';

const router = useRouter();
const store = useAppStore();
const notify = useNotify();

const receipts = ref<DonationReceiptListItem[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const selection = ref<DonationReceiptListItem[]>([]);

/** Rows hidden by a filter leave the selection, so "Download selected" only takes what is shown. */
function keepVisibleSelection(visible: DonationReceiptListItem[]) {
  const shown = new Set(visible.map((row) => row.id));
  if (selection.value.some((row) => !shown.has(row.id))) {
    selection.value = selection.value.filter((row) => shown.has(row.id));
  }
}

function defaultFilters(): DataTableFilterMeta {
  return {
    ...globalFilter(),
    number: { value: null, matchMode: FilterMatchMode.CONTAINS },
    donorName: { value: null, matchMode: FilterMatchMode.CONTAINS },
    donationAmountCents: { value: null, matchMode: AMOUNT_RANGE },
    donationDate: { value: null, matchMode: DATE_RANGE },
    status: { value: 'AKTIV', matchMode: FilterMatchMode.EQUALS },
  };
}

const { filters, globalSearch, statusFilter, clearFilters } = useTableFilters(defaultFilters);

const { download, downloading } = useBatchDownload({
  url: '/api/donation-receipt/download-batch',
  fallbackFileName: 'quittungen.zip',
  singular: 'receipt',
  plural: 'receipts',
});

async function downloadSelected() {
  const rejected = new Set(await download(selection.value.map((r) => r.id)));
  if (rejected.size > 0) selection.value = selection.value.filter((r) => !rejected.has(r.id));
}

async function loadReceipts() {
  loading.value = true;
  loadFailed.value = false;
  try {
    const res = await fetch('/api/donation-receipt?withCancelled=true');
    if (!res.ok) throw new Error('load failed');
    receipts.value = await res.json();
  } catch {
    loadFailed.value = true;
    notify.error('Error loading receipts');
  } finally {
    loading.value = false;
  }
}

onMounted(loadReceipts);

function onRowClick(event: DataTableRowClickEvent<DonationReceiptListItem>) {
  if (isControlClick(event.originalEvent)) return;
  router.push(`/donation-receipt/${event.data.id}`);
}
</script>

<template>
  <div class="page">
    <PageHeader title="Donation Receipts">
      <template #actions>
        <Button
          :label="`Download selected (${selection.length})`"
          icon="pi pi-download"
          severity="secondary"
          outlined
          :disabled="selection.length === 0"
          :loading="downloading"
          data-testid="download-selected"
          @click="downloadSelected"
        />
        <Button
          label="Settings"
          icon="pi pi-cog"
          severity="secondary"
          outlined
          @click="router.push('/donation-receipt/settings')"
        />
        <Button
          label="New Receipt"
          icon="pi pi-plus"
          :disabled="!store.receiptTemplateAvailable"
          :title="
            store.receiptTemplateAvailable
              ? undefined
              : 'Please upload a donation receipt template in Settings first'
          "
          data-testid="new-receipt"
          @click="router.push('/donation-receipt/new')"
        />
      </template>
    </PageHeader>

    <div class="stack">
      <Message
        v-if="store.receiptTemplateAvailable === false"
        severity="warn"
        data-testid="no-template-warning"
      >
        No donation receipt template uploaded. Please upload a template before creating receipts.
        <RouterLink to="/donation-receipt/settings">Go to Settings →</RouterLink>
      </Message>

      <DataTable
        v-model:selection="selection"
        v-model:filters="filters"
        :value="receipts"
        data-key="id"
        v-bind="TABLE_DEFAULTS"
        :global-filter-fields="['number', 'donorName']"
        :loading="loading"
        row-hover
        :row-class="() => 'receipt-row'"
        @value-change="keepVisibleSelection"
        @row-click="onRowClick"
      >
        <template #header>
          <div class="row row--between">
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText
                v-model="globalSearch"
                placeholder="Search by name or number…"
                aria-label="Search receipts"
                data-testid="global-search"
              />
            </IconField>
            <SelectButton
              v-model="statusFilter"
              :options="DOCUMENT_STATUS_FILTER_OPTIONS"
              option-label="label"
              option-value="value"
              :allow-empty="false"
              aria-label="Filter by status"
              data-testid="status-filter"
            />
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
            >Receipts could not be loaded. Reload the page to try again.</span
          >
          <span v-else>No receipts found.</span>
        </template>

        <Column selection-mode="multiple" header-style="width: 3rem" />
        <Column
          field="number"
          header="Number"
          sortable
          :show-filter-menu="false"
          class="col-number"
        >
          <template #body="{ data }">
            <RouterLink :to="`/donation-receipt/${data.id}`" class="mono">{{
              data.number
            }}</RouterLink>
          </template>
          <template #filter="{ filterModel, filterCallback }">
            <InputText
              v-model="filterModel.value"
              size="small"
              placeholder="Number"
              fluid
              aria-label="Filter by number"
              @input="filterCallback()"
            />
          </template>
        </Column>
        <Column
          field="donorName"
          header="Donor"
          sortable
          :show-filter-menu="false"
          class="col-donor"
        >
          <template #filter="{ filterModel, filterCallback }">
            <InputText
              v-model="filterModel.value"
              size="small"
              placeholder="Donor"
              fluid
              aria-label="Filter by donor"
              @input="filterCallback()"
            />
          </template>
        </Column>
        <Column
          field="donationAmountCents"
          header="Amount"
          sortable
          :show-filter-menu="false"
          class="col-amount"
        >
          <template #body="{ data }">{{ formatCents(data.donationAmountCents) }}</template>
          <template #filter="{ filterModel, filterCallback }">
            <AmountRangeFilter
              :model-value="filterModel.value"
              label="Amount"
              @update:model-value="
                (value) => {
                  filterModel.value = value;
                  filterCallback();
                }
              "
            />
          </template>
        </Column>
        <Column
          field="donationDate"
          header="Donation Date"
          sortable
          :show-filter-menu="false"
          class="col-date"
        >
          <template #body="{ data }">{{ formatDate(data.donationDate) }}</template>
          <template #filter="{ filterModel, filterCallback }">
            <DatePicker
              v-model="filterModel.value"
              selection-mode="range"
              :manual-input="false"
              date-format="dd.mm.yy"
              show-button-bar
              size="small"
              placeholder="Date range"
              fluid
              aria-label="Filter by donation date"
              @update:model-value="filterCallback()"
            />
          </template>
        </Column>
        <Column field="activeRevisionNumber" header="Rev.">
          <template #body="{ data }">R{{ data.activeRevisionNumber ?? '–' }}</template>
        </Column>
        <Column field="status" header="Status">
          <template #body="{ data }"><StatusTag :tag="documentStatusTag(data.status)" /></template>
        </Column>
        <Column header-style="width: 6rem">
          <template #body="{ data }">
            <Button
              label="Copy"
              icon="pi pi-copy"
              size="small"
              text
              data-testid="copy-receipt"
              @click.stop="router.push(`/donation-receipt/new?copyFrom=${data.id}`)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
:deep(.col-number) {
  width: 9rem;
  white-space: nowrap;
}

:deep(.col-donor) {
  width: 12rem;
}

:deep(.col-date) {
  width: 10rem;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875rem;
}

:deep(.receipt-row) {
  cursor: pointer;
}
</style>
