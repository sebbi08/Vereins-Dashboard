<script setup lang="ts">
import AutoComplete, {
  type AutoCompleteCompleteEvent,
  type AutoCompleteOptionSelectEvent,
} from 'primevue/autocomplete';
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import type {
  InstructorInvoicePrefillDto,
  InvoiceDraftDto,
  InvoiceInputs,
  InvoiceRecipientDto,
} from 'shared';
import { calculateInvoiceTotals, INVOICE_VAT_PERCENT } from 'shared';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FormSection from '../components/ui/FormSection.vue';
import LineItemsEditor from '../components/LineItemsEditor.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { useAppStore } from '../stores/app';
import { formatCents, formatDate, fromIsoDate, toIsoDate } from '../utils/format';
import { errorMessage, NO_RESPONSE_ON_CREATE, requestJson } from '../utils/requestJson';

const router = useRouter();
const route = useRoute();
const store = useAppStore();
const notify = useNotify();
const { confirmAction } = useConfirmAction();

const invoiceId = route.params.id ? parseInt(String(route.params.id)) : null;
const copyFromId = route.query.copyFrom ? parseInt(String(route.query.copyFrom)) : null;
const isNewRevision = !!invoiceId;
const isCopy = !!copyFromId;
const draftId = route.params.draftId ? parseInt(String(route.params.draftId)) : null;
const isDraft = !!draftId;
const draftLoaded = ref(false);
const fromInstructorId = route.query.fromInstructor
  ? parseInt(String(route.query.fromInstructor))
  : null;

const sending = ref(false);
const loadError = ref('');
type FieldKey = 'name' | 'street' | 'city' | 'invoiceDate' | 'title' | 'lineItems';
const fieldErrors = ref<Partial<Record<FieldKey, string>>>({});

const recipient = ref<InvoiceRecipientDto | null>(null);
const recipientSearch = ref('');
const recipientSuggestions = ref<InvoiceRecipientDto[]>([]);
const recipientSearched = ref(false);

/** True when a revision's address fields were replaced by newer recipient master data. */
const defaultsHint = ref(false);

/** True while a line item price holds text that is not a valid amount (see LineItemsEditor). */
const hasInvalidPrices = ref(false);

const inputs = ref<InvoiceInputs>({
  salutation: '',
  name: '',
  street: '',
  city: '',
  invoiceDate: toIsoDate(new Date()),
  title: '',
  lineItems: [{ text: '', priceInCents: 0 }],
  vat: INVOICE_VAT_PERCENT,
  directDebit: false,
  email: '',
  emailSalutation: 'Sehr geehrte Damen und Herren',
});

/** Form state as last loaded or saved; anything else counts as unsaved changes. */
function formSnapshot(): string {
  return JSON.stringify([inputs.value, recipient.value?.id ?? null]);
}
const savedSnapshot = ref(formSnapshot());
const { allowLeave } = useUnsavedChangesGuard(() => formSnapshot() !== savedSnapshot.value);

// A request that finishes after the user left the form must not pull them back
let leftForm = false;
onBeforeUnmount(() => {
  leftForm = true;
});

/** Leaves the form after a successful save, unless the user already went elsewhere. */
function leaveTo(path: string) {
  if (leftForm) return;
  allowLeave();
  router.push(path);
}

const VAT_OPTIONS = [
  { label: '7%', value: 7 },
  { label: '19%', value: 19 },
];

const pageTitle = computed(() =>
  isDraft
    ? 'Edit Draft'
    : isNewRevision
      ? 'Create New Revision'
      : isCopy
        ? 'Duplicate Invoice'
        : 'New Invoice',
);

const invoiceDateValue = computed<Date | null>({
  get: () => fromIsoDate(inputs.value.invoiceDate),
  set: (date) => {
    inputs.value.invoiceDate = date ? toIsoDate(date) : '';
  },
});

const grossCents = computed(
  () => calculateInvoiceTotals(inputs.value.lineItems, inputs.value.vat).grossCents,
);

/** Bumped by every search; a response from an older search is stale. */
let latestRecipientSearch = 0;

async function searchRecipient(event: AutoCompleteCompleteEvent) {
  const query = event.query.trim();
  const searchId = ++latestRecipientSearch;
  if (!query) {
    recipientSuggestions.value = [];
    return;
  }
  let found: InvoiceRecipientDto[] = [];
  try {
    const res = await fetch(`/api/invoice-recipient?search=${encodeURIComponent(query)}`);
    if (res.ok) found = await res.json();
  } catch {
    // no suggestions
  }
  if (searchId !== latestRecipientSearch) return;
  recipientSuggestions.value = found;
  recipientSearched.value = true;
}

function onRecipientInput(value: string | InvoiceRecipientDto | null) {
  recipientSearch.value = typeof value === 'string' ? value : (value?.name ?? '');
}

/** Copies the recipient master record into the address fields. */
function fillRecipientFields(r: InvoiceRecipientDto) {
  inputs.value.name = r.name;
  inputs.value.street = r.street;
  inputs.value.city = r.city;
  inputs.value.email = r.email ?? '';
  inputs.value.salutation = r.salutation ?? '';
}

function recipientFieldsOf(i: InvoiceInputs): string[] {
  return [i.name, i.street, i.city, i.email, i.salutation];
}

function selectRecipient(e: InvoiceRecipientDto) {
  recipient.value = e;
  recipientSearch.value = e.name;
  recipientSuggestions.value = [];
  fillRecipientFields(e);
}

/** Unlinks the selected recipient so the fields describe a new one. */
function startNewRecipient() {
  recipient.value = null;
  recipientSearch.value = '';
  recipientSuggestions.value = [];
  recipientSearched.value = false;
  fillRecipientFields({ id: 0, name: '', street: '', city: '', email: null, salutation: null });
}

function onRecipientSelect(event: AutoCompleteOptionSelectEvent) {
  selectRecipient(event.value as InvoiceRecipientDto);
}

async function loadRevision() {
  if (!invoiceId) return;
  const res = await fetch(`/api/invoice/${invoiceId}`);
  if (!res.ok) {
    loadError.value = 'Invoice could not be loaded';
    return;
  }
  const data = await res.json();
  if (data.activeRevision) {
    const e = data.activeRevision.inputs as InvoiceInputs;
    inputs.value = {
      ...e,
      invoiceDate: e.invoiceDate.includes('T') ? e.invoiceDate.split('T')[0] : e.invoiceDate,
    };
  }
  if (data.recipient) {
    recipient.value = data.recipient;
    recipientSearch.value = data.recipient.name;
    // The revision snapshot may predate an address change; the master record is current.
    const before = recipientFieldsOf(inputs.value).join('\n');
    fillRecipientFields(data.recipient);
    defaultsHint.value = before !== recipientFieldsOf(inputs.value).join('\n');
  }
}

async function copyFromInvoice() {
  if (!copyFromId) return;
  const res = await fetch(`/api/invoice/${copyFromId}`);
  if (!res.ok) {
    loadError.value = 'Invoice could not be loaded';
    return;
  }
  const data = await res.json();
  if (data.activeRevision) {
    const e = data.activeRevision.inputs as InvoiceInputs;
    inputs.value = { ...e, invoiceDate: toIsoDate(new Date()) };
  }
  if (data.recipient) {
    recipient.value = data.recipient;
    recipientSearch.value = data.recipient.name;
    fillRecipientFields(data.recipient);
  }
}

async function loadDraft() {
  if (!draftId) return;
  const res = await fetch(`/api/invoice-draft/${draftId}`);
  if (!res.ok) {
    loadError.value = 'Draft not found';
    return;
  }
  const data = (await res.json()) as InvoiceDraftDto;
  inputs.value = { ...data.inputs, invoiceDate: inputs.value.invoiceDate };
  recipient.value = data.recipient;
  recipientSearch.value = data.recipient.name;
  draftLoaded.value = true;
}

async function prefillFromInstructor() {
  if (!fromInstructorId) return;
  const res = await fetch(`/api/instructor/${fromInstructorId}/invoice-prefill`);
  if (!res.ok) {
    notify.error('Could not load instructor data');
    return;
  }
  const data = (await res.json()) as InstructorInvoicePrefillDto;
  selectRecipient(data.recipient);
  inputs.value.title = data.title;
  inputs.value.lineItems = data.lineItems;
  inputs.value.invoiceDate = toIsoDate(new Date());
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

  try {
    if (isNewRevision) await loadRevision();
    else if (isCopy) await copyFromInvoice();
    else if (isDraft) await loadDraft();
    else if (fromInstructorId) await prefillFromInstructor();
  } catch {
    loadError.value = 'Network error while loading';
  }
  savedSnapshot.value = formSnapshot();
});

function recipientRequestBody(): Record<string, unknown> {
  const body: Record<string, unknown> = { inputs: inputs.value };
  if (recipient.value) {
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
  return body;
}

/** Drafts only need a name; invoices and revisions need title and line item texts too. */
function validate(complete: boolean): boolean {
  const errors: Partial<Record<FieldKey, string>> = {};
  if (!inputs.value.name.trim()) errors.name = 'Name is required';
  if (hasInvalidPrices.value) errors.lineItems = 'Fix the highlighted prices';
  if (complete) {
    if (!inputs.value.street.trim()) errors.street = 'Street is required';
    if (!inputs.value.city.trim()) errors.city = 'City is required';
    if (!isDraft && !inputs.value.invoiceDate) errors.invoiceDate = 'Invoice Date is required';
    if (!inputs.value.title.trim()) errors.title = 'Title is required';
    if (!errors.lineItems && inputs.value.lineItems.some((p) => !p.text.trim())) {
      errors.lineItems = 'All line items need text';
    }
    if (!errors.lineItems && inputs.value.lineItems.some((p) => p.priceInCents <= 0)) {
      errors.lineItems = 'Every line item needs a price above 0';
    }
  }
  fieldErrors.value = errors;
  return Object.keys(errors).length === 0;
}

async function submit() {
  if (loadError.value) return;
  if (!validate(true)) return;
  sending.value = true;
  try {
    const res = isNewRevision
      ? await requestJson(`/api/invoice/${invoiceId}/revision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: inputs.value }),
        })
      : await requestJson('/api/invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recipientRequestBody()),
        });
    if (!res.ok) {
      notify.error(errorMessage(res));
      return;
    }
    const result = res.body;
    if (result.pdfStatus === 'FAILED') {
      notify.warn((result.pdfError as string | null) || 'PDF could not be generated.');
    } else {
      notify.success('Invoice saved successfully.');
    }
    leaveTo(`/invoice/${(result.invoiceId as number | undefined) ?? invoiceId}`);
  } catch {
    notify.error(NO_RESPONSE_ON_CREATE);
  } finally {
    sending.value = false;
  }
}

/** Creates or updates the draft. Returns the draft id, or null on error. */
async function saveDraft(): Promise<number | null> {
  if (loadError.value) return null;
  if (!validate(false)) return null;
  sending.value = true;
  try {
    const res = await requestJson(
      isDraft ? `/api/invoice-draft/${draftId}` : '/api/invoice-draft',
      {
        method: isDraft ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipientRequestBody()),
      },
    );
    if (!res.ok) {
      notify.error(errorMessage(res));
      return null;
    }
    return res.body.draftId as number;
  } catch {
    notify.error('Network error while saving');
    return null;
  } finally {
    sending.value = false;
  }
}

async function onSaveDraft() {
  const id = await saveDraft();
  if (id === null) return;
  notify.success('Draft saved.');
  savedSnapshot.value = formSnapshot();
  if (!isDraft) router.push('/invoice');
}

async function activateDraft() {
  const today = formatDate(toIsoDate(new Date()));
  const confirmed = await confirmAction({
    message: `Assigns the next invoice number and today's date (${today}). Continue?`,
    header: 'Activate draft',
    acceptLabel: 'Activate',
  });
  if (!confirmed) return;

  const id = await saveDraft();
  if (id === null) return;

  sending.value = true;
  try {
    const res = await requestJson(`/api/invoice-draft/${draftId}/activate`, { method: 'POST' });
    if (!res.ok) {
      notify.error(errorMessage(res));
      return;
    }
    notify.success('Invoice created.');
    leaveTo(`/invoice/${res.body.invoiceId as number}`);
  } catch {
    notify.error(NO_RESPONSE_ON_CREATE);
  } finally {
    sending.value = false;
  }
}

async function deleteDraft() {
  const confirmed = await confirmAction({
    message: 'Delete this draft?',
    header: 'Delete draft',
    acceptLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) return;
  sending.value = true;
  try {
    const res = await fetch(`/api/invoice-draft/${draftId}`, { method: 'DELETE' });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      notify.error(result.error || 'Unknown error');
      return;
    }
    notify.success('Draft deleted.');
    leaveTo('/invoice');
  } catch {
    notify.error('Network error while deleting');
  } finally {
    sending.value = false;
  }
}

function onFormSubmit() {
  if (sending.value) return;
  if (isDraft) {
    // Enter in a draft must never create a real invoice; and never save a draft that failed to load
    if (draftLoaded.value) void onSaveDraft();
  } else {
    void submit();
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

    <form :novalidate="isDraft" @submit.prevent="onFormSubmit">
      <FormSection title="Recipient">
        <Message
          v-if="isNewRevision && defaultsHint"
          severity="info"
          size="small"
          data-testid="defaults-hint"
          class="hint-message"
        >
          This revision was pre-filled with the current recipient master data.
        </Message>
        <div v-if="!isNewRevision" class="field recipient-search">
          <label for="recipient-search">Search or create recipient</label>
          <div class="row gap-sm recipient-search__row">
            <AutoComplete
              :model-value="recipientSearch"
              input-id="recipient-search"
              data-testid="recipient-search"
              :suggestions="recipientSuggestions"
              option-label="name"
              placeholder="Enter name…"
              :delay="300"
              fluid
              @complete="searchRecipient"
              @option-select="onRecipientSelect"
              @update:model-value="onRecipientInput"
            >
              <template #option="{ option }">
                {{ option.name }} — {{ option.street }}, {{ option.city }}
              </template>
            </AutoComplete>
            <Button
              v-if="recipient"
              label="New recipient"
              icon="pi pi-user-plus"
              severity="secondary"
              outlined
              data-testid="recipient-new"
              @click="startNewRecipient"
            />
          </div>
          <small
            v-if="
              recipientSearch &&
              recipientSearched &&
              recipientSuggestions.length === 0 &&
              !recipient
            "
            class="muted"
          >
            No recipient found. Fill in the fields below to create a new one.
          </small>
        </div>

        <div class="grid-2">
          <div class="field">
            <label for="salutation">Salutation</label>
            <InputText id="salutation" v-model="inputs.salutation" fluid />
          </div>
          <div class="field">
            <label for="name">Name</label>
            <InputText id="name" v-model="inputs.name" :invalid="!!fieldErrors.name" fluid />
            <Message
              v-if="fieldErrors.name"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-name"
            >
              {{ fieldErrors.name }}
            </Message>
          </div>
          <div class="field">
            <label for="street">Street</label>
            <InputText id="street" v-model="inputs.street" :invalid="!!fieldErrors.street" fluid />
            <Message
              v-if="fieldErrors.street"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-street"
            >
              {{ fieldErrors.street }}
            </Message>
          </div>
          <div class="field">
            <label for="city">City</label>
            <InputText id="city" v-model="inputs.city" :invalid="!!fieldErrors.city" fluid />
            <Message
              v-if="fieldErrors.city"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-city"
            >
              {{ fieldErrors.city }}
            </Message>
          </div>
        </div>

        <p v-if="recipient" data-testid="recipient-linked-hint" class="muted hint">
          Linked to an existing recipient. Editing these fields updates that recipient.
        </p>
      </FormSection>

      <FormSection title="Invoice">
        <div class="grid-2">
          <div class="field">
            <label for="title">Title</label>
            <InputText
              id="title"
              v-model="inputs.title"
              required
              :invalid="!!fieldErrors.title"
              fluid
            />
            <Message
              v-if="fieldErrors.title"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-title"
            >
              {{ fieldErrors.title }}
            </Message>
          </div>
          <div v-if="!isDraft" class="field">
            <label for="invoice-date">Invoice Date</label>
            <DatePicker
              v-model="invoiceDateValue"
              input-id="invoice-date"
              data-testid="invoice-date"
              date-format="dd.mm.yy"
              show-icon
              :invalid="!!fieldErrors.invoiceDate"
              fluid
            />
            <Message
              v-if="fieldErrors.invoiceDate"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-invoice-date"
            >
              {{ fieldErrors.invoiceDate }}
            </Message>
          </div>
          <div v-else class="field">
            <span class="field-label">Invoice Date</span>
            <p data-testid="draft-date-hint" class="muted draft-date-hint">
              Invoice date is set on activation
            </p>
          </div>
        </div>

        <LineItemsEditor
          v-model="inputs.lineItems"
          v-model:invalid="hasInvalidPrices"
          :error="fieldErrors.lineItems"
        />

        <div class="totals">
          <div class="field">
            <label for="vat">VAT</label>
            <Select
              v-model="inputs.vat"
              input-id="vat"
              :options="VAT_OPTIONS"
              option-label="label"
              option-value="value"
              fluid
            />
          </div>
          <div class="field">
            <label for="direct-debit">Payment Method</label>
            <div class="row gap-sm">
              <ToggleSwitch v-model="inputs.directDebit" input-id="direct-debit" />
              <span>{{ inputs.directDebit ? 'Direct Debit' : 'Bank Transfer' }}</span>
            </div>
          </div>
          <div class="field">
            <span class="field-label">Gross Amount</span>
            <p data-testid="gross" class="gross">{{ formatCents(grossCents) }}</p>
          </div>
        </div>
      </FormSection>

      <FormSection title="Email">
        <div class="grid-2">
          <div class="field">
            <label for="email">Email</label>
            <InputText id="email" v-model="inputs.email" type="email" fluid />
          </div>
          <div class="field">
            <label for="email-salutation">Email Salutation</label>
            <InputText id="email-salutation" v-model="inputs.emailSalutation" fluid />
          </div>
        </div>
      </FormSection>

      <div class="form-actions">
        <Button
          v-if="isDraft && draftLoaded"
          label="Delete Draft"
          icon="pi pi-trash"
          text
          severity="danger"
          :disabled="sending"
          data-testid="delete-draft"
          class="form-actions__delete"
          @click="deleteDraft"
        />
        <Button label="Cancel" text severity="secondary" @click="router.back()" />
        <Button
          v-if="!isNewRevision && (!isDraft || draftLoaded)"
          :type="isDraft ? 'submit' : 'button'"
          :label="isDraft ? 'Save Draft' : 'Save as Draft'"
          severity="secondary"
          outlined
          :disabled="sending || !!loadError"
          data-testid="save-draft"
          @click="!isDraft && onSaveDraft()"
        />
        <Button
          v-if="isDraft && draftLoaded"
          :label="sending ? 'Activating…' : 'Activate'"
          :disabled="sending || !!loadError"
          data-testid="activate-draft"
          @click="activateDraft"
        />
        <Button
          v-if="!isDraft"
          type="submit"
          :label="
            sending
              ? isNewRevision
                ? 'Saving revision…'
                : 'Generating…'
              : isNewRevision
                ? 'Save Revision'
                : 'Create Invoice'
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

.hint-message {
  margin-bottom: 1rem;
}

.recipient-search__row {
  flex-wrap: nowrap;
}

.recipient-search__row > :first-child {
  flex: 1;
  min-width: 0;
}

.recipient-search {
  margin-bottom: 1rem;
}

.hint {
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
}

.draft-date-hint {
  margin: 0.5rem 0 0;
}

.totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

@media (max-width: 767px) {
  .totals {
    grid-template-columns: 1fr;
  }
}

.gross {
  margin: 0;
  padding: 0.5rem 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.form-actions__delete {
  margin-right: auto;
}
</style>
