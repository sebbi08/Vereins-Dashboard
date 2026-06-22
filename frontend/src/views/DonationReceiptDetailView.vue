<script setup lang="ts">
import type { DonationReceiptDto } from 'shared';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const id = parseInt(String(route.params.id));

const receipt = ref<DonationReceiptDto | null>(null);
const loading = ref(false);
const error = ref('');
const cancelConfirmation = ref(false);
const retryRunning = ref(false);
const detailsOffen = ref<Record<number, boolean>>({});

async function loadReceipt() {
  loading.value = true;
  try {
    const res = await fetch(`/api/donation-receipt/${id}`);
    if (!res.ok) throw new Error();
    receipt.value = await res.json();
  } catch {
    error.value = 'Receipt could not be loaded';
  } finally {
    loading.value = false;
  }
}

async function cancel() {
  const res = await fetch(`/api/donation-receipt/${id}/cancel`, { method: 'PATCH' });
  if (res.ok) {
    cancelConfirmation.value = false;
    await loadReceipt();
  }
}

function istAktiveRevision(revId: number): boolean {
  return receipt.value?.activeRevision?.id === revId;
}

function kannRetry(rev: { id: number; pdfStatus: string }): boolean {
  return istAktiveRevision(rev.id) && rev.pdfStatus === 'FAILED';
}

async function retryPdf(revisionId: number) {
  retryRunning.value = true;
  try {
    const res = await fetch(`/api/donation-receipt/revision/${revisionId}/retry-pdf`, {
      method: 'POST',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      error.value = body?.error || 'PDF konnte nicht erneut erzeugt werden';
      return;
    }
    await loadReceipt();
  } catch {
    error.value = 'PDF konnte nicht erneut erzeugt werden';
  } finally {
    retryRunning.value = false;
  }
}

onMounted(loadReceipt);

function formatAmount(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(iso));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <button class="text-gray-400 hover:text-gray-700" @click="router.push('/donation-receipt')">
        ← Back
      </button>
      <h2 class="text-2xl font-bold text-gray-800">Receipt Details</h2>
    </div>

    <div
      v-if="error"
      class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ error }}
    </div>
    <div v-if="loading" class="text-gray-400 text-sm">Loading…</div>

    <template v-if="receipt">
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-4">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-3 mb-1">
              <span class="font-mono text-lg font-bold text-gray-800">{{ receipt.number }}</span>
              <span
                :class="[
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  receipt.status === 'AKTIV'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500',
                ]"
                >{{ receipt.status }}</span
              >
            </div>
            <p class="text-gray-600 text-sm">{{ receipt.donor.name }}</p>
            <p class="text-gray-500 text-xs">
              {{ receipt.donor.street }}, {{ receipt.donor.city }}
            </p>
          </div>
          <div class="flex gap-2">
            <button
              v-if="receipt.status === 'AKTIV'"
              class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              @click="router.push(`/donation-receipt/${id}/revision`)"
            >
              New Revision
            </button>
            <button
              class="border border-blue-300 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50"
              @click="router.push(`/donation-receipt/new?copyFrom=${id}`)"
            >
              Duplicate
            </button>
            <button
              v-if="receipt.status === 'AKTIV'"
              class="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50"
              @click="cancelConfirmation = true"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div v-if="cancelConfirmation" class="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
        <p class="text-sm text-red-700 mb-3">
          Receipt <strong>{{ receipt.number }}</strong> really cancel? This action cannot
          nicht rückgängig gemacht werden.
        </p>
        <div class="flex gap-2">
          <button class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm" @click="cancel">
            Yes, cancel
          </button>
          <button
            class="border border-gray-300 px-4 py-2 rounded-lg text-sm"
            @click="cancelConfirmation = false"
          >
            Cancel
          </button>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100">
          <h3 class="font-semibold text-gray-800">Revisions</h3>
        </div>
        <div
          v-for="rev in receipt.revisions"
          :key="rev.id"
          class="border-b border-gray-100 last:border-0 p-6"
        >
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium text-gray-800">R{{ rev.revisionNumber }}</span>
              <span
                :class="[
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  rev.status === 'AKTIV'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-400',
                ]"
                >{{ rev.status }}</span
              >
              <span
                :class="[
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  rev.pdfStatus === 'OK'
                    ? 'bg-green-100 text-green-700'
                    : rev.pdfStatus === 'FAILED'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-600',
                ]"
                >PDF {{ rev.pdfStatus }}</span
              >
              <span class="text-xs text-gray-400">{{ formatDateTime(rev.createdAt) }}</span>
            </div>
            <div class="flex items-center gap-3">
              <button
                v-if="kannRetry(rev)"
                :disabled="retryRunning"
                class="text-amber-700 hover:text-amber-900 text-sm disabled:opacity-50"
                @click="retryPdf(rev.id)"
              >
                {{ retryRunning ? 'Regenerating…' : 'Retry PDF' }}
              </button>
              <a
                v-if="rev.filePath && rev.pdfStatus === 'OK'"
                :href="`/api/donation-receipt/revision/${rev.id}/download`"
                target="_blank"
                class="text-blue-600 hover:underline text-sm"
              >
                Download PDF
              </a>
            </div>
          </div>

          <div
            v-if="rev.pdfStatus === 'FAILED'"
            class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            <p>{{ rev.pdfError || 'PDF konnte nicht erzeugt werden. Please try again.' }}</p>
            <button
              v-if="rev.pdfTechError"
              class="mt-2 text-xs underline"
              @click="detailsOffen[rev.id] = !detailsOffen[rev.id]"
            >
              {{ detailsOffen[rev.id] ? 'Details ausblenden' : 'Details anzeigen' }}
            </button>
            <pre
              v-if="rev.pdfTechError && detailsOffen[rev.id]"
              class="mt-2 whitespace-pre-wrap rounded border border-amber-300 bg-white p-2 text-xs text-amber-900"
              >{{ rev.pdfTechError }}</pre
            >
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span class="text-gray-500 text-xs">Amount</span>
              <p class="font-medium text-gray-800">
                {{ formatAmount(rev.inputs.donationAmountCents) }}
              </p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Donation Date</span>
              <p class="text-gray-700">{{ formatDatum(rev.inputs.donationDate) }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">With Cover Letter</span>
              <p class="text-gray-700">{{ rev.inputs.withCoverLetter ? 'Ja' : 'Nein' }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Treasurer</span>
              <p class="text-gray-700">{{ rev.inputs.treasurer }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Tax Office</span>
              <p class="text-gray-700">{{ rev.inputs.taxOfficeName }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Tax Number</span>
              <p class="text-gray-700">{{ rev.inputs.taxNumber }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Assessment Period</span>
              <p class="text-gray-700">{{ rev.inputs.assessmentPeriod }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
