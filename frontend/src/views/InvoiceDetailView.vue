<script setup lang="ts">
import Accordion from 'primevue/accordion';
import AccordionContent from 'primevue/accordioncontent';
import AccordionHeader from 'primevue/accordionheader';
import AccordionPanel from 'primevue/accordionpanel';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import type { InvoiceDto, InvoiceRevisionDto } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusTag from '../components/ui/StatusTag.vue';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import { formatCents, formatDate, formatDateTime } from '../utils/format';
import {
  documentStatusTag,
  emailStatusTag,
  pdfStatusTag,
  revisionStatusTag,
} from '../utils/statusTags';

const route = useRoute();
const router = useRouter();
const notify = useNotify();
const { confirmAction } = useConfirmAction();

const id = Number(route.params.id);

const invoice = ref<InvoiceDto | null>(null);
const loading = ref(false);
const loadError = ref('');
const openPanels = ref<number[]>([]);
const busy = ref<Record<string, boolean>>({});
const techOpen = ref<Record<number, boolean>>({});

const isActive = computed(() => invoice.value?.status === 'AKTIV');
const title = computed(() => (invoice.value ? `Invoice ${invoice.value.number}` : 'Invoice'));

async function loadData() {
  loading.value = invoice.value === null;
  try {
    const res = await fetch(`/api/invoice/${id}`);
    if (!res.ok) {
      loadError.value = 'Invoice could not be loaded';
      return;
    }
    invoice.value = (await res.json()) as InvoiceDto;
    if (openPanels.value.length === 0 && invoice.value.revisions.length > 0) {
      openPanels.value = [invoice.value.revisions[0].id];
    }
  } catch {
    loadError.value = 'Network error';
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

function grossCents(rev: InvoiceRevisionDto): number {
  const net = rev.inputs.lineItems.reduce((sum, p) => sum + p.priceInCents, 0);
  return net + Math.round(net * (rev.inputs.vat / 100));
}

function isLatest(rev: InvoiceRevisionDto): boolean {
  return invoice.value?.revisions[0]?.id === rev.id;
}

/** Runs one request per button with a busy flag; returns the parsed body on success. */
async function run(
  key: string,
  request: () => Promise<Response>,
  errorText: (body: Record<string, string>) => string,
) {
  busy.value = { ...busy.value, [key]: true };
  try {
    const res = await request();
    const body = (await res.json().catch(() => ({}))) as Record<string, string>;
    if (!res.ok) {
      notify.error(errorText(body));
      return false;
    }
    return true;
  } catch {
    notify.error('Network error');
    return false;
  } finally {
    busy.value = { ...busy.value, [key]: false };
  }
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

async function retryPdf(rev: InvoiceRevisionDto) {
  const ok = await run(
    `retry-${rev.id}`,
    () => fetch(`/api/invoice/revision/${rev.id}/retry-pdf`, { method: 'POST' }),
    (body) => body.error || 'Error on retry',
  );
  if (ok) {
    notify.success('PDF generated successfully');
    await loadData();
  }
}

async function sendEmail(rev: InvoiceRevisionDto) {
  const confirmed = await confirmAction({
    message:
      'Send this invoice to the real recipient now? This action sends the email to the recipient address.',
    header: 'Send invoice',
    acceptLabel: 'Send email',
  });
  if (!confirmed) return;
  const ok = await run(
    `email-${rev.id}`,
    () => fetch(`/api/invoice/revision/${rev.id}/send-email`, { method: 'POST' }),
    (body) => body.emailError || 'Error sending email',
  );
  if (ok) {
    notify.success('Email sent successfully');
    await loadData();
  }
}

async function sendTestEmail(rev: InvoiceRevisionDto) {
  const ok = await run(
    `test-${rev.id}`,
    () => fetch(`/api/invoice/revision/${rev.id}/send-test-email`, { method: 'POST' }),
    (body) => body.emailError || 'Error sending test email',
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

                <Message v-if="rev.pdfStatus === 'FAILED'" severity="warn">
                  <div class="stack gap-sm">
                    <span>{{
                      rev.pdfError || 'PDF could not be generated. Please try again.'
                    }}</span>
                    <Button
                      v-if="rev.pdfTechError"
                      :label="techOpen[rev.id] ? 'Hide Details' : 'Show Details'"
                      size="small"
                      text
                      @click="techOpen[rev.id] = !techOpen[rev.id]"
                    />
                    <pre v-if="rev.pdfTechError && techOpen[rev.id]" class="tech-error">{{
                      rev.pdfTechError
                    }}</pre>
                  </div>
                </Message>

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
                    data-testid="send-email"
                    @click="sendEmail(rev)"
                  />
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
.section-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 1rem;
  margin: 0;
}

.facts--grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 767px) {
  .facts--grid {
    grid-template-columns: 1fr;
  }
}

.facts dt {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.facts dd {
  margin: 0.25rem 0 0;
}

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

.tech-error {
  white-space: pre-wrap;
  font-size: 0.75rem;
  margin: 0;
}

.error-text {
  color: var(--p-red-500);
}
</style>
