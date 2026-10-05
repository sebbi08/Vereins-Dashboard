<script setup lang="ts">
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, { type DataTableRowEditSaveEvent } from 'primevue/datatable';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import type { EmailSettings, InvoiceRecipientDto, TemplateDto } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import TemplateCard from '../components/TemplateCard.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useNotify } from '../composables/useNotify';
import { useAppStore } from '../stores/app';

const router = useRouter();
const store = useAppStore();
const notify = useNotify();

// ── Template ─────────────────────────────
const template = ref<TemplateDto | null>(null);

async function loadTemplate() {
  try {
    const res = await fetch('/api/templates');
    if (!res.ok) throw new Error('load failed');
    const all = (await res.json()) as TemplateDto[];
    template.value = all.find((t) => t.type === 'RECHNUNG') ?? null;
  } catch {
    notify.error('Error loading template');
  }
}

async function onTemplateUploaded() {
  try {
    await loadTemplate();
  } finally {
    await store.checkTemplates();
  }
}

// ── Email ─────────────────────────────
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
const envMode = ref('');
const emailSaving = ref(false);
const emailTesting = ref(false);

async function loadEmailSettings() {
  try {
    const res = await fetch('/api/email-settings');
    if (res.ok) Object.assign(emailSettings.value, await res.json());
  } catch {
    // keep defaults
  }
}

async function loadEnvMode() {
  try {
    const res = await fetch('/api/email-settings/mode');
    if (res.ok) envMode.value = ((await res.json()) as { mode: string }).mode;
  } catch {
    // unknown mode: no tag
  }
}

async function saveEmailSettings() {
  emailSaving.value = true;
  try {
    const res = await fetch('/api/email-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailSettings.value),
    });
    if (!res.ok) throw new Error('save failed');
    notify.success('Email settings saved');
  } catch {
    notify.error('Error saving email settings');
  } finally {
    emailSaving.value = false;
  }
}

async function sendTestEmail() {
  emailTesting.value = true;
  try {
    const res = await fetch('/api/email-settings/test', { method: 'POST' });
    const data = (await res.json()) as { message?: string; error?: string };
    if (res.ok) notify.success(data.message || 'Test email sent');
    else notify.error(data.error || 'Failed to send test email');
  } catch {
    notify.error('Network error');
  } finally {
    emailTesting.value = false;
  }
}

// ── Recipients ─────────────────────────────
const recipients = ref<InvoiceRecipientDto[]>([]);
const recLoading = ref(false);
const recSearch = ref('');
const editingRows = ref<InvoiceRecipientDto[]>([]);

const filteredRecipients = computed(() => {
  const q = recSearch.value.trim().toLowerCase();
  if (!q) return recipients.value;
  return recipients.value.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.street.toLowerCase().includes(q) ||
      r.city.toLowerCase().includes(q) ||
      (r.email ?? '').toLowerCase().includes(q),
  );
});

const recipientCountText = computed(() =>
  recSearch.value.trim()
    ? `${filteredRecipients.value.length} of ${recipients.value.length} recipients`
    : `${recipients.value.length} ${recipients.value.length === 1 ? 'recipient' : 'recipients'}`,
);

async function loadRecipients() {
  recLoading.value = true;
  try {
    const res = await fetch('/api/invoice-recipient?all=true');
    if (!res.ok) throw new Error('load failed');
    recipients.value = await res.json();
  } catch {
    notify.error('Error loading recipients');
  } finally {
    recLoading.value = false;
  }
}

async function onRowEditSave(event: DataTableRowEditSaveEvent) {
  const edited = event.newData as InvoiceRecipientDto;
  try {
    const res = await fetch(`/api/invoice-recipient/${edited.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: edited.name,
        street: edited.street,
        city: edited.city,
        email: edited.email || null,
        salutation: edited.salutation || null,
      }),
    });
    if (!res.ok) throw new Error('save failed');
    const updated = (await res.json()) as InvoiceRecipientDto;
    recipients.value = recipients.value.map((r) => (r.id === updated.id ? updated : r));
    notify.success('Recipient saved');
  } catch {
    notify.error('Error saving recipient');
  }
}

onMounted(() => {
  void loadTemplate();
  void loadEmailSettings();
  void loadEnvMode();
  void loadRecipients();
});
</script>

<template>
  <div class="page">
    <PageHeader title="Invoice Settings">
      <template #actions>
        <Button
          label="Back"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          @click="router.back()"
        />
      </template>
    </PageHeader>

    <Tabs value="template">
      <TabList>
        <Tab value="template">Template &amp; preview</Tab>
        <Tab value="email">Email</Tab>
        <Tab value="recipients">Recipients</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="template">
          <TemplateCard
            type="RECHNUNG"
            label="Invoice (.docx)"
            accept=".docx"
            preview-title="Invoice Preview"
            :template="template"
            @uploaded="onTemplateUploaded"
          />
        </TabPanel>

        <TabPanel value="email">
          <div class="stack">
            <div class="row gap-sm">
              <h3 class="section-title">Email Settings</h3>
              <Tag
                v-if="envMode"
                :value="envMode === 'production' ? 'PROD' : 'DEV'"
                :severity="envMode === 'production' ? 'success' : 'warn'"
                data-testid="env-mode"
              />
            </div>
            <div class="grid-2">
              <div class="field">
                <label for="smtp-host">SMTP Host</label>
                <InputText
                  id="smtp-host"
                  v-model="emailSettings.smtpHost"
                  placeholder="smtp.example.com"
                  fluid
                />
              </div>
              <div class="field">
                <label for="smtp-port">SMTP Port</label>
                <InputText
                  id="smtp-port"
                  v-model="emailSettings.smtpPort"
                  placeholder="587"
                  fluid
                />
              </div>
              <div class="field">
                <label for="smtp-user">SMTP User</label>
                <InputText
                  id="smtp-user"
                  v-model="emailSettings.smtpUser"
                  placeholder="user@example.com"
                  fluid
                />
              </div>
              <div class="field">
                <label for="smtp-password">SMTP Password</label>
                <InputText
                  id="smtp-password"
                  v-model="emailSettings.smtpPassword"
                  type="password"
                  autocomplete="new-password"
                  fluid
                />
              </div>
            </div>
            <div class="row gap-sm">
              <ToggleSwitch
                v-model="emailSettings.smtpSecure"
                input-id="smtp-secure"
                true-value="true"
                false-value="false"
              />
              <label for="smtp-secure">Use TLS (Secure)</label>
            </div>
            <div class="field">
              <label for="email-subject">
                Email Subject
                <span class="muted">({number}, {salutation}, {name}, {title}, {email})</span>
              </label>
              <InputText
                id="email-subject"
                v-model="emailSettings.emailSubject"
                placeholder="Ihre Rechnung {number}"
                fluid
              />
            </div>
            <div class="field">
              <label for="email-body">
                Email Body
                <span class="muted">({salutation}, {name}, {number}, {title}, {email})</span>
              </label>
              <Textarea
                id="email-body"
                v-model="emailSettings.emailBody"
                rows="5"
                auto-resize
                fluid
              />
            </div>
            <div class="field">
              <label for="email-test-address">
                Test Email Address
                <span class="muted">(dev: all invoices redirected here)</span>
              </label>
              <InputText
                id="email-test-address"
                v-model="emailSettings.emailTestAddress"
                type="email"
                placeholder="test@example.com"
                fluid
              />
            </div>
            <div class="row gap-sm">
              <Button
                label="Save Email Settings"
                icon="pi pi-check"
                :loading="emailSaving"
                data-testid="save-email"
                @click="saveEmailSettings"
              />
              <Button
                label="Send Test Email"
                icon="pi pi-send"
                severity="secondary"
                outlined
                :loading="emailTesting"
                data-testid="test-email"
                @click="sendTestEmail"
              />
            </div>
          </div>
        </TabPanel>

        <TabPanel value="recipients">
          <DataTable
            v-model:editing-rows="editingRows"
            :value="filteredRecipients"
            data-key="id"
            edit-mode="row"
            size="small"
            :loading="recLoading"
            :row-class="() => 'recipient-row'"
            data-testid="recipients-table"
            @row-edit-save="onRowEditSave"
          >
            <template #header>
              <div class="row row--between">
                <IconField>
                  <InputIcon class="pi pi-search" />
                  <InputText
                    v-model="recSearch"
                    placeholder="Search recipients…"
                    aria-label="Search recipients"
                    data-testid="recipient-search"
                  />
                </IconField>
                <span class="muted" data-testid="recipient-count">{{ recipientCountText }}</span>
              </div>
            </template>
            <template #empty>No recipients found.</template>
            <Column field="name" header="Name" sortable>
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column field="street" header="Street">
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column field="city" header="City" sortable>
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column field="salutation" header="Salutation">
              <template #body="{ data }">{{ data.salutation ?? '–' }}</template>
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column field="email" header="E-Mail">
              <template #body="{ data }">{{ data.email ?? '–' }}</template>
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" type="email" size="small" fluid />
              </template>
            </Column>
            <Column :row-editor="true" header-style="width: 7rem" body-style="text-align: right" />
          </DataTable>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
