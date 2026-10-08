<script setup lang="ts">
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ToggleSwitch from 'primevue/toggleswitch';
import type { DonationReceiptDto, DonorDto, ReceiptInputs, SystemSettings } from 'shared';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DonorAutocomplete from '../components/DonorAutocomplete.vue';
import DecimalInput from '../components/ui/DecimalInput.vue';
import FormSection from '../components/ui/FormSection.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useNotify } from '../composables/useNotify';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { useAppStore } from '../stores/app';
import { fromIsoDate, toIsoDate } from '../utils/format';
import { errorMessage, NO_RESPONSE_ON_CREATE, requestJson } from '../utils/requestJson';

const router = useRouter();
const route = useRoute();
const store = useAppStore();
const notify = useNotify();

const receiptId = route.params.id ? parseInt(String(route.params.id)) : null;
const copyFromId = route.query.copyFrom ? parseInt(String(route.query.copyFrom)) : null;
const isNewRevision = !!receiptId;
const isCopy = !!copyFromId;

const DEFAULT_LETTER_SALUTATION = 'Sehr geehrte Damen und Herren';
const SETTINGS_KEYS = [
  'treasurer',
  'charitablePurpose',
  'taxOfficeName',
  'taxNumber',
  'exemptionDate',
  'assessmentPeriod',
] as const;

const sending = ref(false);
const loadError = ref('');
const defaultsHint = ref(false);
const validationAttempted = ref(false);

const donor = ref<DonorDto | null>(null);
const newDonor = ref(false);

/** Revisions edit the linked donor in place; a donor picked from the search stays locked. */
const donorFieldsLocked = computed(() => !isNewRevision && !!donor.value && !newDonor.value);

const inputs = ref<ReceiptInputs>({
  name: '',
  street: '',
  city: '',
  letterSalutation: '',
  addressSalutation: '',
  donationAmountCents: 0,
  donationDate: toIsoDate(new Date()),
  withCoverLetter: true,
  treasurer: '',
  charitablePurpose: '',
  taxOfficeName: '',
  taxNumber: '',
  exemptionDate: '',
  assessmentPeriod: '',
});

/** Form state as last loaded or saved; anything else counts as unsaved changes. */
function formSnapshot(): string {
  return JSON.stringify([inputs.value, donor.value?.id ?? null]);
}
const savedSnapshot = ref(formSnapshot());
const { allowLeave } = useUnsavedChangesGuard(() => formSnapshot() !== savedSnapshot.value);

// A request that finishes after the user left the form must not pull them back
let leftForm = false;
onBeforeUnmount(() => {
  leftForm = true;
});

const pageTitle = isNewRevision
  ? 'Create New Revision'
  : isCopy
    ? 'Duplicate Receipt'
    : 'New Donation Receipt';

type FieldKey =
  | 'letterSalutation'
  | 'amount'
  | 'donationDate'
  | 'taxOfficeName'
  | 'taxNumber'
  | 'exemptionDate';

/** Shown after the first submit attempt and kept up to date while the user fixes them. */
const fieldErrors = computed<Partial<Record<FieldKey, string>>>(() => {
  if (!validationAttempted.value) return {};
  const errors: Partial<Record<FieldKey, string>> = {};
  if (inputs.value.withCoverLetter && !inputs.value.letterSalutation.trim()) {
    errors.letterSalutation = 'Letter Salutation is required when creating a cover letter.';
  }
  if (inputs.value.donationAmountCents <= 0) errors.amount = 'Amount is required';
  if (!inputs.value.donationDate) errors.donationDate = 'Donation Date is required';
  // Required on the tax document; normally pre-filled from the settings
  if (!inputs.value.taxOfficeName.trim()) errors.taxOfficeName = 'Tax Office is required';
  if (!inputs.value.taxNumber.trim()) errors.taxNumber = 'Tax Number is required';
  if (!inputs.value.exemptionDate) errors.exemptionDate = 'Exemption Date is required';
  return errors;
});

const amountEuros = computed<number | null>({
  get: () => (inputs.value.donationAmountCents > 0 ? inputs.value.donationAmountCents / 100 : null),
  set: (euros) => {
    inputs.value.donationAmountCents = euros === null ? 0 : Math.round(euros * 100);
  },
});

function dateModel(key: 'donationDate' | 'exemptionDate') {
  return computed<Date | null>({
    get: () => fromIsoDate(inputs.value[key]),
    set: (date) => {
      inputs.value[key] = date ? toIsoDate(date) : '';
    },
  });
}

const donationDateValue = dateModel('donationDate');
const exemptionDateValue = dateModel('exemptionDate');

function fillDonorFields(d: DonorDto) {
  inputs.value.name = d.name;
  inputs.value.street = d.street;
  inputs.value.city = d.city;
  inputs.value.letterSalutation = d.letterSalutation;
  inputs.value.addressSalutation = d.addressSalutation ?? '';
}

function donorFieldsOf(i: ReceiptInputs): string[] {
  return [i.name, i.street, i.city, i.letterSalutation, i.addressSalutation ?? ''];
}

async function loadSettings() {
  const res = await fetch('/api/settings');
  if (!res.ok) return;
  const data = (await res.json()) as Partial<SystemSettings>;
  for (const key of SETTINGS_KEYS) {
    const value = data[key];
    if (value) inputs.value[key] = value;
  }
}

async function fetchReceipt(id: number): Promise<DonationReceiptDto | null> {
  const res = await fetch(`/api/donation-receipt/${id}`);
  if (!res.ok) {
    loadError.value = 'Receipt could not be loaded';
    return null;
  }
  return (await res.json()) as DonationReceiptDto;
}

async function loadRevision(id: number) {
  const data = await fetchReceipt(id);
  if (!data) return;
  if (data.activeRevision) {
    const e = data.activeRevision.inputs;
    inputs.value = { ...e, donationDate: e.donationDate.slice(0, 10) };
  }
  donor.value = data.donor;
  const before = donorFieldsOf(inputs.value).join('\n');
  fillDonorFields(data.donor);
  defaultsHint.value = before !== donorFieldsOf(inputs.value).join('\n');
}

async function copyFromReceipt(id: number) {
  const data = await fetchReceipt(id);
  if (!data) return;
  if (data.activeRevision) {
    inputs.value = { ...data.activeRevision.inputs, donationDate: toIsoDate(new Date()) };
  }
  donor.value = data.donor;
  newDonor.value = false;
  fillDonorFields(data.donor);
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

  try {
    await loadSettings();
    if (receiptId) await loadRevision(receiptId);
    else if (copyFromId) await copyFromReceipt(copyFromId);
  } catch {
    loadError.value = 'Network error while loading';
  }
  savedSnapshot.value = formSnapshot();
});

function onDonorSelected(d: DonorDto | null) {
  donor.value = d;
  if (d) {
    newDonor.value = false;
    fillDonorFields(d);
  }
}

function onNewDonor(data: { name: string; street: string; city: string }) {
  newDonor.value = true;
  donor.value = null;
  inputs.value.name = data.name;
  inputs.value.street = data.street;
  inputs.value.city = data.city;
  inputs.value.letterSalutation = DEFAULT_LETTER_SALUTATION;
  inputs.value.addressSalutation = '';
}

function donorRequestBody(): Record<string, unknown> {
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
  return body;
}

async function submit() {
  if (loadError.value) return;
  validationAttempted.value = true;
  if (Object.keys(fieldErrors.value).length > 0) return;

  sending.value = true;
  try {
    const res = isNewRevision
      ? await requestJson(`/api/donation-receipt/${receiptId}/revision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: inputs.value }),
        })
      : await requestJson('/api/donation-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(donorRequestBody()),
        });
    if (!res.ok) {
      notify.error(errorMessage(res));
      return;
    }
    const result = res.body;
    if (result.pdfStatus === 'FAILED') {
      notify.warn(
        (result.pdfError as string | null) || 'PDF could not be generated. Please try again.',
      );
    } else {
      notify.success('Receipt saved successfully.');
    }
    if (result.donorUpdated) notify.info('Donor master data updated.');
    if (leftForm) return;
    allowLeave();
    router.push(`/donation-receipt/${(result.receiptId as number | undefined) ?? receiptId}`);
  } catch {
    notify.error(NO_RESPONSE_ON_CREATE);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="page">
    <PageHeader :title="pageTitle">
      <template #actions>
        <Button
          label="Back"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          @click="router.back()"
        />
      </template>
    </PageHeader>

    <Message v-if="loadError" severity="error" data-testid="load-error" class="load-error">
      {{ loadError }}
    </Message>

    <form @submit.prevent="submit">
      <FormSection title="Donor">
        <div v-if="!isNewRevision" class="field donor-search">
          <label for="donor-search-input">Search or create donor</label>
          <DonorAutocomplete
            :model-value="donor"
            input-id="donor-search-input"
            @update:model-value="onDonorSelected"
            @neu="onNewDonor"
          />
        </div>

        <Message
          v-if="isNewRevision && defaultsHint"
          severity="info"
          size="small"
          data-testid="defaults-hint"
          class="hint-message"
        >
          This revision was pre-filled with the current donor master data.
        </Message>

        <div class="grid-2">
          <div class="field">
            <label for="name">Name</label>
            <InputText
              id="name"
              v-model="inputs.name"
              required
              :disabled="donorFieldsLocked"
              fluid
            />
          </div>
          <div class="field">
            <label for="street">Street</label>
            <InputText
              id="street"
              v-model="inputs.street"
              required
              :disabled="donorFieldsLocked"
              fluid
            />
          </div>
          <div class="field">
            <label for="city">City</label>
            <InputText
              id="city"
              v-model="inputs.city"
              required
              :disabled="donorFieldsLocked"
              fluid
            />
          </div>
          <div class="field">
            <label for="letter-salutation">Letter Salutation</label>
            <InputText
              id="letter-salutation"
              v-model="inputs.letterSalutation"
              :disabled="donorFieldsLocked"
              :invalid="!!fieldErrors.letterSalutation"
              fluid
            />
            <Message
              v-if="fieldErrors.letterSalutation"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-letter-salutation"
            >
              {{ fieldErrors.letterSalutation }}
            </Message>
          </div>
          <div class="field field--wide">
            <label for="address-salutation">Address Salutation (optional)</label>
            <InputText
              id="address-salutation"
              v-model="inputs.addressSalutation"
              :disabled="donorFieldsLocked"
              fluid
            />
          </div>
        </div>

        <p v-if="isNewRevision" class="muted hint" data-testid="donor-edit-hint">
          Editing these donor fields updates the linked donor record for this receipt.
        </p>
      </FormSection>

      <FormSection title="Donation">
        <div class="grid-2">
          <div class="field">
            <label for="amount">Amount</label>
            <DecimalInput
              v-model="amountEuros"
              input-id="amount"
              :min-fraction-digits="2"
              suffix="€"
              :invalid="!!fieldErrors.amount"
            />
            <Message
              v-if="fieldErrors.amount"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-amount"
            >
              {{ fieldErrors.amount }}
            </Message>
          </div>
          <div class="field">
            <label for="donation-date">Donation Date</label>
            <DatePicker
              v-model="donationDateValue"
              input-id="donation-date"
              data-testid="donation-date"
              date-format="dd.mm.yy"
              show-icon
              :invalid="!!fieldErrors.donationDate"
              fluid
            />
            <Message
              v-if="fieldErrors.donationDate"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-donation-date"
            >
              {{ fieldErrors.donationDate }}
            </Message>
          </div>
          <div class="field">
            <label for="with-cover-letter">Cover Letter</label>
            <div class="row gap-sm">
              <ToggleSwitch v-model="inputs.withCoverLetter" input-id="with-cover-letter" />
              <span>{{
                inputs.withCoverLetter ? 'With cover letter' : 'Without cover letter'
              }}</span>
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection title="Association Data (from Settings)">
        <div class="grid-2">
          <div class="field">
            <label for="treasurer">Treasurer</label>
            <InputText id="treasurer" v-model="inputs.treasurer" fluid />
          </div>
          <div class="field">
            <label for="charitable-purpose">Charitable Purpose</label>
            <InputText id="charitable-purpose" v-model="inputs.charitablePurpose" fluid />
          </div>
          <div class="field">
            <label for="tax-office">Tax Office</label>
            <InputText
              id="tax-office"
              v-model="inputs.taxOfficeName"
              :invalid="!!fieldErrors.taxOfficeName"
              fluid
            />
            <Message
              v-if="fieldErrors.taxOfficeName"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-tax-office"
            >
              {{ fieldErrors.taxOfficeName }}
            </Message>
          </div>
          <div class="field">
            <label for="tax-number">Tax Number</label>
            <InputText
              id="tax-number"
              v-model="inputs.taxNumber"
              :invalid="!!fieldErrors.taxNumber"
              fluid
            />
            <Message
              v-if="fieldErrors.taxNumber"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-tax-number"
            >
              {{ fieldErrors.taxNumber }}
            </Message>
          </div>
          <div class="field">
            <label for="exemption-date">Exemption Date</label>
            <DatePicker
              v-model="exemptionDateValue"
              input-id="exemption-date"
              data-testid="exemption-date"
              date-format="dd.mm.yy"
              show-icon
              show-clear
              :invalid="!!fieldErrors.exemptionDate"
              fluid
            />
            <Message
              v-if="fieldErrors.exemptionDate"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-exemption-date"
            >
              {{ fieldErrors.exemptionDate }}
            </Message>
          </div>
          <div class="field">
            <label for="assessment-period">Assessment Period</label>
            <InputText id="assessment-period" v-model="inputs.assessmentPeriod" fluid />
          </div>
        </div>
      </FormSection>

      <div class="form-actions">
        <Button label="Cancel" text severity="secondary" @click="router.back()" />
        <Button
          type="submit"
          :label="
            sending
              ? isNewRevision
                ? 'Saving revision…'
                : 'Generating…'
              : isNewRevision
                ? 'Save Revision'
                : 'Create Receipt'
          "
          :disabled="sending || !!loadError"
          data-testid="submit"
        />
      </div>
    </form>
  </div>
</template>

<style scoped>
.load-error {
  margin-bottom: 1rem;
}

.donor-search,
.hint-message {
  margin-bottom: 1rem;
}

.field--wide {
  grid-column: 1 / -1;
}

.hint {
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
}
</style>
