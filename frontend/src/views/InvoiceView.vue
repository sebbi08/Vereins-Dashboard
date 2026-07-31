<script setup lang="ts">
import type { InvoiceListItem } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';

const router = useRouter();
const store = useAppStore();
const invoices = ref<InvoiceListItem[]>([]);
const loading = ref(false);
const error = ref('');

const search = ref('');
const fromDate = ref('');
const toDate = ref('');
const withCancelled = ref(false);

const selectedIds = ref<Set<number>>(new Set());

function toggleSelectAll() {
  if (selectedIds.value.size === invoices.value.length) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(invoices.value.map((i) => i.id));
  }
}

function toggleSelect(id: number) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
}

const allSelected = computed(
  () => invoices.value.length > 0 && selectedIds.value.size === invoices.value.length,
);

async function downloadSelected() {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;

  try {
    const res = await fetch('/api/invoice/download-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });

    if (!res.ok) {
      const body = await res.json();
      if (body.ids && Array.isArray(body.ids)) {
        const problemSet = new Set(body.ids as number[]);
        const next = new Set(selectedIds.value);
        for (const id of problemSet) next.delete(id);
        selectedIds.value = next;

        const label =
          body.error === 'CANCELLED'
            ? 'cancelled'
            : body.error === 'PDF_NOT_READY'
              ? 'PDF not ready'
              : body.error === 'NOT_FOUND'
                ? 'not found'
                : 'invalid';
        const count = body.ids.length;
        alert(
          `${count} invoice${count > 1 ? 's' : ''} cannot be downloaded: ${label}. The ${count > 1 ? 'se' : ''}${count > 1 ? ' have' : ' has'} been deselected.`,
        );
      } else {
        alert('Download failed. Please try again.');
      }
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="(.+)"/);
    a.href = url;
    a.download = match ? match[1] : 'rechnungen.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    alert('Download failed. Please try again.');
  }
}

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams();
    if (search.value) params.set('search', search.value);
    if (fromDate.value) params.set('fromDate', fromDate.value);
    if (toDate.value) params.set('toDate', toDate.value);
    if (withCancelled.value) params.set('withCancelled', 'true');
    const res = await fetch(`/api/invoice?${params}`);
    invoices.value = await res.json();
  } catch {
    error.value = 'Error loading invoices';
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

let debounce: ReturnType<typeof setTimeout>;
function onSearchInput() {
  clearTimeout(debounce);
  debounce = setTimeout(loadData, 350);
}

function formatAmount(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(iso));
}

function openInvoiceDetails(id: number) {
  router.push(`/invoice/${id}`);
}

function emailStatusBadge(status: string) {
  const map: Record<string, string> = {
    SENT: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
    NOT_SENT: 'bg-gray-100 text-gray-500',
  };
  return `inline-block text-xs font-medium px-2 py-0.5 rounded-full ${map[status] || ''}`;
}

function emailStatusLabel(status: string) {
  const map: Record<string, string> = {
    SENT: 'Sent',
    FAILED: 'Failed',
    NOT_SENT: '—',
  };
  return map[status] || status;
}

const totalCount = computed(() => invoices.value.length);
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6 gap-3">
      <h2 class="text-2xl font-bold text-gray-800">Invoices</h2>
      <div class="flex items-center gap-2">
        <button
          :disabled="selectedIds.size === 0"
          class="border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="downloadSelected"
        >
          Download selected ({{ selectedIds.size }})
        </button>
        <button
          class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          @click="router.push('/invoice/settings')"
        >
          Settings
        </button>
        <button
          :disabled="!store.invoiceTemplateAvailable"
          :title="
            !store.invoiceTemplateAvailable
              ? 'Please upload an invoice template in Settings first'
              : undefined
          "
          class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="router.push('/invoice/new')"
        >
          + New Invoice
        </button>
      </div>
    </div>

    <div
      v-if="store.invoiceTemplateAvailable === false"
      class="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800"
    >
      <span class="mt-0.5 text-lg leading-none">⚠️</span>
      <span>
        No invoice template uploaded. Please upload a template before creating invoices.
        <router-link to="/invoice/settings" class="ml-1 font-medium underline hover:text-amber-900">
          Go to Settings →</router-link
        >
      </span>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          v-model="search"
          type="text"
          placeholder="Search by name or number…"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 col-span-2"
          @input="onSearchInput"
        />
        <input
          v-model="fromDate"
          type="date"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          @change="loadData"
        />
        <input
          v-model="toDate"
          type="date"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          @change="loadData"
        />
      </div>
      <div class="mt-2 flex items-center gap-2">
        <input
          id="withCancelled-invoice"
          v-model="withCancelled"
          type="checkbox"
          class="rounded"
          @change="loadData"
        />
        <label for="withCancelled-invoice" class="text-sm text-gray-600">Show cancelled</label>
        <span class="ml-auto text-sm text-gray-500">{{ totalCount }} entries</span>
      </div>
    </div>

    <div
      v-if="error"
      class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ error }}
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-gray-400 text-sm">Loading…</div>
      <div v-else-if="invoices.length === 0" class="p-8 text-center text-gray-400 text-sm">
        No invoices found.
      </div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 bg-gray-50">
            <th class="text-center px-4 py-3 w-10">
              <input
                type="checkbox"
                :checked="allSelected"
                class="rounded"
                @click.stop="toggleSelectAll"
              />
            </th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Number</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Recipient</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Invoice Date</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Rev.</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Email</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in invoices"
            :key="r.id"
            class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
            tabindex="0"
            role="button"
            @click="openInvoiceDetails(r.id)"
            @keydown.enter.prevent="openInvoiceDetails(r.id)"
            @keydown.space.prevent="openInvoiceDetails(r.id)"
          >
            <td class="px-4 py-3 text-center" @click.stop>
              <input
                type="checkbox"
                :checked="selectedIds.has(r.id)"
                class="rounded"
                @change="toggleSelect(r.id)"
              />
            </td>
            <td class="px-4 py-3 font-mono text-xs font-medium text-gray-800">{{ r.number }}</td>
            <td class="px-4 py-3 text-gray-700">{{ r.recipientName }}</td>
            <td class="px-4 py-3 text-right font-medium text-gray-800">
              {{ formatAmount(r.amountCents) }}
            </td>
            <td class="px-4 py-3 text-gray-600">{{ formatDate(r.invoiceDate) }}</td>
            <td class="px-4 py-3 text-gray-500">R{{ r.activeRevisionNumber ?? '–' }}</td>
            <td class="px-4 py-3">
              <span :class="emailStatusBadge(r.emailStatus)">
                {{ emailStatusLabel(r.emailStatus) }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span
                :class="[
                  'inline-block text-xs font-medium px-2 py-0.5 rounded-full',
                  r.status === 'AKTIV'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500',
                ]"
              >
                {{ r.status }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <button
                class="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                @click.stop="router.push(`/invoice/new?copyFrom=${r.id}`)"
              >
                Copy
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
