import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DataTable from 'primevue/datatable';
import DatePicker from 'primevue/datepicker';
import type { DonorDto, SystemSettings, TemplateDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import TemplateCard from '../components/TemplateCard.vue';
import { useAppStore } from '../stores/app';
import SettingsView from '../views/SettingsView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('vue-router', () => ({ useRouter: vi.fn() }));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));
const { confirmAction } = vi.hoisted(() => ({ confirmAction: vi.fn() }));
vi.mock('../composables/useConfirmAction', () => ({
  useConfirmAction: () => ({ confirmAction }),
}));

interface ViewVM {
  settings: SystemSettings;
  donors: DonorDto[];
}

function vm(wrapper: VueWrapper): ViewVM {
  return wrapper.vm as unknown as ViewVM;
}

const receiptTemplate: TemplateDto = {
  id: 2,
  type: 'QUITTUNG',
  version: 4,
  fileName: 'quittung.pdf',
  active: true,
  uploadedAt: '2026-10-01T10:00:00.000Z',
};

const settings: SystemSettings = {
  treasurer: 'Kim Kasse',
  charitablePurpose: 'Förderung des Sports',
  taxOfficeName: 'FA Mitte',
  taxNumber: '12/345/67890',
  exemptionDate: '2024-05-02',
  assessmentPeriod: '2021–2023',
};

const donors: DonorDto[] = [
  {
    id: 1,
    name: 'Hans Schmidt',
    street: 'Musterstr. 1',
    city: 'Berlin',
    letterSalutation: 'Sehr geehrter Herr Schmidt',
    addressSalutation: null,
  },
  {
    id: 2,
    name: 'Maria Müller',
    street: 'Testgasse 2',
    city: 'Hamburg',
    letterSalutation: 'Sehr geehrte Frau Müller',
    addressSalutation: 'Frau',
  },
];

type Reply = { status: number; body?: unknown };
let replies: Record<string, Reply>;

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const key = `${init?.method ?? 'GET'} ${url}`;
  const reply = replies[key];
  if (!reply) throw new Error(`Unexpected fetch: ${key}`);
  return {
    ok: reply.status < 400,
    status: reply.status,
    json: () => Promise.resolve(reply.body),
  } as Response;
});

function bodyOf(key: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => `${init?.method ?? 'GET'} ${url}` === key,
  );
  return JSON.parse(String(call?.[1]?.body));
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(SettingsView, { attachTo: document.body, global: withPrimeVue() });
  await flushPromises();
  return wrapper;
}

function donorsTable(wrapper: VueWrapper) {
  return wrapper
    .findAllComponents(DataTable)
    .find((c) => c.attributes('data-testid') === 'donors-table')!;
}

beforeEach(() => {
  replies = {
    'GET /api/settings': { status: 200, body: settings },
    'GET /api/templates': { status: 200, body: [receiptTemplate] },
    'GET /api/donor?all=true': { status: 200, body: donors },
  };
  fetchMock.mockClear();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({ back: vi.fn() } as unknown as ReturnType<
    typeof useRouter
  >);
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsView', () => {
  it('shows heading, tabs and section headings', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Donation Receipt Settings');
    const tabs = wrapper.findAll('[role="tab"]').map((t) => t.text());
    expect(tabs).toEqual(['Association data', 'Donors', 'Templates']);
    expect(wrapper.findAll('h3').map((h) => h.text())).toEqual(
      expect.arrayContaining(['Association Data (Pre-fill)', 'Templates']),
    );
  });

  it('labels every association field', async () => {
    const wrapper = await mountView();
    for (const [label, id] of [
      ['Treasurer', 'treasurer'],
      ['Charitable Purpose', 'charitable-purpose'],
      ['Tax Office', 'tax-office'],
      ['Tax Number', 'tax-number'],
      ['Exemption Date', 'exemption-date'],
      ['Assessment Period', 'assessment-period'],
    ]) {
      const el = wrapper.findAll('label').find((l) => l.text() === label);
      expect(el?.attributes('for')).toBe(id);
      expect(wrapper.find(`#${id}`).exists()).toBe(true);
    }
  });

  it('loads and saves the association data', async () => {
    replies['PUT /api/settings'] = { status: 200, body: {} };
    const wrapper = await mountView();
    expect((wrapper.find('#treasurer').element as HTMLInputElement).value).toBe('Kim Kasse');

    await wrapper.find('#treasurer').setValue('Max Mustermann');
    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();

    expect(bodyOf('PUT /api/settings')).toEqual({ ...settings, treasurer: 'Max Mustermann' });
    expect(notify.success).toHaveBeenCalledWith('Settings saved');
  });

  it('clears the exemption date to an empty string', async () => {
    replies['PUT /api/settings'] = { status: 200, body: {} };
    const wrapper = await mountView();
    const picker = wrapper
      .findAllComponents(DatePicker)
      .find((c) => c.attributes('data-testid') === 'exemption-date')!;

    picker.vm.$emit('update:modelValue', null);
    await flushPromises();
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(bodyOf('PUT /api/settings').exemptionDate).toBe('');
  });

  it('blocks saving after a failed settings load', async () => {
    replies['GET /api/settings'] = { status: 500, body: {} };
    replies['PUT /api/settings'] = { status: 200, body: {} };
    const wrapper = await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading settings');
    expect(wrapper.find('[data-testid="settings-load-error"]').text()).toContain(
      'Association data could not be loaded. Reload the page to try again.',
    );
    expect(wrapper.find('[data-testid="save-settings"]').attributes('disabled')).toBeDefined();

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('shows no load error after a successful load', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="settings-load-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-settings"]').attributes('disabled')).toBeUndefined();
  });

  it('reports save errors', async () => {
    replies['PUT /api/settings'] = { status: 500, body: {} };
    const wrapper = await mountView();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Error saving settings');
  });

  it('shows both template cards with their templates', async () => {
    const wrapper = await mountView();
    const cards = wrapper.findAllComponents(TemplateCard);
    expect(cards.map((c) => c.props())).toEqual([
      {
        type: 'ANSCHREIBEN',
        label: 'Cover Letter (.docx)',
        accept: '.docx',
        previewTitle: 'Cover Letter Preview',
        template: null,
      },
      {
        type: 'QUITTUNG',
        label: 'Donation Receipt (.pdf)',
        accept: '.pdf',
        previewTitle: 'Receipt Preview',
        template: receiptTemplate,
      },
    ]);
  });

  it('reloads templates and refreshes the store after an upload', async () => {
    const wrapper = await mountView();
    const checkTemplates = vi.spyOn(useAppStore(), 'checkTemplates').mockResolvedValue();
    fetchMock.mockClear();

    wrapper.findAllComponents(TemplateCard)[1].vm.$emit('uploaded');
    await flushPromises();

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/templates');
    expect(checkTemplates).toHaveBeenCalled();
  });

  it('still refreshes the store when reloading templates fails', async () => {
    const wrapper = await mountView();
    const checkTemplates = vi.spyOn(useAppStore(), 'checkTemplates').mockResolvedValue();
    replies['GET /api/templates'] = { status: 500, body: {} };

    wrapper.findAllComponents(TemplateCard)[0].vm.$emit('uploaded');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Error loading templates');
    expect(checkTemplates).toHaveBeenCalled();
  });

  it('lists, counts and searches donors', async () => {
    const wrapper = await mountView();
    expect(wrapper.findAll('.donor-row')).toHaveLength(2);
    expect(wrapper.find('[data-testid="donor-count"]').text()).toBe('2 donors');

    await wrapper.find('[data-testid="donor-filter"]').setValue('HAMBURG');
    await flushPromises();
    expect(wrapper.findAll('.donor-row')).toHaveLength(1);
    expect(wrapper.find('[data-testid="donor-count"]').text()).toBe('1 of 2 donors');
  });

  it('uses the singular for one donor', async () => {
    replies['GET /api/donor?all=true'] = { status: 200, body: [donors[0]] };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="donor-count"]').text()).toBe('1 donor');
  });

  it('saves an edited donor', async () => {
    replies['PATCH /api/donor/2'] = {
      status: 200,
      body: { ...donors[1], city: 'Bremen', addressSalutation: null },
    };
    const wrapper = await mountView();

    donorsTable(wrapper).vm.$emit('row-edit-save', {
      originalEvent: new Event('click'),
      data: donors[1],
      newData: { ...donors[1], city: 'Bremen', addressSalutation: '' },
      index: 1,
    });
    await flushPromises();

    expect(bodyOf('PATCH /api/donor/2')).toEqual({
      name: 'Maria Müller',
      street: 'Testgasse 2',
      city: 'Bremen',
      letterSalutation: 'Sehr geehrte Frau Müller',
      addressSalutation: null,
    });
    expect(vm(wrapper).donors[1].city).toBe('Bremen');
    expect(notify.success).toHaveBeenCalledWith('Donor saved');
  });

  it('reports donor load and save errors', async () => {
    replies['GET /api/donor?all=true'] = { status: 500, body: {} };
    replies['PATCH /api/donor/1'] = { status: 400, body: {} };
    const wrapper = await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading donors');

    donorsTable(wrapper).vm.$emit('row-edit-save', {
      originalEvent: new Event('click'),
      data: donors[0],
      newData: donors[0],
      index: 0,
    });
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Error saving donor');
  });

  describe('deleting a donor', () => {
    it('deletes a donor after confirmation and removes the row', async () => {
      replies['DELETE /api/donor/2'] = { status: 204 };
      const wrapper = await mountView();

      await wrapper.find('[data-testid="delete-donor-2"]').trigger('click');
      await flushPromises();

      expect(confirmAction).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Maria Müller') }),
      );
      expect(wrapper.findAll('.donor-row')).toHaveLength(1);
      expect(notify.success).toHaveBeenCalledWith('Donor deleted');
    });

    it('does nothing when the confirmation is declined', async () => {
      confirmAction.mockResolvedValue(false);
      const wrapper = await mountView();

      await wrapper.find('[data-testid="delete-donor-2"]').trigger('click');
      await flushPromises();

      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
      expect(wrapper.findAll('.donor-row')).toHaveLength(2);
    });

    it('explains why a donor with receipts is kept', async () => {
      replies['DELETE /api/donor/1'] = {
        status: 409,
        body: { error: 'This donor has donation receipts and cannot be deleted' },
      };
      const wrapper = await mountView();

      await wrapper.find('[data-testid="delete-donor-1"]').trigger('click');
      await flushPromises();

      expect(notify.error).toHaveBeenCalledWith(
        'This donor has donation receipts and cannot be deleted',
      );
      expect(wrapper.findAll('.donor-row')).toHaveLength(2);
    });
  });
});
