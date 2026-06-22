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

const totalCount = computed(() => invoices.value.length);
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6 gap-3">
      <h2 class="text-2xl font-bold text-gray-800">Invoices</h2>
      <div class="flex items-center gap-2">
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
        <router-link
          to="/invoice/settings"
          class="ml-1 font-medium underline hover:text-amber-900"
        >
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
            <th class="text-left px-4 py-3 font-medium text-gray-600">Number</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Recipient</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Invoice Date</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Rev.</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in invoices"
            :key="r.id"
            class="border-b border-gray-100 hover:bg-gray-50 transition-colors"
          >
            <td class="px-4 py-3 font-mono text-xs font-medium text-gray-800">{{ r.number }}</td>
            <td class="px-4 py-3 text-gray-700">{{ r.recipientName }}</td>
            <td class="px-4 py-3 text-right font-medium text-gray-800">
              {{ formatAmount(r.amountCents) }}
            </td>
            <td class="px-4 py-3 text-gray-600">{{ formatDate(r.invoiceDate) }}</td>
            <td class="px-4 py-3 text-gray-500">R{{ r.activeRevisionNumber ?? '–' }}</td>
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
                class="text-blue-600 hover:underline text-xs mr-3"
                @click="router.push(`/invoice/${r.id}`)"
              >
                Details
              </button>
              <button
                class="text-gray-500 hover:text-blue-600 text-xs"
                @click="router.push(`/invoice/new?copyFrom=${r.id}`)"
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
