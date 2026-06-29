<script setup lang="ts">
import type { EmailSettings, InvoiceRecipientDto, TemplateDto } from 'shared';
import { computed, onMounted, ref, watch } from 'vue';
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

// ── Email Settings ─────────────────────────────

const emailSettings = ref<EmailSettings>({
  smtpHost: '',
  smtpPort: '587',
  smtpUser: '',
  smtpPassword: '',
  smtpSecure: 'false',
  emailSubject: '',
  emailBody: '',
  emailTestAddress: '',
});
const emailSaving = ref(false);
const emailSaveSuccess = ref('');
const emailSaveError = ref('');
const emailTestLoading = ref(false);
const emailTestResult = ref<{ success: boolean; message: string } | null>(null);
const envMode = ref<string>('');

async function loadEmailSettings() {
  try {
    const res = await fetch('/api/email-settings');
    if (res.ok) {
      const data = await res.json();
      Object.assign(emailSettings.value, data);
    }
  } catch {
    // ignore
  }
}

async function loadEnvMode() {
  try {
    const res = await fetch('/api/email-settings/mode');
    if (res.ok) {
      const data = await res.json();
      envMode.value = data.mode;
    }
  } catch {
    // ignore
  }
}

async function saveEmailSettings() {
  emailSaving.value = true;
  emailSaveSuccess.value = '';
  emailSaveError.value = '';
  try {
    const res = await fetch('/api/email-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailSettings.value),
    });
    if (!res.ok) throw new Error();
    emailSaveSuccess.value = 'Email settings saved';
  } catch {
    emailSaveError.value = 'Error saving email settings';
  } finally {
    emailSaving.value = false;
  }
}

async function sendTestEmail() {
  emailTestLoading.value = true;
  emailTestResult.value = null;
  try {
    const res = await fetch('/api/email-settings/test', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      emailTestResult.value = { success: true, message: data.message || 'Test email sent' };
    } else {
      emailTestResult.value = {
        success: false,
        message: data.error || 'Failed to send test email',
      };
    }
  } catch {
    emailTestResult.value = { success: false, message: 'Network error' };
  } finally {
    emailTestLoading.value = false;
  }
}

async function loadTemplate() {
  const res = await fetch('/api/templates');
  if (res.ok) {
    const allTemplates: TemplateDto[] = await res.json();
    template.value = allTemplates.find((v) => v.type === 'RECHNUNG') ?? null;
  }
}

onMounted(() => {
  loadTemplate();
  loadRecipients();
  loadEmailSettings();
  loadEnvMode();
});

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

// ── Recipient Management ─────────────────────────────

const recipients = ref<InvoiceRecipientDto[]>([]);
const recLoading = ref(false);
const recError = ref('');
const recSearch = ref('');

const editingRecId = ref<number | null>(null);
const recEditForm = ref({ name: '', street: '', city: '', email: '', salutation: '' });
const recSaving = ref(false);

async function loadRecipients() {
  recLoading.value = true;
  recError.value = '';
  try {
    const res = await fetch('/api/invoice-recipient?all=true');
    recipients.value = await res.json();
  } catch {
    recError.value = 'Error loading recipients';
  } finally {
    recLoading.value = false;
  }
}

const filteredRecipients = ref<InvoiceRecipientDto[]>([]);

function applyRecFilter() {
  const q = recSearch.value.toLowerCase();
  if (!q) {
    filteredRecipients.value = recipients.value;
    return;
  }
  filteredRecipients.value = recipients.value.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.street.toLowerCase().includes(q) ||
      r.city.toLowerCase().includes(q) ||
      (r.email && r.email.toLowerCase().includes(q)),
  );
}

watch([recipients, recSearch], () => applyRecFilter(), { immediate: true });

const recTotal = computed(() => recipients.value.length);
const recFiltered = computed(() => filteredRecipients.value.length);

function startEditRec(r: InvoiceRecipientDto) {
  editingRecId.value = r.id;
  recEditForm.value = {
    name: r.name,
    street: r.street,
    city: r.city,
    email: r.email ?? '',
    salutation: r.salutation ?? '',
  };
}

function cancelEditRec() {
  editingRecId.value = null;
}

async function saveEditRec() {
  if (!editingRecId.value) return;
  recSaving.value = true;
  try {
    const res = await fetch(`/api/invoice-recipient/${editingRecId.value}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: recEditForm.value.name,
        street: recEditForm.value.street,
        city: recEditForm.value.city,
        email: recEditForm.value.email || null,
        salutation: recEditForm.value.salutation || null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      const idx = recipients.value.findIndex((r) => r.id === updated.id);
      if (idx !== -1) recipients.value[idx] = updated;
      editingRecId.value = null;
    }
  } finally {
    recSaving.value = false;
  }
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
        <label class="cursor-pointer" :class="{ 'pointer-events-none opacity-50': uploadLoading }">
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

    <!-- Email Settings -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
      <div class="flex items-center gap-3 mb-4">
        <h3 class="font-semibold text-gray-800">Email Settings</h3>
        <span
          v-if="envMode"
          :class="[
            'text-xs font-medium px-2 py-0.5 rounded-full',
            envMode === 'production'
              ? 'bg-green-100 text-green-700'
              : 'bg-amber-100 text-amber-700',
          ]"
        >
          {{ envMode === 'production' ? 'PROD' : 'DEV' }}
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
          <input
            v-model="emailSettings.smtpHost"
            type="text"
            placeholder="smtp.example.com"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
          <input
            v-model="emailSettings.smtpPort"
            type="text"
            placeholder="587"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">SMTP User</label>
          <input
            v-model="emailSettings.smtpUser"
            type="text"
            placeholder="user@example.com"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
          <input
            v-model="emailSettings.smtpPassword"
            type="password"
            placeholder="••••••••"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div class="mt-4">
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input
            v-model="emailSettings.smtpSecure"
            type="checkbox"
            true-value="true"
            false-value="false"
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span class="text-sm text-gray-700">Use TLS (Secure)</span>
        </label>
      </div>

      <div class="mt-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Email Subject
          <span class="text-xs text-gray-400"
            >({number}, {salutation}, {name}, {title}, {email})</span
          >
        </label>
        <input
          v-model="emailSettings.emailSubject"
          type="text"
          placeholder="Ihre Rechnung {number}"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div class="mt-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Email Body
          <span class="text-xs text-gray-400"
            >({salutation}, {name}, {number}, {title}, {email})</span
          >
        </label>
        <textarea
          v-model="emailSettings.emailBody"
          rows="5"
          placeholder="{salutation}&#10;&#10;anbei erhalten Sie Ihre Rechnung {number}.&#10;&#10;Mit freundlichen Grüßen"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        ></textarea>
      </div>

      <div class="mt-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Test Email Address
          <span class="text-xs text-gray-400">(dev: all invoices redirected here)</span>
        </label>
        <input
          v-model="emailSettings.emailTestAddress"
          type="email"
          placeholder="test@example.com"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div class="flex items-center gap-3 mt-4">
        <button
          type="button"
          class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          :disabled="emailSaving"
          @click="saveEmailSettings"
        >
          {{ emailSaving ? 'Saving…' : 'Save Email Settings' }}
        </button>
        <button
          type="button"
          class="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          :disabled="emailTestLoading"
          @click="sendTestEmail"
        >
          <span
            v-if="emailTestLoading"
            class="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-b-transparent inline-block mr-1"
          ></span>
          {{ emailTestLoading ? 'Sending…' : 'Send Test Email' }}
        </button>
      </div>

      <p v-if="emailSaveSuccess" class="text-green-600 text-xs mt-2">{{ emailSaveSuccess }}</p>
      <p v-if="emailSaveError" class="text-red-600 text-xs mt-2">{{ emailSaveError }}</p>
      <div
        v-if="emailTestResult"
        :class="['text-xs mt-2', emailTestResult.success ? 'text-green-600' : 'text-red-600']"
      >
        {{ emailTestResult.message }}
      </div>
    </div>

    <!-- Recipient Management -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-gray-800">Recipients</h3>
        <span class="text-xs text-gray-500">{{ recTotal }} recipients</span>
      </div>

      <div
        v-if="recError"
        class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm"
      >
        {{ recError }}
      </div>

      <input
        v-model="recSearch"
        type="text"
        placeholder="Search recipients by name, street, or city…"
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p v-if="recSearch" class="text-xs text-gray-500 mb-3">
        {{ recFiltered }} of {{ recTotal }} recipients
      </p>

      <div v-if="recLoading" class="py-6 text-center text-gray-400 text-sm">Loading…</div>
      <div
        v-else-if="filteredRecipients.length === 0"
        class="py-6 text-center text-gray-400 text-sm"
      >
        No recipients found.
      </div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 bg-gray-50">
            <th class="text-left px-3 py-2 font-medium text-gray-600">Name</th>
            <th class="text-left px-3 py-2 font-medium text-gray-600">Street</th>
            <th class="text-left px-3 py-2 font-medium text-gray-600">City</th>
            <th class="text-left px-3 py-2 font-medium text-gray-600">Salutation</th>
            <th class="text-left px-3 py-2 font-medium text-gray-600">E-Mail</th>
            <th class="px-3 py-2 w-20"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in filteredRecipients"
            :key="r.id"
            class="border-b border-gray-100 hover:bg-gray-50 transition-colors"
          >
            <template v-if="editingRecId === r.id">
              <td class="px-1 py-1">
                <input
                  v-model="recEditForm.name"
                  type="text"
                  class="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </td>
              <td class="px-1 py-1">
                <input
                  v-model="recEditForm.street"
                  type="text"
                  class="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </td>
              <td class="px-1 py-1">
                <input
                  v-model="recEditForm.city"
                  type="text"
                  class="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </td>
              <td class="px-1 py-1">
                <input
                  v-model="recEditForm.salutation"
                  type="text"
                  class="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </td>
              <td class="px-1 py-1">
                <input
                  v-model="recEditForm.email"
                  type="email"
                  class="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </td>
              <td class="px-1 py-1 text-right whitespace-nowrap">
                <button
                  :disabled="recSaving"
                  class="text-green-600 hover:underline text-xs mr-2 disabled:opacity-40"
                  @click="saveEditRec"
                >
                  Save
                </button>
                <button class="text-gray-400 hover:underline text-xs" @click="cancelEditRec">
                  Cancel
                </button>
              </td>
            </template>
            <template v-else>
              <td class="px-3 py-2 font-medium text-gray-800">{{ r.name }}</td>
              <td class="px-3 py-2 text-gray-600">{{ r.street }}</td>
              <td class="px-3 py-2 text-gray-600">{{ r.city }}</td>
              <td class="px-3 py-2 text-gray-600">{{ r.salutation ?? '–' }}</td>
              <td class="px-3 py-2 text-gray-500">{{ r.email ?? '–' }}</td>
              <td class="px-3 py-2 text-right">
                <button class="text-blue-600 hover:underline text-xs" @click="startEditRec(r)">
                  Edit
                </button>
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
          <h3 class="text-lg font-semibold text-gray-800">Invoice Preview</h3>
          <button @click="closePreviewModal" class="text-gray-400 hover:text-gray-600">×</button>
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

          <div v-else-if="!previewLoading && !previewError" class="text-center text-gray-500 py-12">
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
