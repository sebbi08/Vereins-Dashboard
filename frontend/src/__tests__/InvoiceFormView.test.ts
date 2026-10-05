import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { InstructorInvoicePrefillDto, InvoiceDraftDto, InvoiceInputs } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import InvoiceFormView from '../views/InvoiceFormView.vue';

vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(),
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();

interface FormVM {
  inputs: InvoiceInputs;
  error: string;
  success: string;
}

function vm(wrapper: VueWrapper): FormVM {
  return wrapper.vm as unknown as FormVM;
}

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

function calls(): string[] {
  return fetchMock.mock.calls.map(
    ([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url}`,
  );
}

function bodyOf(key: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url}` === key,
  );
  return JSON.parse(String((call?.[1] as RequestInit).body));
}

const draftDto: InvoiceDraftDto = {
  id: 42,
  recipient: {
    id: 5,
    name: 'Draft Firma',
    street: 'Weg 1',
    city: 'Stadt',
    email: 'd@example.com',
    salutation: null,
  },
  inputs: {
    salutation: '',
    name: 'Draft Firma',
    street: 'Weg 1',
    city: 'Stadt',
    title: 'Draft Titel',
    lineItems: [{ text: 'Pos', priceInCents: 5000 }],
    vat: 19,
    directDebit: false,
    email: 'd@example.com',
    emailSalutation: 'Hallo',
  },
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
};

function setRoute(params: Record<string, string>) {
  (useRoute as ReturnType<typeof vi.fn>).mockReturnValue({ params, query: {} });
}

async function mountForm() {
  const wrapper = mount(InvoiceFormView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  replies = {};
  fetchMock.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
  (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  });
  setActivePinia(createPinia());
  useAppStore().invoiceTemplateAvailable = true;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('InvoiceFormView — new invoice', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    setRoute({});
  });

  it('"Save as Draft" posts to the draft endpoint and returns to the list', async () => {
    replies['POST /api/invoice-draft'] = { status: 201, body: { draftId: 1 } };
    const wrapper = await mountForm();
    vm(wrapper).inputs.name = 'Neue Firma';

    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual(['POST /api/invoice-draft']);
    expect(bodyOf('POST /api/invoice-draft').recipientData).toMatchObject({ name: 'Neue Firma' });
    expect(mockPush).toHaveBeenCalledWith('/invoice');
  });

  it('"Save as Draft" requires a name', async () => {
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual([]);
    expect(vm(wrapper).error).toBe('Name is required');
  });

  it('does not disable native validation in new mode', async () => {
    const wrapper = await mountForm();
    expect(wrapper.find('form').attributes('novalidate')).toBeUndefined();
  });

  it('save-draft is a plain button in new mode', async () => {
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="save-draft"]').attributes('type')).toBe('button');
  });

  it('still shows the invoice date field and Create Invoice button', async () => {
    const wrapper = await mountForm();
    expect(wrapper.find('input[type="date"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Create Invoice');
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(false);
  });

  it('edits line item text in a textarea and keeps line breaks', async () => {
    replies['POST /api/invoice-draft'] = { status: 201, body: { draftId: 1 } };
    const wrapper = await mountForm();
    vm(wrapper).inputs.name = 'Neue Firma';

    const textarea = wrapper.find('[data-testid="line-item-text"]');
    expect(textarea.element.tagName).toBe('TEXTAREA');
    await textarea.setValue('Zeile 1\nZeile 2');
    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    const inputs = bodyOf('POST /api/invoice-draft').inputs as InvoiceInputs;
    expect(inputs.lineItems[0].text).toBe('Zeile 1\nZeile 2');
  });
});

describe('InvoiceFormView — draft mode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    setRoute({ draftId: '42' });
    replies['GET /api/invoice-draft/42'] = { status: 200, body: draftDto };
  });

  it('loads the draft, hides the date field and shows draft actions', async () => {
    const wrapper = await mountForm();

    expect(vm(wrapper).inputs.title).toBe('Draft Titel');
    expect(vm(wrapper).inputs.name).toBe('Draft Firma');
    expect(wrapper.find('input[type="date"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="draft-date-hint"]').text()).toContain(
      'Invoice date is set on activation',
    );
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="delete-draft"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Create Invoice');
  });

  it('keeps recipient fields editable', async () => {
    const wrapper = await mountForm();
    expect(wrapper.findAll('input[disabled]')).toHaveLength(0);
  });

  it('save-draft is the submit button in draft mode and saves exactly once', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    const wrapper = await mountForm();
    const button = wrapper.find('[data-testid="save-draft"]');
    expect(button.attributes('type')).toBe('submit');

    await button.trigger('click');
    await flushPromises();

    expect(calls().filter((c) => c.startsWith('PUT'))).toHaveLength(1);
  });

  it('incomplete draft: form has novalidate and save-draft PUTs exactly once', async () => {
    replies['GET /api/invoice-draft/42'] = {
      status: 200,
      body: {
        ...draftDto,
        recipient: { ...draftDto.recipient, street: '', city: '' },
        inputs: { ...draftDto.inputs, street: '', city: '', title: '' },
      },
    };
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    const wrapper = await mountForm();

    expect(wrapper.find('form').attributes('novalidate')).toBeDefined();
    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    expect(calls().filter((c) => c.startsWith('PUT'))).toHaveLength(1);
  });

  it('shows an error when the draft does not exist', async () => {
    replies['GET /api/invoice-draft/42'] = { status: 404, body: { error: 'Draft not found' } };
    const wrapper = await mountForm();

    expect(vm(wrapper).error).toBe('Draft not found');
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(false);
  });

  it('"Save Draft" PUTs with the linked recipient id and stays on the page', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual(['GET /api/invoice-draft/42', 'PUT /api/invoice-draft/42']);
    expect(bodyOf('PUT /api/invoice-draft/42').recipientId).toBe(5);
    expect(vm(wrapper).success).toBe('Draft saved.');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('form submit in draft mode saves the draft instead of creating an invoice', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    const wrapper = await mountForm();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls()).toEqual(['GET /api/invoice-draft/42', 'PUT /api/invoice-draft/42']);
  });

  it('Activate saves first, then activates and opens the new invoice', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    replies['POST /api/invoice-draft/42/activate'] = { status: 201, body: { invoiceId: 99 } };
    const wrapper = await mountForm();
    vm(wrapper).inputs.title = 'Geändert';

    await wrapper.find('[data-testid="activate-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual([
      'GET /api/invoice-draft/42',
      'PUT /api/invoice-draft/42',
      'POST /api/invoice-draft/42/activate',
    ]);
    expect((bodyOf('PUT /api/invoice-draft/42').inputs as InvoiceInputs).title).toBe('Geändert');
    expect(mockPush).toHaveBeenCalledWith('/invoice/99');
  });

  it('Activate does nothing when the confirmation is cancelled', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="activate-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual(['GET /api/invoice-draft/42']);
  });

  it('Activate shows the server validation error and stays on the draft', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    replies['POST /api/invoice-draft/42/activate'] = {
      status: 400,
      body: { error: 'Street is required' },
    };
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="activate-draft"]').trigger('click');
    await flushPromises();

    expect(vm(wrapper).error).toBe('Street is required');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('Delete removes the draft and returns to the list', async () => {
    replies['DELETE /api/invoice-draft/42'] = { status: 204 };
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="delete-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toContain('DELETE /api/invoice-draft/42');
    expect(mockPush).toHaveBeenCalledWith('/invoice');
  });
});

const prefill: InstructorInvoicePrefillDto = {
  recipient: {
    id: 7,
    name: 'Anna Alt',
    street: 'Hauptstr. 1',
    city: '12345 Berlin',
    email: 'anna@example.org',
    salutation: 'Frau',
  },
  title: 'Raummiete',
  lineItems: [
    {
      text: 'Raummiete 6 Monate (7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €)',
      priceInCents: 175500,
    },
  ],
};

interface InvoiceFormVM {
  inputs: {
    name: string;
    street: string;
    title: string;
    invoiceDate: string;
    lineItems: unknown[];
  };
  recipient: { id: number } | null;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

describe('InvoiceFormView — prefill from instructor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/templates') return Promise.resolve(jsonResponse([{ type: 'RECHNUNG' }]));
        if (url === '/api/instructor/5/invoice-prefill')
          return Promise.resolve(jsonResponse(prefill));
        return Promise.resolve(jsonResponse({}, false));
      }),
    );
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: vi.fn(), replace: vi.fn() });
    (useRoute as ReturnType<typeof vi.fn>).mockReturnValue({
      params: {},
      query: { fromInstructor: '5' },
    });
    setActivePinia(createPinia());
  });

  it('fills recipient, title, line item and today as invoice date', async () => {
    const wrapper = mount(InvoiceFormView);
    await flushPromises();

    const vm = wrapper.vm as unknown as InvoiceFormVM;
    expect(vm.recipient?.id).toBe(7);
    expect(vm.inputs.name).toBe('Anna Alt');
    expect(vm.inputs.street).toBe('Hauptstr. 1');
    expect(vm.inputs.title).toBe('Raummiete');
    expect(vm.inputs.lineItems).toEqual(prefill.lineItems);
    expect(vm.inputs.invoiceDate).toBe(new Date().toISOString().split('T')[0]);
  });

  it('still offers "Save as Draft" for the prefilled new invoice', async () => {
    const wrapper = mount(InvoiceFormView);
    await flushPromises();

    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Create Invoice');
  });
});
