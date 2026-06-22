<script setup lang="ts">
import type { DonorDto, ReceiptInputs, SystemSettings } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DonorAutocomplete from '../components/DonorAutocomplete.vue';
import { useAppStore } from '../stores/app';

const router = useRouter();
const route = useRoute();
const store = useAppStore();

const receiptId = route.params.id ? parseInt(String(route.params.id)) : null;
const isNewRevision = !!receiptId;

const sending = ref(false);
const error = ref('');
const success = ref('');
const warning = ref('');
const info = ref('');
const defaultsHint = ref(false);

const donor = ref<DonorDto | null>(null);
const newDonor = ref(false);
const validationAttempted = ref(false);

const inputs = ref<ReceiptInputs>({
  name: '',
  street: '',
  city: '',
  letterSalutation: '',
  addressSalutation: '',
  donationAmountCents: 0,
  donationDate: new Date().toISOString().split('T')[0],
  withCoverLetter: true,
  treasurer: '',
  charitablePurpose: '',
  taxOfficeName: '',
  taxNumber: '',
  exemptionDate: '',
  assessmentPeriod: '',
});

const amountEuro = ref('');

const letterSalutationMissing = computed(
  () => inputs.value.withCoverLetter && !inputs.value.letterSalutation.trim(),
);
const showLetterSalutationError = computed(() => letterSalutationMissing.value && validationAttempted.value);

function amountFromEuro(val: string): number {
  const cleaned = val.replace(',', '.').replace(/[^0-9.]/g, '');
  return Math.round(parseFloat(cleaned || '0') * 100);
}

function amountToEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function normalizeDateInputValue(value: string): string {
  return value.includes('T') ? value.split('T')[0] : value;
}

async function ladeSettings() {
  const res = await fetch('/api/settings');
  if (!res.ok) return;
  const data: Partial<SystemSettings> = await res.json();
  if (data.treasurer) inputs.value.treasurer = data.treasurer;
  if (data.charitablePurpose) inputs.value.charitablePurpose = data.charitablePurpose;
  if (data.taxOfficeName) inputs.value.taxOfficeName = data.taxOfficeName;
  if (data.taxNumber) inputs.value.taxNumber = data.taxNumber;
  if (data.exemptionDate) inputs.value.exemptionDate = data.exemptionDate;
  if (data.assessmentPeriod) inputs.value.assessmentPeriod = data.assessmentPeriod;
}

async function loadRevisionAndDefaults() {
  if (!receiptId) return;
  const res = await fetch(`/api/donation-receipt/${receiptId}`);
  if (!res.ok) return;
  const data = await res.json();

  if (data.activeRevision) {
    const e = data.activeRevision.inputs as ReceiptInputs;
    inputs.value = {
      ...e,
      donationDate: normalizeDateInputValue(e.donationDate),
    };
    amountEuro.value = amountToEuro(e.donationAmountCents);
  }

  if (data.donor) {
    donor.value = data.donor;
    const vorher = {
      name: inputs.value.name,
      street: inputs.value.street,
      city: inputs.value.city,
      letterSalutation: inputs.value.letterSalutation,
      addressSalutation: inputs.value.addressSalutation ?? '',
    };

    inputs.value.name = data.donor.name;
    inputs.value.street = data.donor.street;
    inputs.value.city = data.donor.city;
    inputs.value.letterSalutation = data.donor.letterSalutation;
    inputs.value.addressSalutation = data.donor.addressSalutation ?? '';

    defaultsHint.value =
      vorher.name !== inputs.value.name ||
      vorher.street !== inputs.value.street ||
      vorher.city !== inputs.value.city ||
      vorher.letterSalutation !== inputs.value.letterSalutation ||
      vorher.addressSalutation !== (inputs.value.addressSalutation ?? '');
  }
}

onMounted(async () => {
  if (store.receiptTemplateAvailable === false) {
    router.replace('/donation-receipt');
    return;
  }
  if (store.receiptTemplateAvailable === null) {
    await store.checkTemplates();
    if (!store.receiptTemplateAvailable) {
      router.replace('/donation-receipt');
      return;
    }
  }

  await ladeSettings();
  if (isNewRevision) {
    await loadRevisionAndDefaults();
  }
});

function onDonorAusgewaehlt(s: DonorDto | null) {
  donor.value = s;
  if (s) {
    newDonor.value = false;
    inputs.value.name = s.name;
    inputs.value.street = s.street;
    inputs.value.city = s.city;
    inputs.value.letterSalutation = s.letterSalutation;
    inputs.value.addressSalutation = s.addressSalutation ?? '';
  }
}

function onNeuerDonor(daten: { name: string; street: string; city: string }) {
  newDonor.value = true;
  donor.value = null;
  inputs.value.name = daten.name;
  inputs.value.street = daten.street;
  inputs.value.city = daten.city;
  if (!inputs.value.letterSalutation) {
    inputs.value.letterSalutation = 'Sehr geehrte Damen und Herren';
  }
}

async function submit() {
  validationAttempted.value = true;
  error.value = '';
  warning.value = '';
  info.value = '';
  success.value = '';

  if (letterSalutationMissing.value) {
    error.value = 'Please fill in Letter Salutation when creating a cover letter.';
    return;
  }

  sending.value = true;
  inputs.value.donationAmountCents = amountFromEuro(amountEuro.value);

  try {
    let res: Response;

    if (isNewRevision) {
      res = await fetch(`/api/donation-receipt/${receiptId}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: inputs.value }),
      });
    } else {
      const body: Record<string, unknown> = { inputs: inputs.value };
      if (donor.value && !newDonor.value) {
        body.donorId = donor.value.id;
      } else {
        body.donorData = {
          name: inputs.value.name,
          street: inputs.value.street,
          city: inputs.value.city,
          letterSalutation: inputs.value.letterSalutation,
          addressSalutation: inputs.value.addressSalutation,
        };
      }
      res = await fetch('/api/donation-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    const result = await res.json();

    if (!res.ok) {
      error.value = result.error || 'Unknown error';
      return;
    }

    if (result.pdfStatus === 'FAILED') {
      warning.value = result.pdfError || 'PDF could not be generated. Please try again.';
      if (result.donorUpdated) {
        info.value = 'Donor master data updated.';
      }
    } else {
      success.value = 'Receipt saved successfully.';
      if (result.donorUpdated) {
        info.value = 'Donor master data updated.';
      }
    }

    const zielId = result.receiptId ?? receiptId;
    setTimeout(() => router.push(`/donation-receipt/${zielId}`), 1000);
  } catch {
    error.value = 'Network error while saving';
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <button class="text-gray-400 hover:text-gray-700" @click="router.back()">← Back</button>
      <h2 class="text-2xl font-bold text-gray-800">
        {{ isNewRevision ? 'Create New Revision' : 'New Donation Receipt' }}
      </h2>
    </div>

    <div
      v-if="error"
      class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ error }}
    </div>
    <div
      v-if="warning"
      class="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg mb-4 text-sm"
    >
      {{ warning }}
    </div>
    <div
      v-if="info"
      class="bg-blue-50 border border-blue-200 text-blue-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ info }}
    </div>
    <div
      v-if="success"
      class="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ success }}
    </div>

    <form class="space-y-6" @submit.prevent="submit">
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Donor</h3>

        <div v-if="!isNewRevision" class="mb-3">
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >Search or create donor</label
          >
          <DonorAutocomplete
            :model-value="donor"
            @update:model-value="onDonorAusgewaehlt"
            @neu="onNeuerDonor"
          />
        </div>

        <div
          v-if="isNewRevision && defaultsHint"
          class="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700"
        >
          This revision was pre-filled with the current donor master data.
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              v-model="inputs.name"
              type="text"
              required
              :disabled="!!donor && !newDonor"
              :class="[
                'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                donor && !newDonor
                  ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Street</label>
            <input
              v-model="inputs.street"
              type="text"
              required
              :disabled="!!donor && !newDonor"
              :class="[
                'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                donor && !newDonor
                  ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              v-model="inputs.city"
              type="text"
              required
              :disabled="!!donor && !newDonor"
              :class="[
                'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                donor && !newDonor
                  ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Letter Salutation</label>
            <input
              v-model="inputs.letterSalutation"
              type="text"
              :disabled="!!donor && !newDonor"
              :class="[
                'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                donor && !newDonor
                  ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                  : showLetterSalutationError
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
            <p v-if="showLetterSalutationError" class="mt-1 text-xs text-red-600">
              Letter Salutation is required when creating a cover letter.
            </p>
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Address Salutation (optional)</label
            >
            <input
              v-model="inputs.addressSalutation"
              type="text"
              :disabled="!!donor && !newDonor"
              :class="[
                'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                donor && !newDonor
                  ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Donation</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Amount (€)</label>
            <input
              v-model="amountEuro"
              type="text"
              required
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Donation Date</label>
            <input
              v-model="inputs.donationDate"
              type="date"
              required
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="flex items-center gap-2 pt-6">
            <input
              id="withCoverLetter"
              v-model="inputs.withCoverLetter"
              type="checkbox"
              class="rounded"
            />
            <label for="withCoverLetter" class="text-sm text-gray-700">With Cover Letter</label>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Association Data (from Settings)</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Treasurer</label>
            <input
              v-model="inputs.treasurer"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Charitable Purpose</label>
            <input
              v-model="inputs.charitablePurpose"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tax Office</label>
            <input
              v-model="inputs.taxOfficeName"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tax Number</label>
            <input
              v-model="inputs.taxNumber"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Exemption Date</label
            >
            <input
              v-model="inputs.exemptionDate"
              type="date"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Assessment Period</label>
            <input
              v-model="inputs.assessmentPeriod"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          @click="router.back()"
        >
          Cancel
        </button>
        <button
          type="submit"
          :disabled="sending"
          class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {{
            sending
              ? isNewRevision
                ? 'Saving revision…'
                : 'Generating…'
              : isNewRevision
                ? 'Save Revision'
                : 'Create Receipt'
          }}
        </button>
      </div>
    </form>
  </div>
</template>
