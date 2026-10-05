import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DataTable from 'primevue/datatable';
import type { EmailSettings, InvoiceRecipientDto, TemplateDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import TemplateCard from '../components/TemplateCard.vue';
import { useAppStore } from '../stores/app';
import InvoiceSettingsView from '../views/InvoiceSettingsView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('vue-router', () => ({ useRouter: vi.fn() }));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

interface ViewVM {
  emailSettings: EmailSettings;
  recipients: InvoiceRecipientDto[];
}

const template: TemplateDto = {
  id: 1,
  type: 'RECHNUNG',
  version: 2,
  fileName: 'r.docx',
  active: true,
  uploadedAt: '2026-10-01T10:00:00.000Z',
};

const recipients: InvoiceRecipientDto[] = [
  {
    id: 1,
    name: 'Anna Alt',
    street: 'Hauptstr. 1',
    city: 'Berlin',
    email: 'anna@x.de',
    salutation: null,
  },
  { id: 2, name: 'Bernd Bach', street: 'Weg 2', city: 'Hamburg', email: null, salutation: 'Herr' },
];

const emailSettings: EmailSettings = {
  smtpHost: 'smtp.example.org',
  smtpPort: '587',
  smtpUser: 'user',
  smtpPassword: 'secret',
  smtpSecure: 'true',
  emailSubject: 'Rechnung {number}',
  emailBody: 'Hallo',
  emailTestAddress: 'test@example.org',
};

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
  const wrapper = mount(InvoiceSettingsView, { attachTo: document.body, global: withPrimeVue() });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  replies = {
    'GET /api/templates': { status: 200, body: [template] },
    'GET /api/email-settings': { status: 200, body: emailSettings },
    'GET /api/email-settings/mode': { status: 200, body: { mode: 'development' } },
    'GET /api/invoice-recipient?all=true': { status: 200, body: recipients },
  };
  fetchMock.mockClear();
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

describe('InvoiceSettingsView', () => {
  it('shows heading, tabs and the invoice template card', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Invoice Settings');
    expect(wrapper.text()).toContain('Template & preview');
    expect(wrapper.text()).toContain('Email');
    expect(wrapper.text()).toContain('Recipients');
    const card = wrapper.findComponent(TemplateCard);
    expect(card.props()).toMatchObject({
      type: 'RECHNUNG',
      label: 'Invoice (.docx)',
      accept: '.docx',
    });
    expect(card.props('template')).toEqual(template);
  });

  it('reloads templates and the store after an upload', async () => {
    const wrapper = await mountView();
    const checkTemplates = vi.spyOn(useAppStore(), 'checkTemplates').mockResolvedValue();
    fetchMock.mockClear();

    wrapper.findComponent(TemplateCard).vm.$emit('uploaded');
    await flushPromises();

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/templates');
    expect(checkTemplates).toHaveBeenCalled();
  });

  it('still refreshes the store when reloading the template fails after an upload', async () => {
    const wrapper = await mountView();
    const checkTemplates = vi.spyOn(useAppStore(), 'checkTemplates').mockResolvedValue();
    delete replies['GET /api/templates'];
    notify.error.mockReset();

    wrapper.findComponent(TemplateCard).vm.$emit('uploaded');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Error loading template');
    expect(checkTemplates).toHaveBeenCalled();
  });

  it('reports a rejected template list', async () => {
    replies['GET /api/templates'] = { status: 500, body: {} };
    await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading template');
  });

  it('loads and saves the email settings', async () => {
    replies['PUT /api/email-settings'] = { status: 200, body: {} };
    const wrapper = await mountView();
    expect((wrapper.vm as unknown as ViewVM).emailSettings.smtpHost).toBe('smtp.example.org');
    expect(wrapper.find('[data-testid="env-mode"]').text()).toBe('DEV');

    await wrapper.find('#smtp-host').setValue('mail.example.org');
    await wrapper.find('[data-testid="save-email"]').trigger('click');
    await flushPromises();

    expect(bodyOf('PUT /api/email-settings')).toMatchObject({
      smtpHost: 'mail.example.org',
      smtpSecure: 'true',
    });
    expect(notify.success).toHaveBeenCalledWith('Email settings saved');
  });

  it('reports a failed save', async () => {
    replies['PUT /api/email-settings'] = { status: 500, body: {} };
    const wrapper = await mountView();
    await wrapper.find('[data-testid="save-email"]').trigger('click');
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Error saving email settings');
  });

  it.each([
    ['a failed response', { status: 500, body: {} }],
    ['a network error', undefined],
  ] as const)('blocks saving email settings after %s on load', async (_name, reply) => {
    if (reply) replies['GET /api/email-settings'] = reply;
    else delete replies['GET /api/email-settings'];
    replies['PUT /api/email-settings'] = { status: 200, body: {} };
    replies['POST /api/email-settings/test'] = { status: 200, body: { message: 'Sent' } };
    const wrapper = await mountView();

    expect(notify.error).toHaveBeenCalledWith('Error loading email settings');
    expect(wrapper.find('[data-testid="email-load-error"]').text()).toContain(
      'Email settings could not be loaded. Reload the page to try again.',
    );
    const save = wrapper.find('[data-testid="save-email"]');
    expect(save.attributes('disabled')).toBeDefined();
    await save.trigger('click');
    await wrapper.vm.$nextTick();
    (wrapper.vm as unknown as { saveEmailSettings: () => Promise<void> }).saveEmailSettings();
    await flushPromises();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);

    const test = wrapper.find('[data-testid="test-email"]');
    expect(test.attributes('disabled')).toBeUndefined();
    await test.trigger('click');
    await flushPromises();
    expect(notify.success).toHaveBeenCalledWith('Sent');
  });

  it('shows no email load error after a successful load', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="email-load-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-email"]').attributes('disabled')).toBeUndefined();
  });

  it.each([
    [
      { status: 200, body: { message: 'Sent to test@example.org' } },
      'success',
      'Sent to test@example.org',
    ],
    [{ status: 500, body: { error: 'Auth failed' } }, 'error', 'Auth failed'],
  ] as const)('sends a test email (%#)', async (reply, kind, message) => {
    replies['POST /api/email-settings/test'] = reply;
    const wrapper = await mountView();
    await wrapper.find('[data-testid="test-email"]').trigger('click');
    await flushPromises();
    expect(notify[kind]).toHaveBeenCalledWith(message);
  });

  it('uses the singular for a single recipient', async () => {
    replies['GET /api/invoice-recipient?all=true'] = { status: 200, body: [recipients[0]] };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="recipient-count"]').text()).toBe('1 recipient');
    expect(wrapper.find('[data-testid="recipient-search"]').attributes('placeholder')).toBe(
      'Search recipients…',
    );
  });

  it('lists and searches recipients', async () => {
    const wrapper = await mountView();
    expect(wrapper.findAll('.recipient-row')).toHaveLength(2);
    expect(wrapper.find('[data-testid="recipient-count"]').text()).toBe('2 recipients');

    await wrapper.find('[data-testid="recipient-search"]').setValue('hamburg');
    await flushPromises();

    expect(wrapper.findAll('.recipient-row')).toHaveLength(1);
    expect(wrapper.find('[data-testid="recipient-count"]').text()).toBe('1 of 2 recipients');
  });

  it('saves an edited recipient', async () => {
    replies['PATCH /api/invoice-recipient/2'] = {
      status: 200,
      body: { ...recipients[1], city: 'Bremen', email: null },
    };
    const wrapper = await mountView();
    const table = wrapper
      .findAllComponents(DataTable)
      .find((c) => c.attributes('data-testid') === 'recipients-table')!;

    table.vm.$emit('row-edit-save', {
      originalEvent: new Event('click'),
      data: recipients[1],
      newData: { ...recipients[1], city: 'Bremen', email: '' },
      index: 1,
    });
    await flushPromises();

    expect(bodyOf('PATCH /api/invoice-recipient/2')).toEqual({
      name: 'Bernd Bach',
      street: 'Weg 2',
      city: 'Bremen',
      email: null,
      salutation: 'Herr',
    });
    expect((wrapper.vm as unknown as ViewVM).recipients[1].city).toBe('Bremen');
    expect(notify.success).toHaveBeenCalledWith('Recipient saved');
  });

  it('reports a failed recipient save', async () => {
    replies['PATCH /api/invoice-recipient/1'] = { status: 400, body: {} };
    const wrapper = await mountView();
    const table = wrapper
      .findAllComponents(DataTable)
      .find((c) => c.attributes('data-testid') === 'recipients-table')!;
    table.vm.$emit('row-edit-save', {
      originalEvent: new Event('click'),
      data: recipients[0],
      newData: recipients[0],
      index: 0,
    });
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Error saving recipient');
  });
});
