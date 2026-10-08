<script setup lang="ts">
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, { type DataTableRowEditSaveEvent } from 'primevue/datatable';
import DatePicker from 'primevue/datepicker';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import type { DonorDto, SystemSettings, TemplateDto, TemplateType } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import TemplateCard from '../components/TemplateCard.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import { errorMessage, requestJson } from '../utils/requestJson';
import { useAppStore } from '../stores/app';
import { fromIsoDate, toIsoDate } from '../utils/format';

const router = useRouter();
const store = useAppStore();
const notify = useNotify();
const { confirmAction } = useConfirmAction();

// ── Association data ─────────────────────────────
const settings = ref<SystemSettings>({
  treasurer: '',
  charitablePurpose: '',
  taxOfficeName: '',
  taxNumber: '',
  exemptionDate: '',
  assessmentPeriod: '',
});
const saving = ref(false);
const settingsLoaded = ref(false);
const loadFailed = ref(false);

const exemptionDateValue = computed<Date | null>({
  get: () => fromIsoDate(settings.value.exemptionDate),
  set: (date) => {
    settings.value.exemptionDate = date ? toIsoDate(date) : '';
  },
});

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('load failed');
    Object.assign(settings.value, await res.json());
    settingsLoaded.value = true;
  } catch {
    loadFailed.value = true;
    notify.error('Error loading settings');
  }
}

async function saveSettings() {
  if (!settingsLoaded.value) return;
  saving.value = true;
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings.value),
    });
    if (!res.ok) throw new Error('save failed');
    notify.success('Settings saved');
  } catch {
    notify.error('Error saving settings');
  } finally {
    saving.value = false;
  }
}

// ── Templates ─────────────────────────────
const TEMPLATE_CARDS: {
  type: TemplateType;
  label: string;
  accept: string;
  previewTitle: string;
}[] = [
  {
    type: 'ANSCHREIBEN',
    label: 'Cover Letter (.docx)',
    accept: '.docx',
    previewTitle: 'Cover Letter Preview',
  },
  {
    type: 'QUITTUNG',
    label: 'Donation Receipt (.pdf)',
    accept: '.pdf',
    previewTitle: 'Receipt Preview',
  },
];

const templates = ref<TemplateDto[]>([]);

function templateOf(type: TemplateType): TemplateDto | null {
  return templates.value.find((t) => t.type === type) ?? null;
}

async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    if (!res.ok) throw new Error('load failed');
    templates.value = await res.json();
  } catch {
    notify.error('Error loading templates');
  }
}

async function onTemplateUploaded() {
  try {
    await loadTemplates();
  } finally {
    await store.checkTemplates();
  }
}

// ── Donors ─────────────────────────────
const donors = ref<DonorDto[]>([]);
const donorLoading = ref(false);
const donorSearch = ref('');
const editingRows = ref<DonorDto[]>([]);

const filteredDonors = computed(() => {
  const q = donorSearch.value.trim().toLowerCase();
  if (!q) return donors.value;
  return donors.value.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.street.toLowerCase().includes(q) ||
      d.city.toLowerCase().includes(q),
  );
});

const donorCountText = computed(() =>
  donorSearch.value.trim()
    ? `${filteredDonors.value.length} of ${donors.value.length} donors`
    : `${donors.value.length} ${donors.value.length === 1 ? 'donor' : 'donors'}`,
);

async function loadDonors() {
  donorLoading.value = true;
  try {
    const res = await fetch('/api/donor?all=true');
    if (!res.ok) throw new Error('load failed');
    donors.value = await res.json();
  } catch {
    notify.error('Error loading donors');
  } finally {
    donorLoading.value = false;
  }
}

/** Only donors without documents can be deleted; the server explains when one is in use. */
async function deleteDonor(item: { id: number; name: string }) {
  const confirmed = await confirmAction({
    message: `Delete donor ${item.name}? This cannot be undone.`,
    header: 'Delete donor',
    acceptLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) return;
  try {
    const res = await requestJson(`/api/donor/${item.id}`, { method: 'DELETE' });
    if (!res.ok) {
      notify.error(errorMessage(res));
      return;
    }
    donors.value = donors.value.filter((entry) => entry.id !== item.id);
    notify.success('Donor deleted');
  } catch {
    notify.error('Network error while deleting');
  }
}

async function onRowEditSave(event: DataTableRowEditSaveEvent) {
  const edited = event.newData as DonorDto;
  try {
    const res = await fetch(`/api/donor/${edited.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: edited.name,
        street: edited.street,
        city: edited.city,
        letterSalutation: edited.letterSalutation,
        addressSalutation: edited.addressSalutation || null,
      }),
    });
    if (!res.ok) throw new Error('save failed');
    const updated = (await res.json()) as DonorDto;
    donors.value = donors.value.map((d) => (d.id === updated.id ? updated : d));
    notify.success('Donor saved');
  } catch {
    notify.error('Error saving donor');
  }
}

onMounted(() => {
  void loadSettings();
  void loadTemplates();
  void loadDonors();
});
</script>

<template>
  <div class="page">
    <PageHeader title="Donation Receipt Settings">
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

    <Tabs value="association">
      <TabList>
        <Tab value="association">Association data</Tab>
        <Tab value="donors">Donors</Tab>
        <Tab value="templates">Templates</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="association">
          <form class="stack" @submit.prevent="saveSettings">
            <h3 class="section-title">Association Data (Pre-fill)</h3>
            <Message v-if="loadFailed" severity="error" data-testid="settings-load-error">
              Association data could not be loaded. Reload the page to try again.
            </Message>
            <div class="grid-2">
              <div class="field">
                <label for="treasurer">Treasurer</label>
                <InputText id="treasurer" v-model="settings.treasurer" fluid />
              </div>
              <div class="field">
                <label for="charitable-purpose">Charitable Purpose</label>
                <InputText id="charitable-purpose" v-model="settings.charitablePurpose" fluid />
              </div>
              <div class="field">
                <label for="tax-office">Tax Office</label>
                <InputText id="tax-office" v-model="settings.taxOfficeName" fluid />
              </div>
              <div class="field">
                <label for="tax-number">Tax Number</label>
                <InputText id="tax-number" v-model="settings.taxNumber" fluid />
              </div>
              <div class="field">
                <label for="exemption-date">Exemption Date</label>
                <DatePicker
                  v-model="exemptionDateValue"
                  input-id="exemption-date"
                  data-testid="exemption-date"
                  date-format="dd.mm.yy"
                  show-icon
                  show-clear
                  fluid
                />
              </div>
              <div class="field">
                <label for="assessment-period">Assessment Period</label>
                <InputText id="assessment-period" v-model="settings.assessmentPeriod" fluid />
              </div>
            </div>
            <div class="row settings-actions">
              <Button
                type="submit"
                label="Save"
                icon="pi pi-check"
                :loading="saving"
                :disabled="!settingsLoaded"
                data-testid="save-settings"
              />
            </div>
          </form>
        </TabPanel>

        <TabPanel value="donors">
          <DataTable
            v-model:editing-rows="editingRows"
            :value="filteredDonors"
            data-key="id"
            edit-mode="row"
            size="small"
            :loading="donorLoading"
            :row-class="() => 'donor-row'"
            data-testid="donors-table"
            @row-edit-save="onRowEditSave"
          >
            <template #header>
              <div class="row row--between">
                <IconField>
                  <InputIcon class="pi pi-search" />
                  <InputText
                    v-model="donorSearch"
                    placeholder="Search donors…"
                    aria-label="Search donors"
                    data-testid="donor-filter"
                  />
                </IconField>
                <span class="muted" data-testid="donor-count">{{ donorCountText }}</span>
              </div>
            </template>
            <template #empty>No donors found.</template>
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
            <Column field="letterSalutation" header="Letter Salutation">
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column field="addressSalutation" header="Address Salutation">
              <template #body="{ data }">{{ data.addressSalutation || '–' }}</template>
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column :row-editor="true" header-style="width: 7rem" body-style="text-align: right" />
            <Column header-style="width: 3rem" body-style="text-align: right">
              <template #body="{ data }">
                <Button
                  icon="pi pi-trash"
                  text
                  rounded
                  severity="danger"
                  :aria-label="`Delete ${data.name}`"
                  :data-testid="`delete-donor-${data.id}`"
                  @click="deleteDonor(data)"
                />
              </template>
            </Column>
          </DataTable>
        </TabPanel>

        <TabPanel value="templates">
          <div class="stack">
            <h3 class="section-title">Templates</h3>
            <TemplateCard
              v-for="card in TEMPLATE_CARDS"
              :key="card.type"
              :type="card.type"
              :label="card.label"
              :accept="card.accept"
              :preview-title="card.previewTitle"
              :template="templateOf(card.type)"
              @uploaded="onTemplateUploaded"
            />
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.settings-actions {
  justify-content: flex-end;
}
</style>
