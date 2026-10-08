<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
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
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';

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

const notify = useNotify();
const { confirmAction } = useConfirmAction();

const template = ref(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
const savedTemplate = ref(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
const usingDefault = ref(true);
const loaded = ref(false);
const loadError = ref('');
const saving = ref(false);
const textarea = ref<{ $el: HTMLTextAreaElement } | null>(null);
const previewSource = ref<PreviewSource | null>(null);

const validationError = computed(() => validateInstructorInvoiceTemplate(template.value));
const shownError = computed(() => validationError.value ?? loadError.value);
const canSave = computed(
  () =>
    loaded.value &&
    !validationError.value &&
    !saving.value &&
    template.value !== savedTemplate.value,
);

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

async function loadTemplate() {
  try {
    const res = await fetch('/api/instructor/settings');
    if (!res.ok) throw new Error('load failed');
    const dto = (await res.json()) as InstructorSettingsDto;
    template.value = dto.invoiceTemplate ?? DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
    savedTemplate.value = template.value;
    usingDefault.value = dto.invoiceTemplate === null;
    loaded.value = true;
  } catch {
    loadError.value = 'Could not load invoice text';
  }
}

/** Bumped by every load; a response for an older instructor is stale. */
let latestPreviewLoad = 0;

async function loadPreviewInstructor(id: number | null) {
  const load = ++latestPreviewLoad;
  previewSource.value = null;
  if (id === null) return;
  try {
    const res = await fetch(`/api/instructor/${id}`);
    if (!res.ok) return;
    const dto = (await res.json()) as InstructorDto;
    if (load !== latestPreviewLoad) return;
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
  saving.value = true;
  try {
    const res = await fetch('/api/instructor/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceTemplate }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      notify.error(body.error ?? 'Saving failed');
      return null;
    }
    return (await res.json()) as InstructorSettingsDto;
  } catch {
    notify.error('Saving failed');
    return null;
  } finally {
    saving.value = false;
  }
}

async function save() {
  if (!canSave.value) return;
  const dto = await put(template.value);
  if (!dto) return;
  usingDefault.value = dto.invoiceTemplate === null;
  if (dto.invoiceTemplate === null) template.value = DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
  savedTemplate.value = template.value;
  notify.success('Invoice text saved');
}

async function resetToDefault() {
  if (!loaded.value) return;
  const confirmed = await confirmAction({
    message: 'Reset the invoice text to the default?',
    header: 'Reset invoice text',
    acceptLabel: 'Reset',
  });
  if (!confirmed) return;
  const dto = await put(null);
  if (!dto) return;
  template.value = DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
  savedTemplate.value = template.value;
  usingDefault.value = true;
  notify.success('Invoice text reset to the default');
}

async function insertPlaceholder(key: string) {
  const token = `{${key}}`;
  const el = textarea.value?.$el ?? null;
  const start = el ? el.selectionStart : template.value.length;
  const end = el ? el.selectionEnd : template.value.length;
  template.value = template.value.slice(0, start) + token + template.value.slice(end);
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
  <section class="stack gap-sm" data-testid="invoice-text-settings">
    <div>
      <h3 class="section-title">Invoice text</h3>
      <p class="muted intro">
        Text of the line item when an invoice is created from an instructor.
      </p>
    </div>

    <div class="text-settings">
      <div class="stack gap-sm">
        <Textarea
          ref="textarea"
          v-model="template"
          data-testid="invoice-template"
          rows="6"
          auto-resize
          aria-label="Invoice text"
          :readonly="!loaded"
          :invalid="!!shownError"
          fluid
        />
        <small v-if="usingDefault" data-testid="invoice-template-default-hint" class="muted"
          >Using the default text.</small
        >
        <Message
          v-if="shownError"
          severity="error"
          size="small"
          variant="simple"
          data-testid="invoice-template-error"
        >
          {{ shownError }}
        </Message>

        <div class="row gap-sm">
          <Button
            label="Save"
            icon="pi pi-check"
            :disabled="!canSave"
            :loading="saving"
            data-testid="save-invoice-template"
            @click="save"
          />
          <Button
            label="Reset to default"
            icon="pi pi-undo"
            severity="secondary"
            outlined
            :disabled="!loaded || saving"
            data-testid="reset-invoice-template"
            @click="resetToDefault"
          />
        </div>

        <div>
          <p class="muted small-label">
            Preview
            <span v-if="!previewSource" data-testid="invoice-template-example-caption"
              >(example values)</span
            >
          </p>
          <div data-testid="invoice-template-preview" class="preview-box" v-text="preview"></div>
        </div>
      </div>

      <div>
        <p class="muted small-label">Placeholders (click to insert)</p>
        <ul class="placeholders">
          <li v-for="p in INSTRUCTOR_INVOICE_PLACEHOLDERS" :key="p.key">
            <Button
              :label="'{' + p.key + '}'"
              text
              size="small"
              class="placeholder-button"
              :data-testid="`placeholder-${p.key}`"
              @click="insertPlaceholder(p.key)"
            />
            <span class="muted"> – {{ p.description }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.intro {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
}

.text-settings {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 1rem;
}

@media (max-width: 767px) {
  .text-settings {
    grid-template-columns: 1fr;
  }
}

.small-label {
  margin: 0 0 0.25rem;
  font-size: 0.8125rem;
}

.preview-box {
  white-space: pre-line;
  padding: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
  font-size: 0.875rem;
}

.placeholders {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.8125rem;
}

.placeholder-button {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
