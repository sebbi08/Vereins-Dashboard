<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import {
  calculateInstructorRent,
  DEFAULT_WEEKS_PER_MONTH,
  type InstructorDto,
  type InstructorRentInputs,
  type InstructorSettingsDto,
  type TimeBlock,
  validateInstructorRent,
} from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import RecipientPicker from '../components/RecipientPicker.vue';
import DecimalInput from '../components/ui/DecimalInput.vue';
import FormSection from '../components/ui/FormSection.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import WeeklySchedule from '../components/WeeklySchedule.vue';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import { useAppStore } from '../stores/app';
import { formatCents, formatHours } from '../utils/format';
import {
  emptyRecipient,
  fromRecipientDto,
  type RecipientFormValue,
  toRecipientData,
} from '../utils/recipientForm';

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const notify = useNotify();
const { confirmAction } = useConfirmAction();

const instructorId = route.params.id ? Number(route.params.id) : null;
const isEdit = instructorId !== null;

const recipient = ref<RecipientFormValue>(emptyRecipient());
const hourlyRateCents = ref(0);
const months = ref<number | null>(1);
const timeBlocks = ref<TimeBlock[]>([]);
const weeksPerMonth = ref(DEFAULT_WEEKS_PER_MONTH);

const loadError = ref('');
const saving = ref(false);
const savedSnapshot = ref('');

const hourlyRateEuros = computed<number | null>({
  get: () => (hourlyRateCents.value > 0 ? hourlyRateCents.value / 100 : null),
  set: (euros) => {
    hourlyRateCents.value = euros === null ? 0 : Math.round(euros * 100);
  },
});

const rentInputs = computed<InstructorRentInputs>(() => ({
  hourlyRateCents: hourlyRateCents.value,
  months: months.value ?? 0,
  timeBlocks: timeBlocks.value,
}));
const issues = computed(() => validateInstructorRent(rentInputs.value));
const recipientError = computed(() =>
  recipient.value.name.trim() ? '' : 'Recipient name is required',
);
const result = computed(() =>
  issues.value.length === 0 ? calculateInstructorRent(rentInputs.value, weeksPerMonth.value) : null,
);
const canSave = computed(
  () => issues.value.length === 0 && !recipientError.value && !saving.value && !loadError.value,
);

const pageTitle = isEdit ? 'Edit instructor' : 'New instructor';
const summaryTitle = computed(
  () => `Summary (net, ${String(weeksPerMonth.value).replace('.', ',')} weeks/month)`,
);

function fieldIssue(path: string): string {
  return issues.value.find((issue) => issue.path === path)?.message ?? '';
}

function snapshot(): string {
  return JSON.stringify([recipient.value, hourlyRateCents.value, months.value, timeBlocks.value]);
}
const isDirty = computed(() => snapshot() !== savedSnapshot.value);
const createInvoiceBlockedReason = computed(() => {
  if (loadError.value) return 'Instructor could not be loaded';
  if (isDirty.value) return 'Save your changes first';
  if (store.invoiceTemplateAvailable === false) return 'No active invoice template';
  return '';
});

async function loadSettings() {
  // Informational only: on any failure the summary keeps the default weeks per month
  try {
    const res = await fetch('/api/instructor/settings');
    if (res.ok) weeksPerMonth.value = ((await res.json()) as InstructorSettingsDto).weeksPerMonth;
  } catch {
    // keep DEFAULT_WEEKS_PER_MONTH
  }
}

async function loadInstructor(id: number) {
  const res = await fetch(`/api/instructor/${id}`);
  if (!res.ok) {
    loadError.value = 'Instructor not found';
    return;
  }
  const dto = (await res.json()) as InstructorDto;
  recipient.value = fromRecipientDto(dto.recipient);
  hourlyRateCents.value = dto.hourlyRateCents;
  months.value = dto.months;
  timeBlocks.value = dto.timeBlocks;
  savedSnapshot.value = snapshot();
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const body = {
      ...(recipient.value.id !== null && { recipientId: recipient.value.id }),
      recipientData: toRecipientData(recipient.value),
      ...rentInputs.value,
    };
    const res = await fetch(isEdit ? `/api/instructor/${instructorId}` : '/api/instructor', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const result = (await res.json().catch(() => ({}))) as { error?: string };
      notify.error(result.error ?? 'Saving failed');
      return;
    }
    notify.success('Instructor saved');
    router.push('/instructor');
  } catch {
    notify.error('Saving failed');
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!isEdit) return;
  const confirmed = await confirmAction({
    message: 'Delete this instructor? The recipient is kept.',
    header: 'Delete instructor',
    acceptLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) return;
  try {
    const res = await fetch(`/api/instructor/${instructorId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    notify.success('Instructor deleted');
    router.push('/instructor');
  } catch {
    notify.error('Deleting failed');
  }
}

function createInvoice() {
  router.push(`/invoice/new?fromInstructor=${instructorId}`);
}

onMounted(async () => {
  try {
    await Promise.all([
      loadSettings(),
      instructorId !== null ? loadInstructor(instructorId) : Promise.resolve(),
      store.invoiceTemplateAvailable === null ? store.checkTemplates() : Promise.resolve(),
    ]);
  } catch {
    loadError.value = 'Network error while loading';
  }
});
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
          @click="router.push('/instructor')"
        />
      </template>
    </PageHeader>

    <Message v-if="loadError" severity="error" data-testid="load-error" class="load-error">
      {{ loadError }}
    </Message>

    <form @submit.prevent="save">
      <FormSection title="Recipient">
        <RecipientPicker v-model="recipient" />
        <Message
          v-if="recipientError"
          severity="error"
          size="small"
          variant="simple"
          data-testid="recipient-error"
          class="recipient-error"
        >
          {{ recipientError }}
        </Message>
      </FormSection>

      <FormSection title="Rent">
        <div class="grid-2">
          <div class="field">
            <label for="hourly-rate">Hourly rate (net)</label>
            <DecimalInput
              v-model="hourlyRateEuros"
              input-id="hourly-rate"
              data-testid="hourly-rate"
              :min-fraction-digits="2"
              suffix="€"
              placeholder="12,50"
              :invalid="!!fieldIssue('hourlyRateCents')"
            />
            <Message
              v-if="fieldIssue('hourlyRateCents')"
              severity="error"
              size="small"
              variant="simple"
              data-testid="hourly-rate-error"
            >
              {{ fieldIssue('hourlyRateCents') }}
            </Message>
          </div>
          <div class="field">
            <label for="months">Months</label>
            <DecimalInput
              v-model="months"
              input-id="months"
              data-testid="months"
              :max-fraction-digits="0"
              :invalid="!!fieldIssue('months')"
            />
            <Message
              v-if="fieldIssue('months')"
              severity="error"
              size="small"
              variant="simple"
              data-testid="months-error"
            >
              {{ fieldIssue('months') }}
            </Message>
          </div>
        </div>
      </FormSection>

      <FormSection title="Weekly schedule">
        <WeeklySchedule v-model="timeBlocks" :issues="issues" />
      </FormSection>

      <FormSection :title="summaryTitle">
        <dl class="facts">
          <div>
            <dt>Hours per week</dt>
            <dd data-testid="summary-hours" class="strong">
              {{ result ? `${formatHours(result.netMinutesPerWeek)} h` : '—' }}
            </dd>
          </div>
          <div>
            <dt>Per month</dt>
            <dd data-testid="summary-monthly" class="strong">
              {{ result ? formatCents(result.monthlyCents) : '—' }}
            </dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd data-testid="summary-total" class="strong total">
              {{ result ? formatCents(result.totalCents) : '—' }}
            </dd>
          </div>
        </dl>
      </FormSection>

      <div class="form-actions">
        <Button
          type="submit"
          label="Save"
          icon="pi pi-check"
          :disabled="!canSave"
          :loading="saving"
          data-testid="save"
        />
        <Button
          v-if="isEdit"
          label="Create invoice"
          icon="pi pi-file"
          severity="secondary"
          outlined
          :disabled="!!createInvoiceBlockedReason"
          :title="createInvoiceBlockedReason"
          data-testid="create-invoice"
          @click="createInvoice"
        />
        <Button
          v-if="isEdit"
          label="Delete"
          icon="pi pi-trash"
          severity="danger"
          outlined
          :disabled="!!loadError"
          data-testid="delete"
          class="form-actions__delete"
          @click="remove"
        />
      </div>
    </form>
  </div>
</template>

<style scoped>
.load-error {
  margin-bottom: 1rem;
}

.recipient-error {
  margin-top: 0.5rem;
}

.strong {
  font-weight: 600;
}

.total {
  font-size: 1.125rem;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.form-actions__delete {
  margin-left: auto;
}
</style>
