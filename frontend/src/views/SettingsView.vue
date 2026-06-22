<script setup lang="ts">
import type { DonorDto, SystemSettings, TemplateDto, TemplateType } from 'shared';
import { computed, onMounted, ref, watch } from 'vue';

const settings = ref<SystemSettings>({
  treasurer: '',
  charitablePurpose: '',
  taxOfficeName: '',
  taxNumber: '',
  exemptionDate: '',
  assessmentPeriod: '',
});

const templates = ref<TemplateDto[]>([]);
const saving = ref(false);
const success = ref('');
const error = ref('');
const uploadError = ref<Record<string, string>>({});
const uploadSuccess = ref<Record<string, string>>({});

const showPreviewModal = ref(false);
const previewLoading = ref(false);
const previewError = ref('');
const previewDataUrl = ref<string | null>(null);
const previewObjectUrl = ref<string | null>(null);
const currentPreviewType = ref<TemplateType | null>(null);
const pendingUploadFiles = ref<Partial<Record<TemplateType, File | null>>>({
  ANSCHREIBEN: null,
  QUITTUNG: null,
});
const uploadLoading = ref<Partial<Record<TemplateType, boolean>>>({});

async function loadSettings() {
  const res = await fetch('/api/settings');
  if (res.ok) {
    const data = await res.json();
    Object.assign(settings.value, data);
  }
}

async function loadTemplates() {
  const res = await fetch('/api/templates');
  if (res.ok) templates.value = await res.json();
}

onMounted(async () => {
  await Promise.all([loadSettings(), loadTemplates(), loadDonors()]);
});

async function saveSettings() {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings.value),
    });
    if (!res.ok) throw new Error();
    success.value = 'Settings saved';
  } catch {
    error.value = 'Error saving';
  } finally {
    saving.value = false;
  }
}

async function uploadTemplateFile(typ: TemplateType, datei: File): Promise<boolean> {
  uploadError.value[typ] = '';
  uploadSuccess.value[typ] = '';
  uploadLoading.value[typ] = true;

  try {
    const formData = new FormData();
    formData.append('template', datei);

    const res = await fetch(`/api/templates/${typ}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      uploadSuccess.value[typ] = 'Template uploaded successfully';
      await loadTemplates();
      return true;
    }

    const err = await res.json();
    uploadError.value[typ] = err.missingRequiredFields
      ? `Missing required fields: ${err.missingRequiredFields.join(', ')}`
      : err.error || 'Unknown error';
    return false;
  } finally {
    uploadLoading.value[typ] = false;
  }
}

function closePreviewModal() {
  if (currentPreviewType.value) {
    pendingUploadFiles.value[currentPreviewType.value] = null;
  }
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = null;
  }
  showPreviewModal.value = false;
  previewDataUrl.value = null;
  previewError.value = '';
  currentPreviewType.value = null;
}

function hasActiveTemplate(typ: TemplateType): boolean {
  return Boolean(getTemplateByType(typ));
}

function hasPendingUpload(typ: TemplateType | null): boolean {
  if (!typ) return false;
  return Boolean(pendingUploadFiles.value[typ]);
}

async function showCurrentPreview(typ: TemplateType) {
  if (!hasActiveTemplate(typ)) return;

  uploadError.value[typ] = '';
  uploadSuccess.value[typ] = '';
  previewError.value = '';
  previewDataUrl.value = null;
  previewLoading.value = true;
  currentPreviewType.value = typ;
  pendingUploadFiles.value[typ] = null;
  showPreviewModal.value = true;

  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = null;
  }

  try {
    const res = await fetch(`/api/templates/preview/${typ}`);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const message = err?.error || 'No preview available';
      previewError.value = message;
      uploadError.value[typ] = message;
      return;
    }

    const blob = await res.blob();
    const objektUrl = URL.createObjectURL(blob);
    previewObjectUrl.value = objektUrl;
    previewDataUrl.value = objektUrl;
  } catch {
    const message = 'Network error loading preview';
    previewError.value = message;
    uploadError.value[typ] = message;
  } finally {
    previewLoading.value = false;
  }
}

async function templatePreview(typ: TemplateType, event: Event) {
  const input = event.target as HTMLInputElement;
  const datei = input.files?.[0];
  if (!datei) return;

  uploadError.value[typ] = '';
  uploadSuccess.value[typ] = '';
  previewError.value = '';
  previewDataUrl.value = null;
  previewLoading.value = true;
  uploadLoading.value[typ] = true;
  currentPreviewType.value = typ;

  try {
    const formData = new FormData();
    formData.append('template', datei);

    const res = await fetch(`/api/templates/${typ}/preview`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      const message = err.missingRequiredFields
        ? `Missing required fields: ${err.missingRequiredFields.join(', ')}`
        : err.error || 'Preview could not be generated';
      previewError.value = message;
      uploadError.value[typ] = message;
      return;
    }

    const result = await res.json();
    previewDataUrl.value = `data:application/pdf;base64,${result.data}`;
    pendingUploadFiles.value[typ] = datei;
    showPreviewModal.value = true;
  } catch {
    const message = 'Network error generating preview';
    previewError.value = message;
    uploadError.value[typ] = message;
  } finally {
    previewLoading.value = false;
    uploadLoading.value[typ] = false;
    input.value = '';
  }
}

async function saveAndClose(typ: TemplateType) {
  const datei = pendingUploadFiles.value[typ];
  if (!datei) {
    previewError.value = 'No file available for upload';
    return;
  }

  previewLoading.value = true;
  const success = await uploadTemplateFile(typ, datei);
  previewLoading.value = false;

  if (success) {
    closePreviewModal();
  }
}

async function saveCurrentPreview() {
  if (!currentPreviewType.value) return;
  await saveAndClose(currentPreviewType.value);
}

function getTemplateByType(typ: string): TemplateDto | undefined {
  return templates.value.find((v) => v.type === typ);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(iso));
}

// ── Donor Management ──────────────────────────────────

const donors = ref<DonorDto[]>([]);
const donorLoading = ref(false);
const donorError = ref('');
const donorSearch = ref('');

const editingDonorId = ref<number | null>(null);
const editForm = ref({ name: '', street: '', city: '', letterSalutation: '', addressSalutation: '' });
const donorSaving = ref(false);

async function loadDonors() {
  donorLoading.value = true;
  donorError.value = '';
  try {
    const res = await fetch('/api/donor?all=true');
    donors.value = await res.json();
  } catch {
    donorError.value = 'Error loading donors';
  } finally {
    donorLoading.value = false;
  }
}

const filteredDonors = ref<DonorDto[]>([]);

function applyDonorFilter() {
  const q = donorSearch.value.toLowerCase();
  if (!q) {
    filteredDonors.value = donors.value;
    return;
  }
  filteredDonors.value = donors.value.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.street.toLowerCase().includes(q) ||
      d.city.toLowerCase().includes(q),
  );
}

watch([donors, donorSearch], () => applyDonorFilter(), { immediate: true });

const donorTotal = computed(() => donors.value.length);
const donorFiltered = computed(() => filteredDonors.value.length);

function startEditDonor(d: DonorDto) {
  editingDonorId.value = d.id;
  editForm.value = {
    name: d.name,
    street: d.street,
    city: d.city,
    letterSalutation: d.letterSalutation,
    addressSalutation: d.addressSalutation ?? '',
  };
}

function cancelEditDonor() {
  editingDonorId.value = null;
}

async function saveEditDonor() {
  if (!editingDonorId.value) return;
  donorSaving.value = true;
  try {
    const res = await fetch(`/api/donor/${editingDonorId.value}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.value.name,
        street: editForm.value.street,
        city: editForm.value.city,
        letterSalutation: editForm.value.letterSalutation,
        addressSalutation: editForm.value.addressSalutation || null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      const idx = donors.value.findIndex((d) => d.id === updated.id);
      if (idx !== -1) donors.value[idx] = updated;
      editingDonorId.value = null;
    }
  } finally {
    donorSaving.value = false;
  }
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-gray-800 mb-6">Donation Receipt Settings</h2>

    <div
      v-if="error"
      class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ error }}
    </div>
    <div
      v-if="success"
      class="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ success }}
    </div>

    <!-- Association Data -->
    <form
      class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6"
      @submit.prevent="saveSettings"
    >
      <h3 class="font-semibold text-gray-800 mb-4">Association Data (Pre-fill)</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Treasurer</label>
          <input
            v-model="settings.treasurer"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Charitable Purpose</label>
          <input
            v-model="settings.charitablePurpose"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tax Office</label>
          <input
            v-model="settings.taxOfficeName"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tax Number</label>
          <input
            v-model="settings.taxNumber"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >Exemption Date</label
          >
          <input
            v-model="settings.exemptionDate"
            type="date"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Assessment Period</label>
          <input
            v-model="settings.assessmentPeriod"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div class="mt-4 flex justify-end">
        <button
          type="submit"
          :disabled="saving"
          class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>

    <!-- Templates -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 class="font-semibold text-gray-800 mb-4">Templates</h3>
      <div class="space-y-4">
        <div
          v-for="typ in ['ANSCHREIBEN', 'QUITTUNG'] as const"
          :key="typ"
          class="border border-gray-200 rounded-lg p-4"
        >
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="font-medium text-gray-800 text-sm">
                {{ typ === 'ANSCHREIBEN' ? 'Cover Letter (.docx)' : 'Donation Receipt (.pdf)' }}
              </p>
              <p v-if="getTemplateByType(typ)" class="text-xs text-gray-500">
                Version {{ getTemplateByType(typ)!.version }} · uploaded on
                {{ formatDate(getTemplateByType(typ)!.uploadedAt) }}
              </p>
              <p v-else class="text-xs text-orange-500">No template uploaded</p>
            </div>
            <a
              v-if="getTemplateByType(typ)"
              :href="`/api/templates/${typ}/download`"
              class="text-blue-600 hover:underline text-sm"
            >
              Download
            </a>
          </div>
          <div v-if="uploadError[typ]" class="text-red-600 text-xs mb-2">
            {{ uploadError[typ] }}
          </div>
          <div v-if="uploadSuccess[typ]" class="text-green-600 text-xs mb-2">
            {{ uploadSuccess[typ] }}
          </div>
          <label
            class="cursor-pointer"
            :class="{ 'pointer-events-none opacity-50': uploadLoading[typ] }"
          >
            <span
              class="inline-flex items-center gap-1.5 border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50"
            >
              <span
                v-if="uploadLoading[typ]"
                class="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-b-transparent"
              ></span>
              {{ uploadLoading[typ] ? 'Uploading…' : 'Upload New Template' }}
            </span>
            <input
              type="file"
              class="hidden"
              :accept="typ === 'ANSCHREIBEN' ? '.docx' : '.pdf'"
              :disabled="uploadLoading[typ]"
              @change="templatePreview(typ, $event)"
            />
          </label>
          <button
            type="button"
            class="ml-2 inline-block border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!hasActiveTemplate(typ)"
            @click="showCurrentPreview(typ)"
          >
            Show Current Preview
          </button>
          <p v-if="!hasActiveTemplate(typ)" class="mt-2 text-xs text-orange-500">
            No active template available
          </p>
        </div>
      </div>
    </div>

    <!-- Donor Management -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-gray-800">Donors</h3>
        <span class="text-xs text-gray-500">{{ donorTotal }} donors</span>
      </div>

      <div
        v-if="donorError"
        class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm"
      >
        {{ donorError }}
      </div>

      <input
        v-model="donorSearch"
        type="text"
        placeholder="Search donors by name, street, or city…"
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p v-if="donorSearch" class="text-xs text-gray-500 mb-3">
        {{ donorFiltered }} of {{ donorTotal }} donors
      </p>

      <div v-if="donorLoading" class="py-6 text-center text-gray-400 text-sm">Loading…</div>
      <div v-else-if="filteredDonors.length === 0" class="py-6 text-center text-gray-400 text-sm">
        No donors found.
      </div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 bg-gray-50">
            <th class="text-left px-3 py-2 font-medium text-gray-600">Name</th>
            <th class="text-left px-3 py-2 font-medium text-gray-600">Street</th>
            <th class="text-left px-3 py-2 font-medium text-gray-600">City</th>
            <th class="text-left px-3 py-2 font-medium text-gray-600">Letter Salutation</th>
            <th class="text-left px-3 py-2 font-medium text-gray-600">Address Salutation</th>
            <th class="px-3 py-2 w-20"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="d in filteredDonors"
            :key="d.id"
            class="border-b border-gray-100 hover:bg-gray-50 transition-colors"
          >
            <template v-if="editingDonorId === d.id">
              <td class="px-1 py-1">
                <input v-model="editForm.name" type="text" class="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </td>
              <td class="px-1 py-1">
                <input v-model="editForm.street" type="text" class="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </td>
              <td class="px-1 py-1">
                <input v-model="editForm.city" type="text" class="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </td>
              <td class="px-1 py-1">
                <input v-model="editForm.letterSalutation" type="text" class="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </td>
              <td class="px-1 py-1">
                <input v-model="editForm.addressSalutation" type="text" class="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </td>
              <td class="px-1 py-1 text-right whitespace-nowrap">
                <button :disabled="donorSaving" class="text-green-600 hover:underline text-xs mr-2 disabled:opacity-40" @click="saveEditDonor">Save</button>
                <button class="text-gray-400 hover:underline text-xs" @click="cancelEditDonor">Cancel</button>
              </td>
            </template>
            <template v-else>
              <td class="px-3 py-2 font-medium text-gray-800">{{ d.name }}</td>
              <td class="px-3 py-2 text-gray-600">{{ d.street }}</td>
              <td class="px-3 py-2 text-gray-600">{{ d.city }}</td>
              <td class="px-3 py-2 text-gray-600">{{ d.letterSalutation }}</td>
              <td class="px-3 py-2 text-gray-500">{{ d.addressSalutation ?? '–' }}</td>
              <td class="px-3 py-2 text-right">
                <button class="text-blue-600 hover:underline text-xs" @click="startEditDonor(d)">Edit</button>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="showPreviewModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h3 class="text-lg font-semibold text-gray-800">
            {{
              currentPreviewType === 'ANSCHREIBEN' ? 'Cover Letter Preview' : 'Receipt Preview'
            }}
          </h3>
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
          v-if="previewDataUrl && !previewError && hasPendingUpload(currentPreviewType)"
          class="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 shrink-0"
        >
          <button
            @click="closePreviewModal"
            class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Close
          </button>
          <button
            :disabled="previewLoading || !currentPreviewType"
            @click="saveCurrentPreview"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Save Template
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
