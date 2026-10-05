<script setup lang="ts">
import {
  DEFAULT_WEEKS_PER_MONTH,
  type InstructorListItemDto,
  type InstructorSettingsDto,
  validateWeeksPerMonth,
} from 'shared';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { formatCents, formatHours } from '../utils/format';

const router = useRouter();
const store = useAppStore();

const instructors = ref<InstructorListItemDto[]>([]);
const loading = ref(false);
const error = ref('');

const weeksPerMonth = ref<number | string>(DEFAULT_WEEKS_PER_MONTH);
const settingsError = ref('');
const settingsSaved = ref(false);
const settingsLoaded = ref(false);

watch(weeksPerMonth, () => {
  settingsSaved.value = false;
});

const totalCents = computed(() =>
  instructors.value.reduce((sum, i) => sum + i.calculation.totalCents, 0),
);

async function loadInstructors() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/instructor');
    if (!res.ok) throw new Error('load failed');
    instructors.value = await res.json();
  } catch {
    error.value = 'Error loading instructors';
  } finally {
    loading.value = false;
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/instructor/settings');
    if (!res.ok) throw new Error('load failed');
    weeksPerMonth.value = ((await res.json()) as InstructorSettingsDto).weeksPerMonth;
    settingsLoaded.value = true;
  } catch {
    settingsError.value = 'Could not load settings';
  }
}

async function saveSettings() {
  if (!settingsLoaded.value) return;
  settingsError.value = '';
  settingsSaved.value = false;
  const value = Number(weeksPerMonth.value);
  const validation = validateWeeksPerMonth(value);
  if (validation) {
    settingsError.value = validation;
    return;
  }
  try {
    const res = await fetch('/api/instructor/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeksPerMonth: value }),
    });
    if (!res.ok) {
      settingsError.value = ((await res.json()) as { error?: string }).error ?? 'Saving failed';
      return;
    }
  } catch {
    settingsError.value = 'Saving failed';
    return;
  }
  settingsSaved.value = true;
  await loadInstructors();
}

function openInstructor(id: number) {
  router.push(`/instructor/${id}`);
}

function createInvoice(id: number) {
  router.push(`/invoice/new?fromInstructor=${id}`);
}

onMounted(async () => {
  await Promise.all([
    loadSettings(),
    loadInstructors(),
    store.invoiceTemplateAvailable === null ? store.checkTemplates() : Promise.resolve(),
  ]);
});
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-gray-800">Instructor Rent</h2>
      <button
        type="button"
        data-testid="new-instructor"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        @click="router.push('/instructor/new')"
      >
        New instructor
      </button>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex items-end gap-3">
      <div>
        <label for="weeks-per-month" class="block text-sm font-medium text-gray-700 mb-1"
          >Weeks per month</label
        >
        <input
          id="weeks-per-month"
          v-model="weeksPerMonth"
          data-testid="weeks-per-month"
          type="number"
          step="0.01"
          min="0.01"
          class="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        type="button"
        data-testid="save-settings"
        :disabled="!settingsLoaded"
        class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        @click="saveSettings"
      >
        Save
      </button>
      <p v-if="settingsError" data-testid="settings-error" class="text-sm text-red-600">
        {{ settingsError }}
      </p>
      <p v-else-if="settingsSaved" data-testid="settings-saved" class="text-sm text-green-600">
        Saved
      </p>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <p v-if="error" class="p-4 text-sm text-red-600">{{ error }}</p>
      <p v-else-if="loading" class="p-4 text-sm text-gray-500">Loading…</p>
      <p v-else-if="instructors.length === 0" class="p-4 text-sm text-gray-500">
        No instructors yet.
      </p>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 bg-gray-50">
            <th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Hourly rate (net)</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">h/week</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Per month (net)</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Months</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Total (net)</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="i in instructors"
            :key="i.id"
            data-testid="instructor-row"
            class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
            tabindex="0"
            role="button"
            @click="openInstructor(i.id)"
            @keydown.enter.prevent="openInstructor(i.id)"
          >
            <td class="px-4 py-3 text-gray-800">{{ i.name }}</td>
            <td class="px-4 py-3 text-right">{{ formatCents(i.hourlyRateCents) }}</td>
            <td class="px-4 py-3 text-right">{{ formatHours(i.calculation.netMinutesPerWeek) }}</td>
            <td class="px-4 py-3 text-right">{{ formatCents(i.calculation.monthlyCents) }}</td>
            <td class="px-4 py-3 text-right">{{ i.months }}</td>
            <td class="px-4 py-3 text-right font-medium">
              {{ formatCents(i.calculation.totalCents) }}
            </td>
            <td class="px-4 py-3 text-right">
              <button
                type="button"
                :data-testid="`create-invoice-${i.id}`"
                :disabled="store.invoiceTemplateAvailable === false"
                :title="
                  store.invoiceTemplateAvailable === false ? 'No active invoice template' : ''
                "
                class="px-3 py-1 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                @keydown.enter.stop
                @click.stop="createInvoice(i.id)"
              >
                Create invoice
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="bg-gray-50">
            <td colspan="5" class="px-4 py-3 font-medium text-gray-600">Sum</td>
            <td data-testid="footer-total" class="px-4 py-3 text-right font-semibold">
              {{ formatCents(totalCents) }}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>
