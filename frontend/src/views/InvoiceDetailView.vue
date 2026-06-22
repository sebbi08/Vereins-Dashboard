<script setup lang="ts">
import type { InvoiceDto, InvoiceRevisionDto, PdfStatus } from 'shared';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const id = parseInt(String(route.params.id));

const invoice = ref<InvoiceDto | null>(null);
const loading = ref(false);
const error = ref('');
const cancelError = ref('');
const retryPdfSuccess = ref<Record<number, string>>({});
const retryPdfError = ref<Record<number, string>>({});
const retryLoading = ref<Record<number, boolean>>({});
const sendEmailLoading = ref<Record<number, boolean>>({});
const sendEmailSuccess = ref<Record<number, string>>({});
const sendEmailError = ref<Record<number, string>>({});

async function loadData() {
  loading.value = true;
  try {
    const res = await fetch(`/api/invoice/${id}`);
    if (!res.ok) {
      error.value = 'Invoice could not be loaded';
      return;
    }
    invoice.value = await res.json();
  } catch {
    error.value = 'Network error';
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

function formatAmount(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(iso));
}

function berechneBrutto(rev: InvoiceRevisionDto): number {
  const netto = rev.inputs.lineItems.reduce((sum, p) => sum + p.priceInCents, 0);
  const steuer = Math.round(netto * (rev.inputs.vat / 100));
  return netto + steuer;
}

function ustLabel(ust: number): string {
  return ust === 7 ? '7%' : '19%';
}

function paymentMethodLabel(directDebit: boolean): string {
  return directDebit ? 'Direct Debit' : 'Bank Transfer';
}

async function cancel() {
  cancelError.value = '';
  try {
    const res = await fetch(`/api/invoice/${id}/cancel`, { method: 'PATCH' });
    if (!res.ok) {
      const err = await res.json();
      cancelError.value = err.error || 'Error cancelling';
      return;
    }
    await loadData();
  } catch {
    cancelError.value = 'Network error';
  }
}

async function retryPdf(revisionId: number) {
  retryPdfSuccess.value[revisionId] = '';
  retryPdfError.value[revisionId] = '';
  retryLoading.value[revisionId] = true;

  try {
    const res = await fetch(`/api/invoice/revision/${revisionId}/retry-pdf`, { method: 'POST' });
    const result = await res.json();

    if (res.ok) {
      retryPdfSuccess.value[revisionId] = 'PDF generated successfully';
      await loadData();
    } else {
      retryPdfError.value[revisionId] = result.error || 'Error on retry';
    }
  } catch {
    retryPdfError.value[revisionId] = 'Network error';
  } finally {
    retryLoading.value[revisionId] = false;
  }
}

async function sendEmail(revisionId: number) {
  sendEmailSuccess.value[revisionId] = '';
  sendEmailError.value[revisionId] = '';
  sendEmailLoading.value[revisionId] = true;

  try {
    const res = await fetch(`/api/invoice/revision/${revisionId}/send-email`, { method: 'POST' });
    const result = await res.json();

    if (res.ok) {
      sendEmailSuccess.value[revisionId] = 'Email sent successfully';
      await loadData();
    } else {
      sendEmailError.value[revisionId] = result.error || 'Error sending email';
    }
  } catch {
    sendEmailError.value[revisionId] = 'Network error';
  } finally {
    sendEmailLoading.value[revisionId] = false;
  }
}

function downloadPdf(revisionId: number) {
  window.open(`/api/invoice/revision/${revisionId}/download`, '_blank');
}

function pdfStatusBadge(status: PdfStatus) {
  const map: Record<PdfStatus, string> = {
    PENDING: 'bg-gray-100 text-gray-600',
    OK: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
  };
  return `inline-block text-xs font-medium px-2 py-0.5 rounded-full ${map[status] || ''}`;
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <button class="text-gray-400 hover:text-gray-700" @click="router.push('/invoice')">
        ← Back
      </button>
      <h2 class="text-2xl font-bold text-gray-800">Invoice {{ invoice?.number }}</h2>
    </div>

    <div v-if="loading" class="p-8 text-center text-gray-400">Loading…</div>
    <div v-else-if="error" class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
      {{ error }}
    </div>
    <template v-else-if="invoice">
      <div class="space-y-6">
        <!-- Status -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500">Status</p>
              <span
                :class="[
                  'inline-block text-sm font-medium px-2 py-0.5 rounded-full mt-1',
                  invoice.status === 'AKTIV'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500',
                ]"
              >
                {{ invoice.status }}
              </span>
            </div>
            <div>
              <p class="text-sm text-gray-500">Created at</p>
              <p class="text-sm font-medium text-gray-800 mt-1">
                {{ formatDatum(invoice.createdAt) }}
              </p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Recipient</p>
              <p class="text-sm font-medium text-gray-800 mt-1">{{ invoice.recipient.name }}</p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3">
          <button
            v-if="invoice.status === 'AKTIV'"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            @click="router.push(`/invoice/${id}/revision`)"
          >
            New Revision
          </button>
          <button
            class="border border-blue-300 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
            @click="router.push(`/invoice/new?copyFrom=${id}`)"
          >
            Duplicate
          </button>
          <button
            v-if="invoice.status === 'AKTIV'"
            class="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
            @click="cancel"
          >
            Cancel
          </button>
          <p v-if="cancelError" class="text-red-600 text-sm">{{ cancelError }}</p>
        </div>

        <!-- Revisions -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <h3 class="font-semibold text-gray-800 px-6 py-4 border-b">Revisions</h3>
          <div v-if="!invoice.revisions?.length" class="p-6 text-center text-gray-400 text-sm">
            No revisions available
          </div>
          <div v-else class="divide-y">
            <div v-for="rev in invoice.revisions" :key="rev.id" class="p-6">
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-3">
                  <span class="text-sm font-semibold text-gray-800"
                    >Revision {{ rev.revisionNumber }}</span
                  >
                  <span :class="pdfStatusBadge(rev.pdfStatus)">{{ rev.pdfStatus }}</span>
                  <span
                    :class="[
                      'inline-block text-xs font-medium px-2 py-0.5 rounded-full',
                      rev.status === 'AKTIV'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500',
                    ]"
                  >
                    {{ rev.status }}
                  </span>
                </div>
                <p class="text-xs text-gray-400">{{ formatDatum(rev.createdAt) }}</p>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span class="text-gray-500">Recipient:</span>
                  <span class="text-gray-800"
                    >{{ rev.inputs.name }}, {{ rev.inputs.street }},
                    {{ rev.inputs.city }}</span
                  >
                </div>
                <div>
                  <span class="text-gray-500">Title:</span>
                  <span class="text-gray-800">{{ rev.inputs.title }}</span>
                </div>
                <div>
                  <span class="text-gray-500">VAT:</span>
                  <span class="text-gray-800">{{ ustLabel(rev.inputs.vat) }}</span>
                </div>
                <div>
                  <span class="text-gray-500">Payment:</span>
                  <span class="text-gray-800">{{ paymentMethodLabel(rev.inputs.directDebit) }}</span>
                </div>
                <div class="md:col-span-2">
                  <span class="text-gray-500">Amount (Gross):</span>
                  <span class="text-gray-800 font-medium">{{
                    formatAmount(berechneBrutto(rev))
                  }}</span>
                </div>
              </div>

              <!-- Positionen -->
              <div class="mt-3">
                <p class="text-xs text-gray-500 mb-1">Line Items:</p>
                <div class="bg-gray-50 rounded-lg p-3 text-sm">
                  <div
                    v-for="(pos, idx) in rev.inputs.lineItems"
                    :key="idx"
                    class="flex justify-between py-1 border-b border-gray-100 last:border-0"
                  >
                    <span class="text-gray-700">{{ pos.text }}</span>
                    <span class="text-gray-800 font-medium">{{
                      formatAmount(pos.priceInCents)
                    }}</span>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-3 mt-3">
                <button
                  v-if="rev.pdfStatus === 'OK'"
                  class="text-blue-600 hover:underline text-sm"
                  @click="downloadPdf(rev.id)"
                >
                  Download PDF
                </button>
                <button
                  v-if="rev.pdfStatus === 'FAILED' && rev.status === 'AKTIV'"
                  class="text-amber-600 hover:underline text-sm"
                  :disabled="retryLoading[rev.id]"
                  @click="retryPdf(rev.id)"
                >
                  {{ retryLoading[rev.id] ? 'Generiere...' : 'PDF neu generieren' }}
                </button>
                <p v-if="retryPdfSuccess[rev.id]" class="text-green-600 text-xs">
                  {{ retryPdfSuccess[rev.id] }}
                </p>
                <p v-if="retryPdfError[rev.id]" class="text-red-600 text-xs">
                  {{ retryPdfError[rev.id] }}
                </p>
                <button
                  v-if="rev.pdfStatus === 'OK' && rev.emailStatus !== 'SENT'"
                  class="text-green-600 hover:underline text-sm"
                  :disabled="sendEmailLoading[rev.id]"
                  @click="sendEmail(rev.id)"
                >
                  {{ sendEmailLoading[rev.id] ? 'Sending…' : 'Send via Email' }}
                </button>
                <span
                  v-if="rev.emailStatus === 'SENT'"
                  class="text-green-600 text-xs font-medium"
                >Email Sent ✓</span>
                <span
                  v-if="rev.emailStatus === 'FAILED'"
                  class="text-red-600 text-xs"
                >Email failed{{ rev.emailError ? ': ' + rev.emailError : '' }}</span>
                <p v-if="sendEmailSuccess[rev.id]" class="text-green-600 text-xs">
                  {{ sendEmailSuccess[rev.id] }}
                </p>
                <p v-if="sendEmailError[rev.id]" class="text-red-600 text-xs">
                  {{ sendEmailError[rev.id] }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
