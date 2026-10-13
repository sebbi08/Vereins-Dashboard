<script setup lang="ts">
import Accordion from 'primevue/accordion';
import AccordionContent from 'primevue/accordioncontent';
import AccordionHeader from 'primevue/accordionheader';
import AccordionPanel from 'primevue/accordionpanel';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import {
  calculateInvoiceTotals,
  type InvoiceDto,
  type InvoiceEmailText,
  type InvoiceRevisionDto,
} from 'shared';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import InvoiceEmailTextEditor from '../components/InvoiceEmailText.vue';
import PdfFailureNotice from '../components/PdfFailureNotice.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusTag from '../components/ui/StatusTag.vue';
import { useActionRunner } from '../composables/useActionRunner';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { formatCents, formatDate, formatDateTime } from '../utils/format';
import {
  documentStatusTag,
  emailStatusTag,
  paymentStatusTag,
  pdfStatusTag,
  revisionStatusTag,
} from '../utils/statusTags';

const route = useRoute();
const router = useRouter();
const notify = useNotify();
const { confirmAction } = useConfirmAction();
const { busy, run, runWithBody } = useActionRunner();

const id = Number(route.params.id);

const invoice = ref<InvoiceDto | null>(null);
const loading = ref(false);
const loadError = ref('');
const openPanels = ref<number[]>([]);

const emailText = ref<InvoiceEmailText>({ emailSubject: '', emailBody: '' });
const savedEmailText = ref<InvoiceEmailText>({ emailSubject: '', emailBody: '' });
const emailTextInvalid = ref(false);
const emailTextDirty = computed(
  () =>
    emailText.value.emailSubject !== savedEmailText.value.emailSubject ||
    emailText.value.emailBody !== savedEmailText.value.emailBody,
);
useUnsavedChangesGuard(() => emailTextDirty.value);

/** What "Reset from template" builds the text from: the revision that would be sent. */
const emailTextSource = computed(
  () =>
    invoice.value?.activeRevision?.inputs ??
    invoice.value?.revisions[0]?.inputs ?? { emailSalutation: '', name: '', title: '', email: '' },
);

const isActive = computed(() => invoice.value?.status === 'AKTIV');
const title = computed(() => (invoice.value ? `Invoice ${invoice.value.number}` : 'Invoice'));

/** A failed first load replaces the page; a failed reload keeps the loaded invoice and toasts. */
function reportLoadFailure(message: string) {
  if (invoice.value) notify.error(message);
  else loadError.value = message;
}

/** Counts started and finished saves, so a load can tell a save happened while it was running. */
let emailTextSaves = 0;

async function loadData() {
  const savesAtStart = emailTextSaves;
  loading.value = invoice.value === null;
  loadError.value = '';
  try {
    const res = await fetch(`/api/invoice/${id}`);
    if (!res.ok) {
      reportLoadFailure('Invoice could not be loaded');
      return;
    }
    invoice.value = (await res.json()) as InvoiceDto;
    // The page reloads itself while a PDF is pending: never overwrite a text being edited
    // A cancelled invoice cannot be edited: its stored text always wins
    const settled =
      !emailTextDirty.value && !busy.value['email-text'] && savesAtStart === emailTextSaves;
    if (invoice.value.status !== 'AKTIV' || settled) {
      const loaded = {
        emailSubject: invoice.value.emailSubject,
        emailBody: invoice.value.emailBody,
      };
      emailText.value = { ...loaded };
      savedEmailText.value = loaded;
    }
    if (openPanels.value.length === 0 && invoice.value.revisions.length > 0) {
      openPanels.value = [invoice.value.revisions[0].id];
    }
  } catch {
    reportLoadFailure('Network error');
  } finally {
    loading.value = false;
    schedulePdfPoll();
  }
}

// Invoice PDFs are generated in the background: while one is pending, reload until it is done,
// so Download and Send appear without a manual page reload.
const PDF_POLL_INTERVAL_MS = 2000;
const PDF_POLL_MAX = 90; // about three minutes
let pdfPollTimer: ReturnType<typeof setTimeout> | null = null;
let pdfPolls = 0;
let unmounted = false;

function schedulePdfPoll() {
  if (pdfPollTimer) clearTimeout(pdfPollTimer);
  pdfPollTimer = null;
  const pending = invoice.value?.revisions.some((r) => r.pdfStatus === 'PENDING') ?? false;
  if (unmounted || !pending || pdfPolls >= PDF_POLL_MAX) return;
  pdfPollTimer = setTimeout(() => {
    pdfPolls++;
    void loadData();
  }, PDF_POLL_INTERVAL_MS);
}

onMounted(loadData);
onBeforeUnmount(() => {
  unmounted = true;
  if (pdfPollTimer) clearTimeout(pdfPollTimer);
});

function grossCents(rev: InvoiceRevisionDto): number {
  return calculateInvoiceTotals(rev.inputs.lineItems, rev.inputs.vat).grossCents;
}

function isLatest(rev: InvoiceRevisionDto): boolean {
  return invoice.value?.revisions[0]?.id === rev.id;
}

async function cancel() {
  if (!invoice.value) return;
  const confirmed = await confirmAction({
    message: `Cancel invoice ${invoice.value.number}? This cannot be undone.`,
    header: 'Cancel invoice',
    acceptLabel: 'Cancel invoice',
    rejectLabel: 'Keep invoice',
    danger: true,
  });
  if (!confirmed) return;
  const ok = await run(
    'cancel',
    () => fetch(`/api/invoice/${id}/cancel`, { method: 'PATCH' }),
    (body) => body.error || 'Error cancelling',
  );
  if (ok) {
    notify.success('Invoice cancelled');
    await loadData();
  }
}

const paymentTag = computed(() =>
  invoice.value ? paymentStatusTag(invoice.value.paid, invoice.value.status) : null,
);

async function setPaid(paid: boolean) {
  if (!invoice.value) return;
  const confirmed = await confirmAction({
    message: paid
      ? `Mark invoice ${invoice.value.number} as paid?`
      : `Mark invoice ${invoice.value.number} as unpaid?`,
    header: paid ? 'Mark as paid' : 'Mark as unpaid',
    acceptLabel: paid ? 'Mark as paid' : 'Mark as unpaid',
  });
  if (!confirmed) return;
  const ok = await run(
    'paid',
    () =>
      fetch(`/api/invoice/${id}/paid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid }),
      }),
    (body) => body.error || 'Error saving the payment state',
  );
  if (ok) {
    notify.success(paid ? 'Invoice marked as paid' : 'Invoice marked as unpaid');
    await loadData();
  }
}

async function retryPdf(rev: InvoiceRevisionDto) {
  const { ok, body: result } = await runWithBody(
    `retry-${rev.id}`,
    () => fetch(`/api/invoice/revision/${rev.id}/retry-pdf`, { method: 'POST' }),
    (body) => body.error || 'Error on retry',
  );
  if (ok) {
    if (result.pdfStatus === 'FAILED') {
      notify.warn(
        (result.pdfError as string | null) || 'PDF could not be generated. Please try again.',
      );
    } else {
      notify.success('PDF generated successfully');
    }
    await loadData();
  }
}

async function saveEmailText() {
  emailTextSaves++;
  const text = { ...emailText.value };
  const ok = await run(
    'email-text',
    () =>
      fetch(`/api/invoice/${id}/email-text`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(text),
      }),
    (body) => body.error || 'Error saving the email text',
  );
  if (ok) {
    emailTextSaves++;
    savedEmailText.value = text;
    notify.success('Email text saved');
  } else {
    // The invoice may have been cancelled elsewhere; an active one keeps the edits (still dirty)
    await loadData();
  }
}

async function sendEmail(rev: InvoiceRevisionDto) {
  if (emailTextDirty.value) return;
  const confirmed = await confirmAction({
    message: `Send invoice ${invoice.value?.number} to ${rev.inputs.email.trim()}?`,
    header: 'Send invoice',
    acceptLabel: 'Send email',
  });
  if (!confirmed || emailTextDirty.value) return;
  const ok = await run(
    `email-${rev.id}`,
    () => fetch(`/api/invoice/revision/${rev.id}/send-email`, { method: 'POST' }),
    (body) => body.emailError || body.error || 'Error sending email',
  );
  if (ok) notify.success('Email sent successfully');
  // A failed send is persisted as FAILED on the revision, so reload either way
  await loadData();
}

async function sendTestEmail(rev: InvoiceRevisionDto) {
  if (emailTextDirty.value) return;
  const ok = await run(
    `test-${rev.id}`,
    () => fetch(`/api/invoice/revision/${rev.id}/send-test-email`, { method: 'POST' }),
    (body) => body.emailError || body.error || 'Error sending test email',
  );
  if (ok) {
    notify.success('Test email sent to configured test address');
    await loadData();
  }
}

function downloadPdf(rev: InvoiceRevisionDto) {
  window.open(`/api/invoice/revision/${rev.id}/download`, '_blank');
}
</script>

<template>
  <div class="page">
    <PageHeader :title="title">
      <template #actions>
        <Button
          label="Back"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          @click="router.push('/invoice')"
        />
        <template v-if="invoice">
          <Button
            v-if="isActive"
            label="New Revision"
            icon="pi pi-pencil"
            data-testid="new-revision"
            @click="router.push(`/invoice/${id}/revision`)"
          />
          <Button
            label="Duplicate"
            icon="pi pi-copy"
            severity="secondary"
            outlined
            data-testid="duplicate"
            @click="router.push(`/invoice/new?copyFrom=${id}`)"
          />
          <Button
            v-if="isActive && !invoice.paid"
            label="Mark as paid"
            icon="pi pi-check-circle"
            severity="success"
            outlined
            :loading="busy.paid"
            data-testid="mark-paid"
            @click="setPaid(true)"
          />
          <Button
            v-if="invoice.paid"
            label="Mark as unpaid"
            icon="pi pi-undo"
            severity="secondary"
            outlined
            :loading="busy.paid"
            data-testid="mark-unpaid"
            @click="setPaid(false)"
          />
          <Button
            v-if="isActive"
            label="Cancel invoice"
            icon="pi pi-ban"
            severity="danger"
            outlined
            :loading="busy.cancel"
            data-testid="cancel-invoice"
            @click="cancel"
          />
        </template>
      </template>
    </PageHeader>

    <p v-if="loading" class="muted">Loading…</p>
    <Message v-else-if="loadError" severity="error" data-testid="load-error">
      {{ loadError }}
    </Message>

    <div v-else-if="invoice" class="stack gap-lg">
      <Card>
        <template #content>
          <dl class="facts">
            <div>
              <dt>Status</dt>
              <dd>
                <StatusTag :tag="documentStatusTag(invoice.status)" data-testid="invoice-status" />
              </dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>
                <StatusTag v-if="paymentTag" :tag="paymentTag" data-testid="payment-status" />
                <span v-else data-testid="payment-status">—</span>
              </dd>
            </div>
            <div>
              <dt>Invoice Date</dt>
              <dd>{{ formatDate(invoice.invoiceDate) }}</dd>
            </div>
            <div>
              <dt>Created at</dt>
              <dd>{{ formatDateTime(invoice.createdAt) }}</dd>
            </div>
            <div>
              <dt>Recipient</dt>
              <dd>{{ invoice.recipient.name }}</dd>
            </div>
          </dl>
        </template>
      </Card>

      <section class="stack gap-sm">
        <h3 class="section-title">Email</h3>
        <Card>
          <template #content>
            <div class="stack">
              <InvoiceEmailTextEditor
                v-model:subject="emailText.emailSubject"
                v-model:body="emailText.emailBody"
                v-model:invalid="emailTextInvalid"
                :source="emailTextSource"
                :disabled="!isActive"
              />
              <div v-if="isActive" class="row">
                <Button
                  label="Save"
                  icon="pi pi-save"
                  :disabled="!emailTextDirty || emailTextInvalid"
                  :loading="busy['email-text']"
                  data-testid="save-email-text"
                  @click="saveEmailText"
                />
              </div>
            </div>
          </template>
        </Card>
      </section>

      <section class="stack gap-sm">
        <h3 class="section-title">Revisions</h3>
        <p v-if="invoice.revisions.length === 0" class="muted">No revisions available</p>
        <Accordion v-else v-model:value="openPanels" multiple lazy>
          <AccordionPanel v-for="rev in invoice.revisions" :key="rev.id" :value="rev.id">
            <AccordionHeader>
              <span class="rev-header">
                <span class="rev-header__title">Revision {{ rev.revisionNumber }}</span>
                <StatusTag :tag="pdfStatusTag(rev.pdfStatus)" />
                <StatusTag :tag="revisionStatusTag(rev.status)" />
                <span class="muted rev-header__date">{{ formatDateTime(rev.createdAt) }}</span>
              </span>
            </AccordionHeader>
            <AccordionContent>
              <div class="stack">
                <dl class="facts facts--grid">
                  <div>
                    <dt>Recipient</dt>
                    <dd>{{ rev.inputs.name }}, {{ rev.inputs.street }}, {{ rev.inputs.city }}</dd>
                  </div>
                  <div>
                    <dt>Title</dt>
                    <dd>{{ rev.inputs.title }}</dd>
                  </div>
                  <div>
                    <dt>Salutation</dt>
                    <dd>{{ rev.inputs.salutation || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{{ rev.inputs.email || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Email Salutation</dt>
                    <dd>{{ rev.inputs.emailSalutation || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Invoice Date</dt>
                    <dd>{{ formatDate(rev.inputs.invoiceDate) }}</dd>
                  </div>
                  <div>
                    <dt>VAT</dt>
                    <dd>{{ rev.inputs.vat }}%</dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
                    <dd>{{ rev.inputs.directDebit ? 'Direct Debit' : 'Bank Transfer' }}</dd>
                  </div>
                  <div>
                    <dt>Amount (Gross)</dt>
                    <dd class="strong">{{ formatCents(grossCents(rev)) }}</dd>
                  </div>
                </dl>

                <PdfFailureNotice
                  v-if="rev.pdfStatus === 'FAILED'"
                  :error="rev.pdfError"
                  :tech-error="rev.pdfTechError"
                />

                <div class="line-items">
                  <p class="muted line-items__label">Line Items</p>
                  <div
                    v-for="(pos, idx) in rev.inputs.lineItems"
                    :key="idx"
                    class="line-items__row"
                  >
                    <span
                      data-testid="line-item-text"
                      class="line-items__text"
                      v-text="pos.text"
                    ></span>
                    <span class="line-items__price">{{ formatCents(pos.priceInCents) }}</span>
                  </div>
                </div>

                <div class="row gap-sm">
                  <Button
                    v-if="rev.pdfStatus === 'OK'"
                    label="Download PDF"
                    icon="pi pi-file-pdf"
                    size="small"
                    outlined
                    data-testid="download-pdf"
                    @click="downloadPdf(rev)"
                  />
                  <Button
                    v-if="rev.pdfStatus === 'FAILED' && rev.status === 'AKTIV'"
                    label="Regenerate PDF"
                    icon="pi pi-refresh"
                    size="small"
                    severity="warn"
                    outlined
                    :loading="busy[`retry-${rev.id}`]"
                    data-testid="retry-pdf"
                    @click="retryPdf(rev)"
                  />
                  <Button
                    v-if="rev.pdfStatus === 'OK' && isActive && isLatest(rev)"
                    label="Send Test Email"
                    icon="pi pi-send"
                    size="small"
                    severity="secondary"
                    outlined
                    :loading="busy[`test-${rev.id}`]"
                    :disabled="emailTextDirty || emailTextInvalid"
                    data-testid="send-test-email"
                    @click="sendTestEmail(rev)"
                  />
                  <Button
                    v-if="
                      rev.pdfStatus === 'OK' &&
                      isActive &&
                      rev.emailStatus !== 'SENT' &&
                      isLatest(rev)
                    "
                    label="Send via Email"
                    icon="pi pi-envelope"
                    size="small"
                    :loading="busy[`email-${rev.id}`]"
                    :disabled="!rev.inputs.email.trim() || emailTextDirty || emailTextInvalid"
                    data-testid="send-email"
                    @click="sendEmail(rev)"
                  />
                  <small
                    v-if="
                      rev.pdfStatus === 'OK' &&
                      isActive &&
                      rev.emailStatus !== 'SENT' &&
                      isLatest(rev) &&
                      !rev.inputs.email.trim()
                    "
                    class="muted"
                    data-testid="no-email-hint"
                  >
                    No email address on this invoice
                  </small>
                  <small
                    v-if="emailTextDirty && rev.pdfStatus === 'OK' && isActive && isLatest(rev)"
                    class="muted"
                    data-testid="save-email-text-hint"
                  >
                    Save the email text first
                  </small>
                  <StatusTag
                    v-if="rev.emailStatus !== 'NOT_SENT'"
                    :tag="emailStatusTag(rev.emailStatus)"
                  />
                  <small v-if="rev.emailStatus === 'FAILED' && rev.emailError" class="error-text">
                    {{ rev.emailError }}
                  </small>
                </div>
              </div>
            </AccordionContent>
          </AccordionPanel>
        </Accordion>
      </section>
    </div>
  </div>
</template>

<style scoped>
.strong {
  font-weight: 600;
}

.rev-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.rev-header__title {
  font-weight: 600;
}

.rev-header__date {
  font-size: 0.8125rem;
}

.line-items {
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
  padding: 0.75rem;
}

.line-items__label {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
}

.line-items__row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.25rem 0;
}

.line-items__row + .line-items__row {
  border-top: 1px solid var(--p-content-border-color);
}

.line-items__text {
  white-space: pre-line;
}

.line-items__price {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.error-text {
  color: var(--p-red-500);
}
</style>
