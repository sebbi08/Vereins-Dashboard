<script setup lang="ts">
import type { InvoiceInputs, InvoiceRecipientDto } from 'shared';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';

const router = useRouter();
const route = useRoute();
const store = useAppStore();

const invoiceId = route.params.id ? parseInt(String(route.params.id)) : null;
const isNewRevision = !!invoiceId;

const sending = ref(false);
const error = ref('');
const warning = ref('');
const info = ref('');
const success = ref('');

const recipient = ref<InvoiceRecipientDto | null>(null);
const newRecipient = ref(false);
const recipientSearch = ref('');
const recipientSuggestions = ref<InvoiceRecipientDto[]>([]);
const recipientLoading = ref(false);

const inputs = ref<InvoiceInputs>({
  salutation: '',
  name: '',
  street: '',
  city: '',
  invoiceDate: new Date().toISOString().split('T')[0],
  title: '',
  lineItems: [{ text: '', priceInCents: 0 }],
  vat: 19,
  directDebit: false,
  email: '',
  emailSalutation: 'Sehr geehrte Damen und Herren',
});

let debounceTimer: ReturnType<typeof setTimeout>;
async function searchRecipient() {
  clearTimeout(debounceTimer);
  if (!recipientSearch.value.trim()) {
    recipientSuggestions.value = [];
    return;
  }
  debounceTimer = setTimeout(async () => {
    recipientLoading.value = true;
    try {
      const res = await fetch(
        `/api/invoice/recipient?search=${encodeURIComponent(recipientSearch.value)}`,
      );
      if (res.ok) recipientSuggestions.value = await res.json();
    } finally {
      recipientLoading.value = false;
    }
  }, 300);
}

function selectRecipient(e: InvoiceRecipientDto) {
  recipient.value = e;
  newRecipient.value = false;
  recipientSearch.value = e.name;
  recipientSuggestions.value = [];
  inputs.value.name = e.name;
  inputs.value.street = e.street;
  inputs.value.city = e.city;
  inputs.value.email = e.email ?? '';
  inputs.value.salutation = e.salutation ?? '';
}

function addLineItem() {
  inputs.value.lineItems.push({ text: '', priceInCents: 0 });
}

function removeLineItem(index: number) {
  if (inputs.value.lineItems.length > 1) {
    inputs.value.lineItems.splice(index, 1);
  }
}

function priceToCentString(index: number): string {
  const cents = inputs.value.lineItems[index].priceInCents;
  return cents ? String(cents) : '';
}

function priceFromCentString(index: number, value: string) {
  const cleaned = value.replace(/[^0-9]/g, '');
  inputs.value.lineItems[index].priceInCents = parseInt(cleaned || '0', 10);
}

const gross = ref('0,00');
function updateGross() {
  const net = inputs.value.lineItems.reduce((sum, p) => sum + p.priceInCents, 0);
  const tax = Math.round(net * (inputs.value.vat / 100));
  const total = (net + tax) / 100;
  gross.value = total.toFixed(2).replace('.', ',');
}

async function ladeRevision() {
  if (!invoiceId) return;
  const res = await fetch(`/api/invoice/${invoiceId}`);
  if (!res.ok) return;
  const data = await res.json();

  if (data.activeRevision) {
    const e = data.activeRevision.inputs as InvoiceInputs;
    inputs.value = {
      ...e,
      invoiceDate: e.invoiceDate.includes('T')
        ? e.invoiceDate.split('T')[0]
        : e.invoiceDate,
    };
  }

  if (data.recipient) {
    recipient.value = data.recipient;
    recipientSearch.value = data.recipient.name;
  }
}

onMounted(async () => {
  if (store.invoiceTemplateAvailable === false) {
    router.replace('/invoice');
    return;
  }
  if (store.invoiceTemplateAvailable === null) {
    await store.checkTemplates();
    if (!store.invoiceTemplateAvailable) {
      router.replace('/invoice');
      return;
    }
  }

  if (isNewRevision) {
    await ladeRevision();
  }
  updateGross();
});

async function submit() {
  error.value = '';
  warning.value = '';
  info.value = '';
  success.value = '';

  if (!inputs.value.name.trim()) {
    error.value = 'Name is required';
    return;
  }
  if (!inputs.value.title.trim()) {
    error.value = 'Title is required';
    return;
  }
  if (inputs.value.lineItems.some((p) => !p.text.trim())) {
    error.value = 'All line items need text';
    return;
  }

  sending.value = true;

  try {
    let res: Response;

    if (isNewRevision) {
      res = await fetch(`/api/invoice/${invoiceId}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: inputs.value }),
      });
    } else {
      const body: Record<string, unknown> = { inputs: inputs.value };
      if (recipient.value && !newRecipient.value) {
        body.recipientId = recipient.value.id;
      } else {
        body.recipientData = {
          name: inputs.value.name,
          street: inputs.value.street,
          city: inputs.value.city,
          email: inputs.value.email,
          salutation: inputs.value.salutation,
        };
      }
      res = await fetch('/api/invoice', {
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
      warning.value = result.pdfError || 'PDF could not be generated.';
    } else {
      success.value = 'Invoice saved successfully.';
    }

    const zielId = result.invoiceId ?? invoiceId;
    setTimeout(() => router.push(`/invoice/${zielId}`), 1000);
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
        {{ isNewRevision ? 'Create New Revision' : 'New Invoice' }}
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
      <!-- Recipient -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Recipient</h3>

        <div v-if="!isNewRevision" class="mb-3 relative">
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >Search or create recipient</label
          >
          <input
            v-model="recipientSearch"
            type="text"
            placeholder="Enter name…"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            @input="searchRecipient()"
            @focus="searchRecipient()"
          />
          <div
            v-if="recipientSuggestions.length > 0"
            class="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-auto"
          >
            <button
              v-for="e in recipientSuggestions"
              :key="e.id"
              type="button"
              class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
              @click="selectRecipient(e)"
            >
              {{ e.name }} — {{ e.street }}, {{ e.city }}
            </button>
          </div>
          <p
            v-if="
              recipientSearch &&
              !recipientLoading &&
              recipientSuggestions.length === 0 &&
              !recipient
            "
            class="text-xs text-gray-500 mt-1"
          >
            No recipient found. Fill in the fields below to create a new one.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Salutation</label>
            <input
              v-model="inputs.salutation"
              type="text"
              :disabled="!!recipient && !newRecipient"
              :class="[
                'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                recipient && !newRecipient
                  ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              v-model="inputs.name"
              type="text"
              required
              :disabled="!!recipient && !newRecipient"
              :class="[
                'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                recipient && !newRecipient
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
              :disabled="!!recipient && !newRecipient"
              :class="[
                'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                recipient && !newRecipient
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
              :disabled="!!recipient && !newRecipient"
              :class="[
                'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                recipient && !newRecipient
                  ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
          </div>
        </div>
      </div>

      <!-- Invoice Details -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Invoice</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              v-model="inputs.title"
              type="text"
              required
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
            <input
              v-model="inputs.invoiceDate"
              type="date"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">Line Items</label>
          <div class="space-y-2">
            <div
              v-for="(pos, idx) in inputs.lineItems"
              :key="idx"
              class="flex gap-2 items-start"
            >
              <div class="flex-1">
                <input
                  v-model="pos.text"
                  type="text"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  @input="updateGross"
                />
              </div>
              <div class="w-24">
                <input
                  :value="priceToCentString(idx)"
                  type="text"
                  placeholder=""
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  @input="
                    priceFromCentString(idx, ($event.target as HTMLInputElement).value);
                    updateGross();
                  "
                />
              </div>
              <button
                v-if="inputs.lineItems.length > 1"
                type="button"
                class="text-red-400 hover:text-red-600 text-sm px-1 py-2"
                @click="removeLineItem(idx)"
              >
                ×
              </button>
            </div>
          </div>
          <button
            type="button"
            class="mt-2 text-blue-600 hover:underline text-sm"
            @click="
              addLineItem();
              updateGross();
            "
          >
            + Add Line Item
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">VAT</label>
            <select
              v-model="inputs.vat"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              @change="updateGross"
            >
              <option :value="7">7%</option>
              <option :value="19">19%</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select
              v-model="inputs.directDebit"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option :value="false">Bank Transfer</option>
              <option :value="true">Direct Debit</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Gross Amount</label>
            <div
              class="w-full border border-gray-200 rounded-lg px-3 py-3 text-sm bg-gray-50 font-medium"
            >
              {{ gross }} €
            </div>
          </div>
        </div>
      </div>

      <!-- Metadaten -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Metadata</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
            <input
              v-model="inputs.email"
              type="email"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email Salutation</label>
            <input
              v-model="inputs.emailSalutation"
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
                : 'Create Invoice'
          }}
        </button>
      </div>
    </form>
  </div>
</template>
