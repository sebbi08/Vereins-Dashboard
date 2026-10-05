<script setup lang="ts">
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
import WeeklySchedule from '../components/WeeklySchedule.vue';
import { centsToEuroInput, formatCents, formatHours, parseEuroToCents } from '../utils/format';
import {
  emptyRecipient,
  fromRecipientDto,
  type RecipientFormValue,
  toRecipientData,
} from '../utils/recipientForm';

const route = useRoute();
const router = useRouter();

const instructorId = route.params.id ? Number(route.params.id) : null;
const isEdit = instructorId !== null;

const recipient = ref<RecipientFormValue>(emptyRecipient());
const hourlyRate = ref('');
const months = ref<number | string>(1);
const timeBlocks = ref<TimeBlock[]>([]);
const weeksPerMonth = ref(DEFAULT_WEEKS_PER_MONTH);

const error = ref('');
const saving = ref(false);
const savedSnapshot = ref('');

const rentInputs = computed<InstructorRentInputs>(() => ({
  hourlyRateCents: parseEuroToCents(hourlyRate.value),
  months: Number(months.value),
  timeBlocks: timeBlocks.value,
}));
const issues = computed(() => validateInstructorRent(rentInputs.value));
const recipientError = computed(() =>
  recipient.value.name.trim() ? '' : 'Recipient name is required',
);
const result = computed(() =>
  issues.value.length === 0 ? calculateInstructorRent(rentInputs.value, weeksPerMonth.value) : null,
);
const canSave = computed(() => issues.value.length === 0 && !recipientError.value && !saving.value);

function fieldIssue(path: string): string {
  return issues.value.find((issue) => issue.path === path)?.message ?? '';
}

function snapshot(): string {
  return JSON.stringify([
    recipient.value,
    hourlyRate.value,
    Number(months.value),
    timeBlocks.value,
  ]);
}
const isDirty = computed(() => snapshot() !== savedSnapshot.value);

async function loadSettings() {
  const res = await fetch('/api/instructor/settings');
  if (res.ok) weeksPerMonth.value = ((await res.json()) as InstructorSettingsDto).weeksPerMonth;
}

async function loadInstructor() {
  if (!isEdit) return;
  const res = await fetch(`/api/instructor/${instructorId}`);
  if (!res.ok) {
    error.value = 'Instructor not found';
    return;
  }
  const dto = (await res.json()) as InstructorDto;
  recipient.value = fromRecipientDto(dto.recipient);
  hourlyRate.value = centsToEuroInput(dto.hourlyRateCents);
  months.value = dto.months;
  timeBlocks.value = dto.timeBlocks;
  savedSnapshot.value = snapshot();
}

async function save() {
  if (!canSave.value) return;
  error.value = '';
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
      error.value = ((await res.json()) as { error?: string }).error ?? 'Saving failed';
      return;
    }
    router.push('/instructor');
  } catch {
    error.value = 'Saving failed';
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!isEdit || !confirm('Delete this instructor? The recipient is kept.')) return;
  const res = await fetch(`/api/instructor/${instructorId}`, { method: 'DELETE' });
  if (!res.ok) {
    error.value = 'Deleting failed';
    return;
  }
  router.push('/instructor');
}

function createInvoice() {
  router.push(`/invoice/new?fromInstructor=${instructorId}`);
}

onMounted(async () => {
  await Promise.all([loadSettings(), loadInstructor()]);
});
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-gray-800 mb-6">
      {{ isEdit ? 'Edit instructor' : 'New instructor' }}
    </h2>

    <div
      v-if="error"
      data-testid="form-error"
      class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
    >
      {{ error }}
    </div>

    <form class="space-y-6" @submit.prevent="save">
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Recipient</h3>
        <RecipientPicker v-model="recipient" />
        <p v-if="recipientError" class="text-xs text-red-600 mt-2">{{ recipientError }}</p>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Rent</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label for="hourly-rate" class="block text-sm font-medium text-gray-700 mb-1"
              >Hourly rate (€, net)</label
            >
            <input
              id="hourly-rate"
              v-model="hourlyRate"
              data-testid="hourly-rate"
              type="text"
              inputmode="decimal"
              placeholder="12,50"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p
              v-if="fieldIssue('hourlyRateCents')"
              data-testid="hourly-rate-error"
              class="text-xs text-red-600 mt-1"
            >
              {{ fieldIssue('hourlyRateCents') }}
            </p>
          </div>
          <div>
            <label for="months" class="block text-sm font-medium text-gray-700 mb-1">Months</label>
            <input
              id="months"
              v-model="months"
              data-testid="months"
              type="number"
              min="1"
              step="1"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p
              v-if="fieldIssue('months')"
              data-testid="months-error"
              class="text-xs text-red-600 mt-1"
            >
              {{ fieldIssue('months') }}
            </p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Weekly schedule</h3>
        <WeeklySchedule v-model="timeBlocks" :issues="issues" />
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">
          Summary (net, {{ String(weeksPerMonth).replace('.', ',') }} weeks/month)
        </h3>
        <dl class="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt class="text-gray-500">Hours per week</dt>
            <dd data-testid="summary-hours" class="font-medium">
              {{ result ? `${formatHours(result.netMinutesPerWeek)} h` : '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-gray-500">Per month</dt>
            <dd data-testid="summary-monthly" class="font-medium">
              {{ result ? formatCents(result.monthlyCents) : '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-gray-500">Total</dt>
            <dd data-testid="summary-total" class="font-semibold">
              {{ result ? formatCents(result.totalCents) : '—' }}
            </dd>
          </div>
        </dl>
      </div>

      <div class="flex gap-3">
        <button
          type="button"
          data-testid="save"
          :disabled="!canSave"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="save"
        >
          Save
        </button>
        <button
          v-if="isEdit"
          type="button"
          data-testid="create-invoice"
          :disabled="isDirty"
          :title="isDirty ? 'Save your changes first' : ''"
          class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="createInvoice"
        >
          Create invoice
        </button>
        <button
          v-if="isEdit"
          type="button"
          data-testid="delete"
          class="px-4 py-2 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 ml-auto"
          @click="remove"
        >
          Delete
        </button>
      </div>
    </form>
  </div>
</template>
