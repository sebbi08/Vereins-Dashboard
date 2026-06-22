<script setup lang="ts">
import type { TemplateDto } from 'shared';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const template = ref<TemplateDto | null>(null);
const uploadError = ref('');
const uploadSuccess = ref('');

const showPreviewModal = ref(false);
const previewLoading = ref(false);
const previewError = ref('');
const previewDataUrl = ref<string | null>(null);
const previewObjectUrl = ref<string | null>(null);
const pendingUploadDatei = ref<File | null>(null);
const uploadLoading = ref(false);

async function loadTemplate() {
  const res = await fetch('/api/templates');
  if (res.ok) {
    const allTemplates: TemplateDto[] = await res.json();
    template.value = allTemplates.find((v) => v.type === 'RECHNUNG') ?? null;
  }
}

onMounted(loadTemplate);

async function uploadTemplate(datei: File): Promise<boolean> {
  uploadError.value = '';
  uploadSuccess.value = '';
  uploadLoading.value = true;

  try {
    const formData = new FormData();
    formData.append('template', datei);

    const res = await fetch('/api/templates/RECHNUNG/upload', {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      uploadSuccess.value = 'Template uploaded successfully';
      await loadTemplate();
      return true;
    }

    const err = await res.json();
    uploadError.value = err.missingRequiredFields
      ? `Missing required fields: ${err.missingRequiredFields.join(', ')}`
      : err.error || 'Unknown error';
    return false;
  } finally {
    uploadLoading.value = false;
  }
}

function closePreviewModal() {
  pendingUploadDatei.value = null;
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = null;
  }
  showPreviewModal.value = false;
  previewDataUrl.value = null;
  previewError.value = '';
}

async function showCurrentPreview() {
  if (!template.value) return;

  uploadError.value = '';
  uploadSuccess.value = '';
  previewError.value = '';
  previewDataUrl.value = null;
  previewLoading.value = true;
  pendingUploadDatei.value = null;
  showPreviewModal.value = true;

  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = null;
  }

  try {
    const res = await fetch('/api/templates/preview/RECHNUNG');
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const message = err?.error || 'No preview available';
      previewError.value = message;
      uploadError.value = message;
      return;
    }

    const blob = await res.blob();
    const objektUrl = URL.createObjectURL(blob);
    previewObjectUrl.value = objektUrl;
    previewDataUrl.value = objektUrl;
  } catch {
    const message = 'Network error loading preview';
    previewError.value = message;
    uploadError.value = message;
  } finally {
    previewLoading.value = false;
  }
}

async function templatePreview(event: Event) {
  const input = event.target as HTMLInputElement;
  const datei = input.files?.[0];
  if (!datei) return;

  uploadError.value = '';
  uploadSuccess.value = '';
  previewError.value = '';
  previewDataUrl.value = null;
  previewLoading.value = true;
  uploadLoading.value = true;

  try {
    const formData = new FormData();
    formData.append('template', datei);

    const res = await fetch('/api/templates/RECHNUNG/preview', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      const message = err.missingRequiredFields
        ? `Missing required fields: ${err.missingRequiredFields.join(', ')}`
        : err.error || 'Preview could not be generated';
      previewError.value = message;
      uploadError.value = message;
      return;
    }

    const result = await res.json();
    previewDataUrl.value = `data:application/pdf;base64,${result.data}`;
    pendingUploadDatei.value = datei;
    showPreviewModal.value = true;
  } catch {
    const message = 'Network error generating preview';
    previewError.value = message;
    uploadError.value = message;
  } finally {
    previewLoading.value = false;
    uploadLoading.value = false;
    input.value = '';
  }
}

async function savePreview() {
  const datei = pendingUploadDatei.value;
  if (!datei) {
    previewError.value = 'No file available for upload';
    return;
  }

  previewLoading.value = true;
  const success = await uploadTemplate(datei);
  previewLoading.value = false;

  if (success) {
    closePreviewModal();
  }
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(iso));
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <button class="text-gray-400 hover:text-gray-700" @click="router.back()">← Back</button>
      <h2 class="text-2xl font-bold text-gray-800">Invoice Settings</h2>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 class="font-semibold text-gray-800 mb-4">Invoice Template</h3>

      <div class="border border-gray-200 rounded-lg p-4">
        <div class="flex items-center justify-between mb-2">
          <div>
            <p class="font-medium text-gray-800 text-sm">Invoice (.docx)</p>
            <p v-if="template" class="text-xs text-gray-500">
              Version {{ template.version }} · uploaded on
              {{ formatDate(template.uploadedAt) }}
            </p>
            <p v-else class="text-xs text-orange-500">No template uploaded</p>
          </div>
          <a
            v-if="template"
            :href="'/api/templates/RECHNUNG/download'"
            class="text-blue-600 hover:underline text-sm"
          >
            Download
          </a>
        </div>
        <div v-if="uploadError" class="text-red-600 text-xs mb-2">
          {{ uploadError }}
        </div>
        <div v-if="uploadSuccess" class="text-green-600 text-xs mb-2">
          {{ uploadSuccess }}
        </div>
        <label
          class="cursor-pointer"
          :class="{ 'pointer-events-none opacity-50': uploadLoading }"
        >
          <span
            class="inline-flex items-center gap-1.5 border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50"
          >
            <span
              v-if="uploadLoading"
              class="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-b-transparent"
            ></span>
            {{ uploadLoading ? 'Uploading…' : 'Upload New Template' }}
          </span>
          <input
            type="file"
            class="hidden"
            accept=".docx"
            :disabled="uploadLoading"
            @change="templatePreview($event)"
          />
        </label>
        <button
          type="button"
          class="ml-2 inline-block border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!template"
          @click="showCurrentPreview()"
        >
          Show Current Preview
        </button>
        <p v-if="!template" class="mt-2 text-xs text-orange-500">No active template available</p>
      </div>
    </div>

    <div
      v-if="showPreviewModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h3 class="text-lg font-semibold text-gray-800">Invoice Preview</h3>
          <button @click="closePreviewModal" class="text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>

        <div class="p-6 overflow-auto flex-1">
          <div v-if="previewLoading" class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span class="ml-3 text-gray-600">Generating preview...</span>
          </div>

          <div
            v-if="previewError"
            class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700"
          >
            {{ previewError }}
          </div>

          <iframe
            v-if="previewDataUrl && !previewError"
            :src="previewDataUrl"
            class="w-full flex-1 border rounded-lg"
            style="min-height: 400px"
            title="Template Preview"
          ></iframe>

          <div
            v-else-if="!previewLoading && !previewError"
            class="text-center text-gray-500 py-12"
          >
            No preview available
          </div>
        </div>

        <div
          v-if="previewDataUrl && !previewError && pendingUploadDatei"
          class="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 shrink-0"
        >
          <button
            @click="closePreviewModal"
            class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Close
          </button>
          <button
            :disabled="previewLoading"
            @click="savePreview"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Save Template
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
