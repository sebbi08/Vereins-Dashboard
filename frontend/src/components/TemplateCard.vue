<script setup lang="ts">
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import FileUpload, { type FileUploadSelectEvent } from 'primevue/fileupload';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import type { TemplateDto, TemplateType } from 'shared';
import { ref } from 'vue';
import { useNotify } from '../composables/useNotify';
import { formatTimestampDate } from '../utils/format';

const props = defineProps<{
  type: TemplateType;
  label: string;
  accept: string;
  previewTitle: string;
  template: TemplateDto | null;
}>();

const emit = defineEmits<{
  uploaded: [];
}>();

const notify = useNotify();

const dialogVisible = ref(false);
const previewLoading = ref(false);
const previewError = ref('');
const previewUrl = ref<string | null>(null);
const pendingFile = ref<File | null>(null);
const busy = ref(false);
const fileUpload = ref<{ clear: () => void } | null>(null);
let objectUrl: string | null = null;

type ErrorBody = { missingRequiredFields?: string[]; error?: string } | null;

function errorMessage(body: ErrorBody, fallback: string): string {
  if (body?.missingRequiredFields) {
    return `Missing required fields: ${body.missingRequiredFields.join(', ')}`;
  }
  return body?.error || fallback;
}

function releaseObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function resetPreview() {
  previewError.value = '';
  previewUrl.value = null;
  releaseObjectUrl();
}

function closeDialog() {
  dialogVisible.value = false;
  pendingFile.value = null;
  resetPreview();
}

function templateForm(file: File): FormData {
  const formData = new FormData();
  formData.append('template', file);
  return formData;
}

async function onFileSelect(event: FileUploadSelectEvent) {
  const file = (event.files as File[])[0];
  fileUpload.value?.clear();
  if (!file) return;

  resetPreview();
  pendingFile.value = null;
  busy.value = true;
  try {
    const res = await fetch(`/api/templates/${props.type}/preview`, {
      method: 'POST',
      body: templateForm(file),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ErrorBody;
      notify.error(errorMessage(body, 'Preview could not be generated'));
      return;
    }
    const result = (await res.json()) as { data: string };
    previewUrl.value = `data:application/pdf;base64,${result.data}`;
    pendingFile.value = file;
    dialogVisible.value = true;
  } catch {
    notify.error('Network error generating preview');
  } finally {
    busy.value = false;
  }
}

async function saveTemplate() {
  const file = pendingFile.value;
  if (!file) return;
  busy.value = true;
  try {
    const res = await fetch(`/api/templates/${props.type}/upload`, {
      method: 'POST',
      body: templateForm(file),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ErrorBody;
      notify.error(errorMessage(body, 'Unknown error'));
      return;
    }
    notify.success('Template uploaded successfully');
    closeDialog();
    emit('uploaded');
  } catch {
    notify.error('Network error uploading template');
  } finally {
    busy.value = false;
  }
}

async function showCurrentPreview() {
  if (!props.template) return;
  resetPreview();
  pendingFile.value = null;
  previewLoading.value = true;
  dialogVisible.value = true;
  try {
    const res = await fetch(`/api/templates/preview/${props.type}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ErrorBody;
      previewError.value = body?.error || 'No preview available';
      return;
    }
    objectUrl = URL.createObjectURL(await res.blob());
    previewUrl.value = objectUrl;
  } catch {
    previewError.value = 'Network error loading preview';
  } finally {
    previewLoading.value = false;
  }
}
</script>

<template>
  <div class="template-card" data-testid="template-card">
    <div class="template-card__info">
      <p class="template-card__label">{{ label }}</p>
      <p v-if="template" class="muted template-card__meta" data-testid="template-version">
        Version {{ template.version }} · uploaded on {{ formatTimestampDate(template.uploadedAt) }}
      </p>
      <p v-else class="template-card__missing" data-testid="template-missing">
        No template uploaded
      </p>
    </div>
    <div class="row gap-sm">
      <a
        v-if="template"
        :href="`/api/templates/${type}/download`"
        class="template-card__download"
        data-testid="template-download"
      >
        Download
      </a>
      <FileUpload
        ref="fileUpload"
        mode="basic"
        :accept="accept"
        custom-upload
        :choose-label="busy ? 'Uploading…' : 'Upload New Template'"
        :disabled="busy"
        @select="onFileSelect"
      />
      <Button
        label="Show Current Preview"
        icon="pi pi-eye"
        severity="secondary"
        outlined
        :disabled="!template"
        data-testid="show-preview"
        @click="showCurrentPreview"
      />
    </div>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      :style="{ width: '56rem' }"
      :breakpoints="{ '960px': '95vw' }"
      @hide="closeDialog"
    >
      <template #header>
        <h3 class="dialog-title">{{ previewTitle }}</h3>
      </template>
      <div v-if="previewLoading" class="row gap-sm preview-loading">
        <ProgressSpinner style="width: 2rem; height: 2rem" />
        <span>Generating preview…</span>
      </div>
      <Message v-else-if="previewError" severity="error">{{ previewError }}</Message>
      <iframe
        v-else-if="previewUrl"
        :src="previewUrl"
        class="preview-frame"
        title="Template Preview"
      ></iframe>
      <p v-else class="muted">No preview available</p>
      <template v-if="previewUrl && !previewError && pendingFile" #footer>
        <Button label="Close" text severity="secondary" @click="closeDialog" />
        <Button
          label="Save Template"
          icon="pi pi-check"
          :loading="busy"
          data-testid="save-template"
          @click="saveTemplate"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.template-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
}

.template-card__info {
  min-width: 0;
}

.template-card__label {
  margin: 0;
  font-weight: 500;
}

.template-card__meta,
.template-card__missing {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
}

.template-card__missing {
  color: var(--p-orange-500);
}

.template-card__download {
  color: var(--p-primary-color);
}

.dialog-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.preview-loading {
  padding: 2rem 0;
  justify-content: center;
}

.preview-frame {
  width: 100%;
  min-height: 60vh;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
}
</style>
