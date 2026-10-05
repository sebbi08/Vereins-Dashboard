<script setup lang="ts">
import Accordion from 'primevue/accordion';
import AccordionContent from 'primevue/accordioncontent';
import AccordionHeader from 'primevue/accordionheader';
import AccordionPanel from 'primevue/accordionpanel';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import type { DonationReceiptDto, DonationReceiptRevisionDto } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PdfFailureNotice from '../components/PdfFailureNotice.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusTag from '../components/ui/StatusTag.vue';
import { useActionRunner } from '../composables/useActionRunner';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import { formatCents, formatDate, formatDateTime } from '../utils/format';
import { documentStatusTag, pdfStatusTag, revisionStatusTag } from '../utils/statusTags';

const route = useRoute();
const router = useRouter();
const notify = useNotify();
const { confirmAction } = useConfirmAction();
const { busy, run, runWithBody } = useActionRunner();

const id = Number(route.params.id);

const receipt = ref<DonationReceiptDto | null>(null);
const loading = ref(false);
const loadError = ref('');
const openPanels = ref<number[]>([]);

const isActive = computed(() => receipt.value?.status === 'AKTIV');
const revisions = computed(() => receipt.value?.revisions ?? []);
const title = computed(() => (receipt.value ? `Receipt ${receipt.value.number}` : 'Receipt'));

/** A failed first load replaces the page; a failed reload keeps the loaded receipt and toasts. */
function reportLoadFailure(message: string) {
  if (receipt.value) notify.error(message);
  else loadError.value = message;
}

async function loadData() {
  loading.value = receipt.value === null;
  loadError.value = '';
  try {
    const res = await fetch(`/api/donation-receipt/${id}`);
    if (!res.ok) {
      reportLoadFailure('Receipt could not be loaded');
      return;
    }
    receipt.value = (await res.json()) as DonationReceiptDto;
    const newest = receipt.value.revisions?.[0];
    if (openPanels.value.length === 0 && newest) openPanels.value = [newest.id];
  } catch {
    reportLoadFailure('Network error');
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

async function cancel() {
  if (!receipt.value) return;
  const confirmed = await confirmAction({
    message: `Cancel receipt ${receipt.value.number}? This cannot be undone.`,
    header: 'Cancel receipt',
    acceptLabel: 'Cancel receipt',
    rejectLabel: 'Keep receipt',
    danger: true,
  });
  if (!confirmed) return;
  const ok = await run(
    'cancel',
    () => fetch(`/api/donation-receipt/${id}/cancel`, { method: 'PATCH' }),
    (body) => body.error || 'Error cancelling',
  );
  if (ok) {
    notify.success('Receipt cancelled');
    await loadData();
  }
}

async function retryPdf(rev: DonationReceiptRevisionDto) {
  const { ok, body: result } = await runWithBody(
    `retry-${rev.id}`,
    () => fetch(`/api/donation-receipt/revision/${rev.id}/retry-pdf`, { method: 'POST' }),
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

function downloadPdf(rev: DonationReceiptRevisionDto) {
  window.open(`/api/donation-receipt/revision/${rev.id}/download`, '_blank');
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
          @click="router.push('/donation-receipt')"
        />
        <template v-if="receipt">
          <Button
            v-if="isActive"
            label="New Revision"
            icon="pi pi-pencil"
            data-testid="new-revision"
            @click="router.push(`/donation-receipt/${id}/revision`)"
          />
          <Button
            label="Duplicate"
            icon="pi pi-copy"
            severity="secondary"
            outlined
            data-testid="duplicate"
            @click="router.push(`/donation-receipt/new?copyFrom=${id}`)"
          />
          <Button
            v-if="isActive"
            label="Cancel receipt"
            icon="pi pi-ban"
            severity="danger"
            outlined
            :loading="busy.cancel"
            data-testid="cancel-receipt"
            @click="cancel"
          />
        </template>
      </template>
    </PageHeader>

    <p v-if="loading" class="muted">Loading…</p>
    <Message v-else-if="loadError" severity="error" data-testid="load-error">
      {{ loadError }}
    </Message>

    <div v-else-if="receipt" class="stack gap-lg">
      <Card>
        <template #content>
          <dl class="facts">
            <div>
              <dt>Status</dt>
              <dd>
                <StatusTag :tag="documentStatusTag(receipt.status)" data-testid="receipt-status" />
              </dd>
            </div>
            <div>
              <dt>Donation Date</dt>
              <dd>{{ formatDate(receipt.donationDate) }}</dd>
            </div>
            <div>
              <dt>Created at</dt>
              <dd>{{ formatDateTime(receipt.createdAt) }}</dd>
            </div>
            <div>
              <dt>Donor</dt>
              <dd>{{ receipt.donor.name }}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{{ receipt.donor.street }}, {{ receipt.donor.city }}</dd>
            </div>
          </dl>
        </template>
      </Card>

      <section class="stack gap-sm">
        <h3 class="section-title">Revisions</h3>
        <p v-if="revisions.length === 0" class="muted">No revisions available</p>
        <Accordion v-else v-model:value="openPanels" multiple lazy>
          <AccordionPanel v-for="rev in revisions" :key="rev.id" :value="rev.id">
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
                <dl class="facts facts--grid" data-testid="revision-facts">
                  <div>
                    <dt>Donor</dt>
                    <dd>{{ rev.inputs.name }}, {{ rev.inputs.street }}, {{ rev.inputs.city }}</dd>
                  </div>
                  <div>
                    <dt>Letter Salutation</dt>
                    <dd>{{ rev.inputs.letterSalutation || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Address Salutation</dt>
                    <dd>{{ rev.inputs.addressSalutation || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd class="strong">{{ formatCents(rev.inputs.donationAmountCents) }}</dd>
                  </div>
                  <div>
                    <dt>Donation Date</dt>
                    <dd>{{ formatDate(rev.inputs.donationDate) }}</dd>
                  </div>
                  <div>
                    <dt>With Cover Letter</dt>
                    <dd>{{ rev.inputs.withCoverLetter ? 'Yes' : 'No' }}</dd>
                  </div>
                  <div>
                    <dt>Treasurer</dt>
                    <dd>{{ rev.inputs.treasurer || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Charitable Purpose</dt>
                    <dd>{{ rev.inputs.charitablePurpose || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Tax Office</dt>
                    <dd>{{ rev.inputs.taxOfficeName || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Tax Number</dt>
                    <dd>{{ rev.inputs.taxNumber || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Exemption Date</dt>
                    <dd>
                      {{ rev.inputs.exemptionDate ? formatDate(rev.inputs.exemptionDate) : '—' }}
                    </dd>
                  </div>
                  <div>
                    <dt>Assessment Period</dt>
                    <dd>{{ rev.inputs.assessmentPeriod || '—' }}</dd>
                  </div>
                </dl>

                <PdfFailureNotice
                  v-if="rev.pdfStatus === 'FAILED'"
                  :error="rev.pdfError"
                  :tech-error="rev.pdfTechError"
                />

                <div class="row gap-sm">
                  <Button
                    v-if="rev.pdfStatus === 'OK' && rev.filePath"
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
</style>
