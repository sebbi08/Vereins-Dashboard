<script setup lang="ts">
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import {
  type InstructorInvoiceRequestDto,
  type InstructorListItemDto,
  MAX_REQUEST_YEAR,
  MIN_REQUEST_YEAR,
  requestMonth,
} from 'shared';
import { computed, ref, watch } from 'vue';
import { useNotify } from '../composables/useNotify';

type InstructorRow = Pick<InstructorListItemDto, 'id' | 'name'>;

const props = defineProps<{
  instructors: InstructorRow[];
}>();

const notify = useNotify();

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTHS = MONTH_NAMES.map((name, index) => ({ index, name, short: name.slice(0, 3) }));

const today = new Date();
const currentYear = today.getFullYear();
const currentMonthIndex = today.getMonth();

const year = ref(currentYear);
/** "<instructorId>:<YYYY-MM>" of every requested month. */
const requested = ref(new Set<string>());
/** Cells with a save in flight, mapped to the state being saved. */
const pending = ref(new Map<string, boolean>());
const loading = ref(false);
const loadFailed = ref(false);
let loadSequence = 0;

const rows = computed(() =>
  [...props.instructors].sort((a, b) => a.name.localeCompare(b.name, 'de')),
);

function cellKey(instructorId: number, monthIndex: number): string {
  return `${instructorId}:${requestMonth(year.value, monthIndex)}`;
}

function setRequested(key: string, value: boolean) {
  if (value) requested.value.add(key);
  else requested.value.delete(key);
}

function isRequested(instructorId: number, monthIndex: number): boolean {
  return requested.value.has(cellKey(instructorId, monthIndex));
}

function isCurrentMonth(monthIndex: number): boolean {
  return year.value === currentYear && monthIndex === currentMonthIndex;
}

function isCellDisabled(instructorId: number, monthIndex: number): boolean {
  return loading.value || loadFailed.value || pending.value.has(cellKey(instructorId, monthIndex));
}

function cellLabel(instructor: InstructorRow, monthIndex: number): string {
  const state = isRequested(instructor.id, monthIndex) ? 'requested' : 'not requested';
  return `${instructor.name}, ${MONTH_NAMES[monthIndex]} ${year.value}: ${state}`;
}

async function load() {
  const sequence = ++loadSequence;
  loading.value = true;
  loadFailed.value = false;
  try {
    const res = await fetch(`/api/instructor/invoice-requests?year=${year.value}`);
    if (!res.ok) throw new Error('load failed');
    const body = (await res.json()) as InstructorInvoiceRequestDto[];
    if (sequence !== loadSequence) return;
    const next = new Set(body.map((r) => `${r.instructorId}:${r.month}`));
    // A save still in flight wins over a response that may predate it.
    for (const [key, value] of pending.value) {
      if (value) next.add(key);
      else next.delete(key);
    }
    requested.value = next;
  } catch {
    if (sequence !== loadSequence) return;
    requested.value = new Set();
    loadFailed.value = true;
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

async function toggle(instructorId: number, monthIndex: number) {
  if (isCellDisabled(instructorId, monthIndex)) return;
  const month = requestMonth(year.value, monthIndex);
  const key = cellKey(instructorId, monthIndex);
  const value = !requested.value.has(key);
  setRequested(key, value);
  pending.value.set(key, value);
  try {
    const res = await fetch(`/api/instructor/${instructorId}/invoice-requests/${month}`, {
      method: value ? 'PUT' : 'DELETE',
    });
    if (!res.ok) throw new Error('save failed');
  } catch {
    setRequested(key, !value);
    notify.error('Could not save the invoice request');
  } finally {
    pending.value.delete(key);
  }
}

watch(year, load, { immediate: true });
</script>

<template>
  <Card data-testid="invoice-requests">
    <template #title>
      <div class="row row--between">
        <h3 class="section-title">Invoice requests</h3>
        <div class="row gap-xs">
          <Button
            icon="pi pi-chevron-left"
            text
            rounded
            aria-label="Previous year"
            data-testid="previous-year"
            :disabled="year <= MIN_REQUEST_YEAR"
            @click="year--"
          />
          <span class="year" data-testid="request-year">{{ year }}</span>
          <Button
            icon="pi pi-chevron-right"
            text
            rounded
            aria-label="Next year"
            data-testid="next-year"
            :disabled="year >= MAX_REQUEST_YEAR"
            @click="year++"
          />
        </div>
      </div>
    </template>
    <template #content>
      <p v-if="rows.length === 0" class="muted" data-testid="invoice-requests-empty">
        No instructors yet.
      </p>
      <div v-else class="stack gap-sm">
        <Message
          v-if="loadFailed"
          severity="error"
          size="small"
          data-testid="invoice-requests-load-error"
        >
          Invoice requests could not be loaded.
        </Message>
        <div class="matrix-scroll">
          <table class="matrix">
            <thead>
              <tr>
                <th scope="col" class="name-col">Instructor</th>
                <th
                  v-for="month in MONTHS"
                  :key="month.index"
                  scope="col"
                  :title="month.name"
                  :class="{ current: isCurrentMonth(month.index) }"
                >
                  {{ month.short }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="instructor in rows" :key="instructor.id" data-testid="invoice-request-row">
                <th scope="row" class="name-col">{{ instructor.name }}</th>
                <td
                  v-for="month in MONTHS"
                  :key="month.index"
                  :class="{ current: isCurrentMonth(month.index) }"
                >
                  <button
                    type="button"
                    class="cell"
                    :class="{ requested: isRequested(instructor.id, month.index) }"
                    :aria-pressed="isRequested(instructor.id, month.index)"
                    :aria-label="cellLabel(instructor, month.index)"
                    :disabled="isCellDisabled(instructor.id, month.index)"
                    :data-testid="`request-${instructor.id}-${requestMonth(year, month.index)}`"
                    @click="toggle(instructor.id, month.index)"
                  >
                    <i
                      v-if="isRequested(instructor.id, month.index)"
                      class="pi pi-check"
                      aria-hidden="true"
                    />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.year {
  min-width: 3rem;
  text-align: center;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.matrix-scroll {
  overflow-x: auto;
}

.matrix {
  width: 100%;
  min-width: 44rem;
  border-collapse: separate;
  border-spacing: 0;
}

.matrix th,
.matrix td {
  padding: 0.25rem;
  text-align: center;
  border-bottom: 1px solid var(--p-content-border-color);
}

.matrix thead th {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.matrix .name-col {
  position: sticky;
  left: 0;
  z-index: 1;
  padding-right: 1rem;
  text-align: left;
  white-space: nowrap;
  font-weight: 500;
  color: var(--p-text-color);
  background: var(--p-content-background);
}

.matrix .current {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
}

.matrix thead th.current {
  color: var(--p-primary-color);
}

.cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  background: transparent;
  cursor: pointer;
}

.cell:hover:not(:disabled) {
  border-color: var(--p-primary-color);
}

.cell:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.cell.requested {
  border-color: var(--p-primary-color);
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.cell:disabled {
  cursor: default;
  opacity: 0.6;
}
</style>
