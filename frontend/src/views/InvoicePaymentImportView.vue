<script setup lang="ts">
import Button from 'primevue/button';
import Card from 'primevue/card';
import Checkbox from 'primevue/checkbox';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import DatePicker from 'primevue/datepicker';
import Message from 'primevue/message';
import Select from 'primevue/select';
import {
  BOOKING_COLUMN_KEYS,
  DEFAULT_BOOKING_IMPORT_SETTINGS,
  type BookingColumnKey,
  type BookingEncoding,
  type BookingImportSettings,
  type MatchResult,
  type StoredBookingImportSettings,
} from 'shared';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusTag from '../components/ui/StatusTag.vue';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import {
  decodeBookingFile,
  newestBookingDate,
  readBookingTable,
  SKIP_REASON_LABELS,
  toBookings,
  type SkippedRow,
} from '../utils/bookingCsv';
import { formatCents, formatDate, fromIsoDate, toIsoDate } from '../utils/format';
import {
  canSelect,
  chooseInvoice,
  chosenCandidate,
  initialRows,
  removePaidInvoices,
  selectedInvoiceIds,
  setSelected,
  takenInvoiceIds,
  type MatchRow,
} from '../utils/paymentSelection';
import { errorMessage, requestJson, type JsonResponse } from '../utils/requestJson';
import { MATCH_REASON_LABELS, matchLevelTag } from '../utils/statusTags';

const router = useRouter();
const notify = useNotify();
const { confirmAction } = useConfirmAction();

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const ENCODING_OPTIONS: { label: string; value: BookingEncoding }[] = [
  { label: 'UTF-16 LE', value: 'utf-16le' },
  { label: 'UTF-8', value: 'utf-8' },
  { label: 'Windows-1252', value: 'windows-1252' },
];
const DELIMITER_OPTIONS = [
  { label: 'Semicolon (;)', value: ';' },
  { label: 'Comma (,)', value: ',' },
  { label: 'Tab', value: '\t' },
];
const COLUMN_LABELS: Record<BookingColumnKey, string> = {
  date: 'Booking date',
  payer: 'Payer',
  purpose: 'Purpose',
  amount: 'Amount',
};
const CONFIRM_ERRORS: Record<string, string> = {
  NOT_FOUND: 'Some invoices no longer exist. Run the match again.',
  CANCELLED: 'Some invoices have been cancelled. Run the match again.',
};

const settings = ref<BookingImportSettings>(structuredClone(DEFAULT_BOOKING_IMPORT_SETTINGS));
const fileBytes = shallowRef<ArrayBuffer | null>(null);
const fileName = ref('');
const result = ref<MatchResult | null>(null);
const rows = ref<MatchRow[]>([]);
const skipped = ref<SkippedRow[]>([]);
/** Only bookings from this day on are matched; starts where the last confirmed import ended. */
const bookingsFrom = ref<Date | null>(null);
const hiddenBefore = ref(0);
const matching = ref(false);
const confirming = ref(false);

onMounted(async () => {
  try {
    const res = await requestJson('/api/settings/booking-import');
    if (!res.ok) {
      notify.error('Import settings could not be loaded');
      return;
    }
    const { lastBookingDate, ...loaded } = structuredClone(
      res.body,
    ) as unknown as StoredBookingImportSettings;
    settings.value = loaded;
    bookingsFrom.value = lastBookingDate ? fromIsoDate(lastBookingDate) : null;
  } catch {
    notify.error('Import settings could not be loaded');
  }
});

const decoded = computed(() =>
  fileBytes.value ? decodeBookingFile(fileBytes.value, settings.value.encoding) : null,
);
/** A byte order mark in the file wins, so the select shows what was actually used. */
const encoding = computed<BookingEncoding>({
  get: () => decoded.value?.encoding ?? settings.value.encoding,
  set: (value) => {
    settings.value.encoding = value;
  },
});
const table = computed(() =>
  decoded.value ? readBookingTable(decoded.value.text, settings.value.delimiter) : null,
);
const header = computed(() => table.value?.header ?? []);
const previewRows = computed(() => table.value?.rows.slice(0, 3) ?? []);
const noBookings = computed(() => table.value !== null && table.value.rows.length === 0);

function mappedColumn(key: BookingColumnKey): string | null {
  const name = settings.value.columns[key];
  return header.value.includes(name) ? name : null;
}

function setColumn(key: BookingColumnKey, name: string | null) {
  settings.value.columns = { ...settings.value.columns, [key]: name ?? '' };
}

const mappedNames = computed(
  () => new Set(BOOKING_COLUMN_KEYS.map((key) => mappedColumn(key)).filter((n) => n !== null)),
);
const canMatch = computed(
  () =>
    table.value !== null &&
    !noBookings.value &&
    BOOKING_COLUMN_KEYS.every((key) => mappedColumn(key) !== null) &&
    !matching.value,
);

// Proposals belong to one file read with one set of settings
watch(
  [settings, fileBytes, bookingsFrom],
  () => {
    result.value = null;
    rows.value = [];
    skipped.value = [];
    hiddenBefore.value = 0;
  },
  { deep: true },
);

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  fileName.value = file?.name ?? '';
  fileBytes.value = file ? await file.arrayBuffer() : null;
}

async function match() {
  const current = table.value;
  if (!current) return;
  const used: BookingImportSettings = { ...settings.value, encoding: encoding.value };
  matching.value = true;
  try {
    const saved = await requestJson('/api/settings/booking-import', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(used),
    });
    if (!saved.ok) notify.error(`Import settings could not be saved: ${errorMessage(saved)}`);

    const converted = toBookings(current.rows, current.header, used.columns);
    const from = bookingsFrom.value ? toIsoDate(bookingsFrom.value) : null;
    const bookings = from
      ? converted.bookings.filter((booking) => booking.date >= from)
      : converted.bookings;
    const res = await requestJson('/api/invoice-payment/match', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ bookings }),
    });
    if (!res.ok) {
      notify.error(errorMessage(res));
      return;
    }
    const body = res.body as unknown as MatchResult;
    result.value = body;
    rows.value = initialRows(body.matches);
    skipped.value = converted.skipped;
    hiddenBefore.value = converted.bookings.length - bookings.length;
  } catch {
    notify.error('Network error');
  } finally {
    matching.value = false;
  }
}

const tableRows = computed(() =>
  rows.value.map((row) => ({ ...row, chosen: chosenCandidate(row) })),
);
const selectedIds = computed(() => selectedInvoiceIds(rows.value));

function invoicesText(count: number): string {
  return `${count} ${count === 1 ? 'invoice' : 'invoices'}`;
}

function toggle(row: MatchRow, selected: boolean) {
  rows.value = setSelected(rows.value, row.key, selected);
}

function choose(row: MatchRow, invoiceId: number | null) {
  rows.value = chooseInvoice(rows.value, row.key, invoiceId);
}

function candidateOptions(row: MatchRow) {
  const taken = takenInvoiceIds(rows.value, row.key);
  return row.match.candidates.map((c) => ({
    label: `${c.invoiceNumber} · ${c.recipientName} · ${formatCents(c.amountCents)}`,
    value: c.invoiceId,
    disabled: taken.has(c.invoiceId),
  }));
}

function reasonText(row: MatchRow): string {
  const chosen = chosenCandidate(row);
  return chosen ? chosen.reasons.map((reason) => MATCH_REASON_LABELS[reason]).join(' · ') : '';
}

function confirmError(res: JsonResponse): string {
  const code = res.body.error;
  return typeof code === 'string' && CONFIRM_ERRORS[code]
    ? CONFIRM_ERRORS[code]
    : errorMessage(res);
}

async function confirmPaid() {
  const ids = selectedIds.value;
  const confirmed = await confirmAction({
    message: `Mark ${invoicesText(ids.length)} as paid?`,
    header: 'Mark as paid',
    acceptLabel: 'Mark as paid',
  });
  if (!confirmed) return;
  const sent = new Set(ids);
  // The next import starts at the newest booking day of this file
  const lastBookingDate = table.value
    ? newestBookingDate(table.value.rows, table.value.header, settings.value.columns.date)
    : null;
  confirming.value = true;
  try {
    const res = await requestJson('/api/invoice-payment/confirm', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ invoiceIds: ids, lastBookingDate }),
    });
    if (!res.ok) {
      notify.error(confirmError(res));
      return;
    }
    notify.success(`${invoicesText(ids.length)} marked as paid`);
    rows.value = removePaidInvoices(rows.value, sent);
  } catch {
    notify.error('Network error');
  } finally {
    confirming.value = false;
  }
}
</script>

<template>
  <div class="page">
    <PageHeader title="Import bank bookings">
      <template #actions>
        <Button
          label="Back"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          @click="router.push('/invoice')"
        />
      </template>
    </PageHeader>

    <div class="stack gap-lg">
      <Card>
        <template #content>
          <div class="stack">
            <div class="field">
              <label for="booking-file">Bank export (CSV)</label>
              <input
                id="booking-file"
                type="file"
                accept=".csv,.txt,text/csv"
                data-testid="booking-file"
                @change="onFileChange"
              />
            </div>
            <div class="settings-grid">
              <div class="field">
                <label for="booking-encoding">Encoding</label>
                <Select
                  v-model="encoding"
                  input-id="booking-encoding"
                  :options="ENCODING_OPTIONS"
                  option-label="label"
                  option-value="value"
                  aria-label="Encoding"
                />
              </div>
              <div class="field">
                <label for="booking-delimiter">Delimiter</label>
                <Select
                  v-model="settings.delimiter"
                  input-id="booking-delimiter"
                  :options="DELIMITER_OPTIONS"
                  option-label="label"
                  option-value="value"
                  aria-label="Delimiter"
                />
              </div>
              <div v-for="key in BOOKING_COLUMN_KEYS" :key="key" class="field">
                <label :for="`column-${key}`">{{ COLUMN_LABELS[key] }}</label>
                <Select
                  :model-value="mappedColumn(key)"
                  :input-id="`column-${key}`"
                  :options="header"
                  placeholder="Choose column"
                  :disabled="header.length === 0"
                  :aria-label="`${COLUMN_LABELS[key]} column`"
                  @update:model-value="(name: string | null) => setColumn(key, name)"
                />
              </div>
              <div class="field">
                <label for="bookings-from">Bookings from</label>
                <DatePicker
                  v-model="bookingsFrom"
                  input-id="bookings-from"
                  date-format="dd.mm.yy"
                  show-icon
                  show-button-bar
                  data-testid="bookings-from"
                />
              </div>
            </div>
            <small class="muted">
              "Bookings from" starts at the newest booking day of the last confirmed import, so
              bookings you already handled are not proposed again. Clear it to match every booking
              in the file.
            </small>
          </div>
        </template>
      </Card>

      <section v-if="table" class="stack gap-sm">
        <h3 class="section-title">Preview — {{ fileName }}</h3>
        <div class="preview-scroll">
          <table class="plain-table" data-testid="csv-preview">
            <thead>
              <tr>
                <th v-for="(name, c) in header" :key="c" :class="{ mapped: mappedNames.has(name) }">
                  {{ name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, r) in previewRows" :key="r">
                <td v-for="(name, c) in header" :key="c" :class="{ mapped: mappedNames.has(name) }">
                  {{ row[c] ?? '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Message v-if="noBookings" severity="warn" data-testid="no-bookings">
          The file contains no bookings
        </Message>
        <div class="row">
          <Button
            label="Match bookings"
            icon="pi pi-search"
            :disabled="!canMatch"
            :loading="matching"
            data-testid="match-bookings"
            @click="match"
          />
        </div>
      </section>

      <section v-if="result" class="stack gap-sm" data-testid="match-result">
        <div class="row row--between">
          <h3 class="section-title">Proposals ({{ rows.length }})</h3>
          <Button
            :label="`Mark ${invoicesText(selectedIds.length)} as paid`"
            icon="pi pi-check"
            :disabled="selectedIds.length === 0"
            :loading="confirming"
            data-testid="confirm-paid"
            @click="confirmPaid"
          />
        </div>
        <small v-if="hiddenBefore > 0 && bookingsFrom" class="muted" data-testid="hidden-bookings">
          {{ hiddenBefore }} {{ hiddenBefore === 1 ? 'booking' : 'bookings' }} before
          {{ formatDate(toIsoDate(bookingsFrom)) }}
          {{ hiddenBefore === 1 ? 'is' : 'are' }} not shown.
        </small>

        <DataTable :value="tableRows" data-key="key" size="small" :row-class="() => 'match-row'">
          <template #empty>No booking matches an open invoice.</template>
          <Column header-style="width: 3rem">
            <template #body="{ data }">
              <span :data-testid="`match-select-${data.key}`">
                <Checkbox
                  :model-value="data.selected"
                  binary
                  :disabled="confirming || !canSelect(rows, data)"
                  :aria-label="`Select booking row ${data.match.booking.row}`"
                  @update:model-value="(value: boolean) => toggle(data, value)"
                />
              </span>
            </template>
          </Column>
          <Column header="Booking date">
            <template #body="{ data }">{{ formatDate(data.match.booking.date) }}</template>
          </Column>
          <Column header="Payer">
            <template #body="{ data }">{{ data.match.booking.payer }}</template>
          </Column>
          <Column header="Purpose">
            <template #body="{ data }">
              <span class="purpose" :title="data.match.booking.purpose">
                {{ data.match.booking.purpose }}
              </span>
            </template>
          </Column>
          <Column header="Amount" class="col-amount">
            <template #body="{ data }">{{ formatCents(data.match.booking.amountCents) }}</template>
          </Column>
          <Column header="Invoice">
            <template #body="{ data }">
              <div class="stack gap-xs">
                <Select
                  v-if="data.match.candidates.length > 1"
                  :model-value="data.invoiceId"
                  :options="candidateOptions(data)"
                  option-label="label"
                  option-value="value"
                  option-disabled="disabled"
                  :disabled="confirming"
                  placeholder="Choose invoice"
                  show-clear
                  size="small"
                  aria-label="Choose invoice"
                  data-testid="candidate-select"
                  @update:model-value="(id: number | null) => choose(data, id ?? null)"
                />
                <span v-if="data.chosen">
                  <a
                    :href="`/invoice/${data.chosen.invoiceId}`"
                    target="_blank"
                    rel="noopener"
                    data-testid="invoice-link"
                    >{{ data.chosen.invoiceNumber }}</a
                  >
                  {{ data.chosen.recipientName }}
                </span>
              </div>
            </template>
          </Column>
          <Column header="Invoice amount" class="col-amount">
            <template #body="{ data }">
              {{ data.chosen ? formatCents(data.chosen.amountCents) : '—' }}
            </template>
          </Column>
          <Column header="Match">
            <template #body="{ data }">
              <div class="stack gap-xs">
                <span class="row gap-sm">
                  <StatusTag :tag="matchLevelTag(data.match.level)" />
                  <small v-if="data.match.level === 'AMOUNT_DIFFERS' && data.chosen">
                    {{ formatCents(data.chosen.differenceCents) }}
                  </small>
                </span>
                <small class="muted">{{ reasonText(data) }}</small>
              </div>
            </template>
          </Column>
        </DataTable>

        <details v-if="result.unmatched.length > 0" data-testid="unmatched-bookings">
          <summary>Bookings without a match ({{ result.unmatched.length }})</summary>
          <table class="plain-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Booking date</th>
                <th>Payer</th>
                <th>Purpose</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="booking in result.unmatched" :key="booking.row">
                <td>{{ booking.row }}</td>
                <td>{{ formatDate(booking.date) }}</td>
                <td>{{ booking.payer }}</td>
                <td>{{ booking.purpose }}</td>
                <td>{{ formatCents(booking.amountCents) }}</td>
              </tr>
            </tbody>
          </table>
        </details>

        <details v-if="skipped.length > 0" data-testid="skipped-rows">
          <summary>Skipped rows ({{ skipped.length }})</summary>
          <table class="plain-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Reason</th>
                <th>Values</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in skipped" :key="row.row">
                <td>{{ row.row }}</td>
                <td>{{ SKIP_REASON_LABELS[row.reason] }}</td>
                <td>{{ row.values.join(' ; ') }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 1rem;
}

.preview-scroll {
  overflow-x: auto;
}

.plain-table {
  border-collapse: collapse;
  font-size: 0.875rem;
}

.plain-table th,
.plain-table td {
  border: 1px solid var(--p-content-border-color);
  padding: 0.25rem 0.5rem;
  text-align: left;
  white-space: nowrap;
}

.plain-table .mapped {
  background: var(--p-highlight-background);
}

.purpose {
  display: inline-block;
  max-width: 18rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

details summary {
  cursor: pointer;
  font-weight: 500;
}

:deep(.col-amount) {
  text-align: right;
  white-space: nowrap;
}
</style>
