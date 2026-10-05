<script setup lang="ts">
import {
  buildInstructorInvoiceTextValues,
  DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE,
  DEFAULT_WEEKS_PER_MONTH,
  effectiveInstructorInvoiceTemplate,
  INSTRUCTOR_INVOICE_PLACEHOLDERS,
  type InstructorDto,
  type InstructorRentInputs,
  type InstructorSettingsDto,
  renderInstructorInvoiceText,
  validateInstructorInvoiceTemplate,
} from 'shared';
import { computed, nextTick, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  previewInstructorId: number | null;
  weeksPerMonth: number;
}>();

interface PreviewSource {
  name: string;
  inputs: InstructorRentInputs;
}

const EXAMPLE: PreviewSource = {
  name: 'Anna Alt',
  inputs: {
    hourlyRateCents: 1250,
    months: 6,
    timeBlocks: [
      { weekday: 'MO', start: '14:00', end: '18:00', breaks: [{ start: '16:00', end: '16:30' }] },
      { weekday: 'DO', start: '09:00', end: '13:00', breaks: [] },
    ],
  },
};

const template = ref(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
const usingDefault = ref(true);
const loaded = ref(false);
const serverError = ref('');
const loadError = ref('');
const saved = ref(false);
const textarea = ref<HTMLTextAreaElement | null>(null);
const previewSource = ref<PreviewSource | null>(null);

const validationError = computed(() => validateInstructorInvoiceTemplate(template.value));
const shownError = computed(() => validationError.value ?? (serverError.value || loadError.value));
const canSave = computed(() => loaded.value && !validationError.value);

const preview = computed(() => {
  const source = previewSource.value ?? EXAMPLE;
  const weeks =
    Number.isFinite(props.weeksPerMonth) && props.weeksPerMonth > 0
      ? props.weeksPerMonth
      : DEFAULT_WEEKS_PER_MONTH;
  return renderInstructorInvoiceText(
    effectiveInstructorInvoiceTemplate(template.value),
    buildInstructorInvoiceTextValues(source.name, source.inputs, weeks),
  );
});

function edited() {
  saved.value = false;
  serverError.value = '';
}

async function loadTemplate() {
  try {
    const res = await fetch('/api/instructor/settings');
    if (!res.ok) throw new Error('load failed');
    const dto = (await res.json()) as InstructorSettingsDto;
    template.value = dto.invoiceTemplate ?? DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
    usingDefault.value = dto.invoiceTemplate === null;
    loaded.value = true;
  } catch {
    loadError.value = 'Could not load invoice text';
  }
}

async function loadPreviewInstructor(id: number | null) {
  previewSource.value = null;
  if (id === null) return;
  try {
    const res = await fetch(`/api/instructor/${id}`);
    if (!res.ok) return;
    const dto = (await res.json()) as InstructorDto;
    previewSource.value = {
      name: dto.recipient.name,
      inputs: {
        hourlyRateCents: dto.hourlyRateCents,
        months: dto.months,
        timeBlocks: dto.timeBlocks,
      },
    };
  } catch {
    // Preview falls back to the example values.
  }
}

watch(() => props.previewInstructorId, loadPreviewInstructor);

async function put(invoiceTemplate: string | null): Promise<InstructorSettingsDto | null> {
  serverError.value = '';
  saved.value = false;
  try {
    const res = await fetch('/api/instructor/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceTemplate }),
    });
    if (!res.ok) {
      serverError.value = ((await res.json()) as { error?: string }).error ?? 'Saving failed';
      return null;
    }
    return (await res.json()) as InstructorSettingsDto;
  } catch {
    serverError.value = 'Saving failed';
    return null;
  }
}

async function save() {
  if (!canSave.value) return;
  const dto = await put(template.value);
  if (!dto) return;
  usingDefault.value = dto.invoiceTemplate === null;
  if (dto.invoiceTemplate === null) template.value = DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
  saved.value = true;
}

async function resetToDefault() {
  if (!loaded.value || !confirm('Reset the invoice text to the default?')) return;
  const dto = await put(null);
  if (!dto) return;
  template.value = DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
  usingDefault.value = true;
  saved.value = true;
}

async function insertPlaceholder(key: string) {
  const token = `{${key}}`;
  const el = textarea.value;
  const start = el ? el.selectionStart : template.value.length;
  const end = el ? el.selectionEnd : template.value.length;
  template.value = template.value.slice(0, start) + token + template.value.slice(end);
  edited();
  await nextTick();
  if (el) {
    el.focus();
    el.setSelectionRange(start + token.length, start + token.length);
  }
}

onMounted(async () => {
  await Promise.all([loadTemplate(), loadPreviewInstructor(props.previewInstructorId)]);
});
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
    <h3 class="font-semibold text-gray-800 mb-1">Invoice text</h3>
    <p class="text-sm text-gray-500 mb-3">
      Text of the line item when an invoice is created from an instructor.
    </p>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="md:col-span-2">
        <textarea
          ref="textarea"
          v-model="template"
          data-testid="invoice-template"
          rows="6"
          aria-label="Invoice text"
          :readonly="!loaded"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          @input="edited"
        ></textarea>
        <p
          v-if="usingDefault"
          data-testid="invoice-template-default-hint"
          class="text-xs text-gray-500 mt-1"
        >
          Using the default text.
        </p>
        <p v-if="shownError" data-testid="invoice-template-error" class="text-sm text-red-600 mt-1">
          {{ shownError }}
        </p>

        <div class="flex items-center gap-3 mt-3">
          <button
            type="button"
            data-testid="save-invoice-template"
            :disabled="!canSave"
            class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="save"
          >
            Save
          </button>
          <button
            type="button"
            data-testid="reset-invoice-template"
            :disabled="!loaded"
            class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="resetToDefault"
          >
            Reset to default
          </button>
          <p v-if="saved" data-testid="invoice-template-saved" class="text-sm text-green-600">
            Saved
          </p>
        </div>

        <div class="mt-4">
          <p class="text-xs font-medium text-gray-600 mb-1">
            Preview
            <span v-if="!previewSource" data-testid="invoice-template-example-caption"
              >(example values)</span
            >
          </p>
          <div
            data-testid="invoice-template-preview"
            class="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-line"
            v-text="preview"
          ></div>
        </div>
      </div>

      <div>
        <p class="text-xs font-medium text-gray-600 mb-1">Placeholders (click to insert)</p>
        <ul class="space-y-1">
          <li v-for="p in INSTRUCTOR_INVOICE_PLACEHOLDERS" :key="p.key" class="text-xs">
            <button
              type="button"
              :data-testid="`placeholder-${p.key}`"
              class="font-mono text-blue-600 hover:underline"
              @click="insertPlaceholder(p.key)"
              v-text="'{' + p.key + '}'"
            ></button>
            <span class="text-gray-500"> – {{ p.description }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
