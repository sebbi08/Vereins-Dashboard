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
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import Tag from 'primevue/tag';
import type { InvoiceDraftListItem, InvoiceListItem } from 'shared';
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import AmountRangeFilter from '../components/ui/AmountRangeFilter.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusTag from '../components/ui/StatusTag.vue';
import { useBatchDownload } from '../composables/useBatchDownload';
import { useNotify } from '../composables/useNotify';
import { useTableFilters } from '../composables/useTableFilters';
import { useAppStore } from '../stores/app';
import { formatCents, formatDate, formatTimestampDate } from '../utils/format';
import { invoiceNumberSortKey } from '../utils/invoiceNumberSort';
import {
  DOCUMENT_STATUS_FILTER_OPTIONS,
  documentStatusTag,
  EMAIL_STATUS_OPTIONS,
  emailStatusTag,
} from '../utils/statusTags';
import { globalFilter, TABLE_DEFAULTS } from '../utils/tableDefaults';
import { AMOUNT_RANGE, DATE_RANGE } from '../utils/tableFilters';
import { isControlClick } from '../utils/tableRowClick';

const router = useRouter();
const store = useAppStore();
const notify = useNotify();

const invoices = ref<InvoiceListItem[]>([]);
const drafts = ref<InvoiceDraftListItem[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const selection = ref<InvoiceListItem[]>([]);

/** Rows hidden by a filter leave the selection, so "Download selected" only takes what is shown. */
function keepVisibleSelection(visible: InvoiceListItem[]) {
  const shown = new Set(visible.map((row) => row.id));
  if (selection.value.some((row) => !shown.has(row.id))) {
    selection.value = selection.value.filter((row) => shown.has(row.id));
  }
}

function defaultFilters(): DataTableFilterMeta {
  return {
    ...globalFilter(),
    number: { value: null, matchMode: FilterMatchMode.CONTAINS },
    recipientName: { value: null, matchMode: FilterMatchMode.CONTAINS },
    amountCents: { value: null, matchMode: AMOUNT_RANGE },
    invoiceDate: { value: null, matchMode: DATE_RANGE },
    emailStatus: { value: null, matchMode: FilterMatchMode.EQUALS },
    status: { value: 'AKTIV', matchMode: FilterMatchMode.EQUALS },
  };
}

const { filters, globalSearch, statusFilter, clearFilters } = useTableFilters(defaultFilters);

const { download, downloading } = useBatchDownload({
  url: '/api/invoice/download-batch',
  fallbackFileName: 'rechnungen.zip',
  singular: 'invoice',
  plural: 'invoices',
});

async function downloadSelected() {
  const rejected = new Set(await download(selection.value.map((i) => i.id)));
  if (rejected.size > 0) selection.value = selection.value.filter((i) => !rejected.has(i.id));
}

async function loadInvoices() {
  loading.value = true;
  loadFailed.value = false;
  try {
    const res = await fetch('/api/invoice?withCancelled=true');
    if (!res.ok) throw new Error('load failed');
    invoices.value = await res.json();
  } catch {
    loadFailed.value = true;
    notify.error('Error loading invoices');
  } finally {
    loading.value = false;
  }
}

async function loadDrafts() {
  try {
    const res = await fetch('/api/invoice-draft');
    if (!res.ok) throw new Error('load failed');
    drafts.value = await res.json();
  } catch {
    notify.error('Error loading drafts');
  }
}

onMounted(() => {
  void loadInvoices();
  void loadDrafts();
});

function onInvoiceRowClick(event: DataTableRowClickEvent<InvoiceListItem>) {
  if (isControlClick(event.originalEvent)) return;
  router.push(`/invoice/${event.data.id}`);
}

function onDraftRowClick(event: DataTableRowClickEvent<InvoiceDraftListItem>) {
  if (isControlClick(event.originalEvent)) return;
  router.push(`/invoice/draft/${event.data.id}`);
}
</script>

<template>
  <div class="page">
    <PageHeader title="Invoices">
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
          @click="router.push('/invoice/settings')"
        />
        <Button
          label="New Invoice"
          icon="pi pi-plus"
          :disabled="!store.invoiceTemplateAvailable"
          :title="
            store.invoiceTemplateAvailable
              ? undefined
              : 'Please upload an invoice template in Settings first'
          "
          data-testid="new-invoice"
          @click="router.push('/invoice/new')"
        />
      </template>
    </PageHeader>

    <div class="stack">
      <Message
        v-if="store.invoiceTemplateAvailable === false"
        severity="warn"
        data-testid="no-template-warning"
      >
        No invoice template uploaded. Please upload a template before creating invoices.
        <RouterLink to="/invoice/settings">Go to Settings →</RouterLink>
      </Message>

      <section v-if="drafts.length > 0" data-testid="drafts-section" class="stack gap-sm">
        <h3 class="section-title">Drafts ({{ drafts.length }})</h3>
        <DataTable
          :value="drafts"
          data-key="id"
          size="small"
          row-hover
          :row-class="() => 'draft-row'"
          @row-click="onDraftRowClick"
        >
          <Column field="recipientName" header="Recipient" sortable>
            <template #body="{ data }">
              <RouterLink :to="`/invoice/draft/${data.id}`">{{ data.recipientName }}</RouterLink>
            </template>
          </Column>
          <Column field="title" header="Title">
            <template #body="{ data }">{{ data.title || '—' }}</template>
          </Column>
          <Column field="amountCents" header="Amount" sortable class="col-amount">
            <template #body="{ data }">{{ formatCents(data.amountCents) }}</template>
          </Column>
          <Column field="updatedAt" header="Last edited" sortable>
            <template #body="{ data }">{{ formatTimestampDate(data.updatedAt) }}</template>
          </Column>
          <Column header="Status">
            <template #body><Tag value="Draft" severity="warn" /></template>
          </Column>
        </DataTable>
      </section>

      <DataTable
        v-model:selection="selection"
        v-model:filters="filters"
        :value="invoices"
        data-key="id"
        v-bind="TABLE_DEFAULTS"
        :global-filter-fields="['number', 'recipientName']"
        :loading="loading"
        row-hover
        :row-class="() => 'invoice-row'"
        @value-change="keepVisibleSelection"
        @row-click="onInvoiceRowClick"
      >
        <template #header>
          <div class="row row--between">
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText
                v-model="globalSearch"
                placeholder="Search by name or number…"
                aria-label="Search invoices"
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
            >Invoices could not be loaded. Reload the page to try again.</span
          >
          <span v-else>No invoices found.</span>
        </template>

        <Column selection-mode="multiple" header-style="width: 3rem" />
        <Column
          field="number"
          header="Number"
          sortable
          :sort-field="(row: InvoiceListItem) => invoiceNumberSortKey(row.number)"
          :show-filter-menu="false"
          class="col-number"
        >
          <template #body="{ data }">
            <RouterLink :to="`/invoice/${data.id}`" class="mono">{{ data.number }}</RouterLink>
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
          field="recipientName"
          header="Recipient"
          sortable
          :show-filter-menu="false"
          class="col-recipient"
        >
          <template #filter="{ filterModel, filterCallback }">
            <InputText
              v-model="filterModel.value"
              size="small"
              placeholder="Recipient"
              fluid
              aria-label="Filter by recipient"
              @input="filterCallback()"
            />
          </template>
        </Column>
        <Column
          field="amountCents"
          header="Amount"
          sortable
          :show-filter-menu="false"
          class="col-amount"
        >
          <template #body="{ data }">{{ formatCents(data.amountCents) }}</template>
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
          field="invoiceDate"
          header="Invoice Date"
          sortable
          :show-filter-menu="false"
          class="col-date"
        >
          <template #body="{ data }">{{ formatDate(data.invoiceDate) }}</template>
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
              aria-label="Filter by invoice date"
              @update:model-value="filterCallback()"
            />
          </template>
        </Column>
        <Column field="activeRevisionNumber" header="Rev.">
          <template #body="{ data }">R{{ data.activeRevisionNumber ?? '–' }}</template>
        </Column>
        <Column field="emailStatus" header="Email" :show-filter-menu="false" class="col-email">
          <template #body="{ data }"
            ><StatusTag :tag="emailStatusTag(data.emailStatus)"
          /></template>
          <template #filter="{ filterModel, filterCallback }">
            <Select
              v-model="filterModel.value"
              :options="EMAIL_STATUS_OPTIONS"
              option-label="label"
              option-value="value"
              placeholder="Any"
              fluid
              show-clear
              size="small"
              aria-label="Filter by email status"
              @change="filterCallback()"
            />
          </template>
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
              data-testid="copy-invoice"
              @click.stop="router.push(`/invoice/new?copyFrom=${data.id}`)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
:deep(.col-number) {
  width: 8rem;
  white-space: nowrap;
}

:deep(.col-recipient) {
  width: 11rem;
}

:deep(.col-date) {
  width: 10rem;
}

:deep(.col-email) {
  width: 9rem;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875rem;
}

:deep(.invoice-row),
:deep(.draft-row) {
  cursor: pointer;
}
</style>
