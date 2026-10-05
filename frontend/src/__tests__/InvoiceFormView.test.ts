import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AutoComplete from 'primevue/autocomplete';
import InputNumber from 'primevue/inputnumber';
import type {
  InstructorInvoicePrefillDto,
  InvoiceDraftDto,
  InvoiceInputs,
  InvoiceRecipientDto,
} from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import InvoiceFormView from '../views/InvoiceFormView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify, confirmAction } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  confirmAction: vi.fn(),
}));

vi.mock('vue-router', () => ({ useRoute: vi.fn(), useRouter: vi.fn() }));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('../composables/useConfirmAction', () => ({
  useConfirmAction: () => ({ confirmAction }),
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();

interface FormVM {
  inputs: InvoiceInputs;
  recipient: InvoiceRecipientDto | null;
  loadError: string;
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

const anna: InvoiceRecipientDto = {
  id: 7,
  name: 'Anna Alt',
  street: 'Hauptstr. 1',
  city: '12345 Berlin',
  email: 'anna@example.org',
  salutation: 'Frau',
};

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

const today = new Date().toISOString().split('T')[0];

function setRoute(params: Record<string, string>, query: Record<string, string> = {}) {
  vi.mocked(useRoute).mockReturnValue({ params, query } as unknown as ReturnType<typeof useRoute>);
}

async function mountForm() {
  const wrapper = mount(InvoiceFormView, { attachTo: document.body, global: withPrimeVue() });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  replies = {};
  fetchMock.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  setActivePinia(createPinia());
  useAppStore().invoiceTemplateAvailable = true;
  setRoute({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceFormView — new invoice', () => {
  it('redirects to the list without an invoice template', async () => {
    useAppStore().invoiceTemplateAvailable = false;
    await mountForm();
    expect(mockReplace).toHaveBeenCalledWith('/invoice');
  });

  it('shows date field, "Save as Draft" (plain button) and "Create Invoice"', async () => {
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="invoice-date"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-draft"]').attributes('type')).toBe('button');
    expect(wrapper.find('[data-testid="submit"]').text()).toContain('Create Invoice');
    expect(wrapper.find('form').attributes('novalidate')).toBeUndefined();
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(false);
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
    expect(wrapper.find('[data-testid="error-name"]').text()).toBe('Name is required');
  });

  it('creating requires title and line item texts', async () => {
    const wrapper = await mountForm();
    vm(wrapper).inputs.name = 'Neue Firma';
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(calls()).toEqual([]);
    expect(wrapper.find('[data-testid="error-title"]').text()).toBe('Title is required');
    expect(wrapper.find('[data-testid="error-line-items"]').text()).toBe(
      'All line items need text',
    );
  });

  it('creates the invoice and opens it', async () => {
    replies['POST /api/invoice'] = { status: 201, body: { invoiceId: 77, pdfStatus: 'OK' } };
    const wrapper = await mountForm();
    Object.assign(vm(wrapper).inputs, { name: 'Neue Firma', title: 'Miete' });
    vm(wrapper).inputs.lineItems[0].text = 'Raum';

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls()).toEqual(['POST /api/invoice']);
    expect(notify.success).toHaveBeenCalledWith('Invoice saved successfully.');
    expect(mockPush).toHaveBeenCalledWith('/invoice/77');
  });

  it('warns when the PDF failed after saving', async () => {
    replies['POST /api/invoice'] = {
      status: 201,
      body: { invoiceId: 77, pdfStatus: 'FAILED', pdfError: 'LibreOffice missing' },
    };
    const wrapper = await mountForm();
    Object.assign(vm(wrapper).inputs, { name: 'Neue Firma', title: 'Miete' });
    vm(wrapper).inputs.lineItems[0].text = 'Raum';
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(notify.warn).toHaveBeenCalledWith('LibreOffice missing');
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

  it('stores euro prices as cents and computes the gross amount', async () => {
    const wrapper = await mountForm();
    wrapper.findComponent(InputNumber).vm.$emit('update:modelValue', 12.5);
    await flushPromises();
    expect(vm(wrapper).inputs.lineItems[0].priceInCents).toBe(1250);
    expect(wrapper.find('[data-testid="gross"]').text()).toContain('14,88');

    vm(wrapper).inputs.vat = 7;
    await flushPromises();
    expect(wrapper.find('[data-testid="gross"]').text()).toContain('13,38');

    wrapper.findComponent(InputNumber).vm.$emit('update:modelValue', null);
    await flushPromises();
    expect(vm(wrapper).inputs.lineItems[0].priceInCents).toBe(0);
  });

  it('searches recipients and fills and locks the fields on selection', async () => {
    replies['GET /api/invoice/recipient?search=An'] = { status: 200, body: [anna] };
    const wrapper = await mountForm();
    const autocomplete = wrapper.findComponent(AutoComplete);

    autocomplete.vm.$emit('complete', { originalEvent: new Event('input'), query: 'An' });
    await flushPromises();
    expect(calls()).toEqual(['GET /api/invoice/recipient?search=An']);

    autocomplete.vm.$emit('option-select', { originalEvent: new Event('click'), value: anna });
    await flushPromises();

    expect(vm(wrapper).recipient?.id).toBe(7);
    expect(vm(wrapper).inputs).toMatchObject({
      name: 'Anna Alt',
      street: 'Hauptstr. 1',
      city: '12345 Berlin',
      email: 'anna@example.org',
      salutation: 'Frau',
    });
    expect(wrapper.find('#name').attributes('disabled')).toBeDefined();
  });
});

describe('InvoiceFormView — copy and revision', () => {
  const invoiceDto = {
    id: 3,
    recipient: anna,
    activeRevision: {
      inputs: { ...draftDto.inputs, invoiceDate: '2026-01-15T00:00:00.000Z', name: 'Anna Alt' },
    },
  };

  it('copies an invoice with today as date', async () => {
    setRoute({}, { copyFrom: '3' });
    replies['GET /api/invoice/3'] = { status: 200, body: invoiceDto };
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Duplicate Invoice');
    expect(vm(wrapper).inputs.title).toBe('Draft Titel');
    expect(vm(wrapper).inputs.invoiceDate).toBe(today);
    expect(vm(wrapper).recipient?.id).toBe(7);
  });

  it('creates a revision with the revision date and posts only the inputs', async () => {
    setRoute({ id: '3' });
    replies['GET /api/invoice/3'] = { status: 200, body: invoiceDto };
    replies['POST /api/invoice/3/revision'] = { status: 201, body: { pdfStatus: 'OK' } };
    const wrapper = await mountForm();

    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Create New Revision');
    expect(vm(wrapper).inputs.invoiceDate).toBe('2026-01-15');
    expect(wrapper.find('[data-testid="recipient-search"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(false);

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(Object.keys(bodyOf('POST /api/invoice/3/revision'))).toEqual(['inputs']);
    expect(mockPush).toHaveBeenCalledWith('/invoice/3');
  });
});

describe('InvoiceFormView — draft mode', () => {
  beforeEach(() => {
    setRoute({ draftId: '42' });
    replies['GET /api/invoice-draft/42'] = { status: 200, body: draftDto };
  });

  it('loads the draft, hides the date field and shows draft actions', async () => {
    const wrapper = await mountForm();

    expect(vm(wrapper).inputs.title).toBe('Draft Titel');
    expect(vm(wrapper).inputs.name).toBe('Draft Firma');
    expect(wrapper.find('[data-testid="invoice-date"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="draft-date-hint"]').text()).toContain(
      'Invoice date is set on activation',
    );
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="delete-draft"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="submit"]').exists()).toBe(false);
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

    expect(wrapper.find('[data-testid="load-error"]').text()).toContain('Draft not found');
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(false);
  });

  it('Enter in a draft that failed to load saves nothing', async () => {
    replies['GET /api/invoice-draft/42'] = { status: 404, body: { error: 'Draft not found' } };
    const wrapper = await mountForm();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(calls()).toEqual(['GET /api/invoice-draft/42']);
  });

  it('"Save Draft" PUTs with the linked recipient id and stays on the page', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual(['GET /api/invoice-draft/42', 'PUT /api/invoice-draft/42']);
    expect(bodyOf('PUT /api/invoice-draft/42').recipientId).toBe(5);
    expect(notify.success).toHaveBeenCalledWith('Draft saved.');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('form submit (Enter) in draft mode saves the draft instead of creating an invoice', async () => {
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

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ header: 'Activate draft', acceptLabel: 'Activate' }),
    );
    expect(calls()).toEqual([
      'GET /api/invoice-draft/42',
      'PUT /api/invoice-draft/42',
      'POST /api/invoice-draft/42/activate',
    ]);
    expect((bodyOf('PUT /api/invoice-draft/42').inputs as InvoiceInputs).title).toBe('Geändert');
    expect(mockPush).toHaveBeenCalledWith('/invoice/99');
  });

  it('Activate does nothing when the confirmation is cancelled', async () => {
    confirmAction.mockResolvedValue(false);
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

    expect(notify.error).toHaveBeenCalledWith('Street is required');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('Delete asks, removes the draft and returns to the list', async () => {
    replies['DELETE /api/invoice-draft/42'] = { status: 204 };
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="delete-draft"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(calls()).toContain('DELETE /api/invoice-draft/42');
    expect(mockPush).toHaveBeenCalledWith('/invoice');
  });
});

describe('InvoiceFormView — prefill from instructor', () => {
  const prefill: InstructorInvoicePrefillDto = {
    recipient: anna,
    title: 'Raummiete',
    lineItems: [{ text: 'Raummiete 6 Monate\n7,5 h/Woche', priceInCents: 175500 }],
  };

  beforeEach(() => {
    setRoute({}, { fromInstructor: '5' });
  });

  it('fills recipient, title, line item and today as invoice date', async () => {
    replies['GET /api/instructor/5/invoice-prefill'] = { status: 200, body: prefill };
    const wrapper = await mountForm();

    expect(vm(wrapper).recipient?.id).toBe(7);
    expect(vm(wrapper).inputs.name).toBe('Anna Alt');
    expect(vm(wrapper).inputs.title).toBe('Raummiete');
    expect(vm(wrapper).inputs.lineItems).toEqual(prefill.lineItems);
    expect(vm(wrapper).inputs.invoiceDate).toBe(today);
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(true);
  });

  it('reports a failed prefill', async () => {
    replies['GET /api/instructor/5/invoice-prefill'] = { status: 404, body: {} };
    await mountForm();
    expect(notify.error).toHaveBeenCalledWith('Could not load instructor data');
  });
});
