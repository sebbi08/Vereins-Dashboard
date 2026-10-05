import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DatePicker from 'primevue/datepicker';
import InputNumber from 'primevue/inputnumber';
import type { DonationReceiptDto, DonorDto, ReceiptInputs } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import DonorAutocomplete from '../components/DonorAutocomplete.vue';
import { useAppStore } from '../stores/app';
import { toIsoDate } from '../utils/format';
import DonationReceiptFormView from '../views/DonationReceiptFormView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('vue-router', () => ({ useRoute: vi.fn(), useRouter: vi.fn() }));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

const mockPush = vi.fn();
const mockReplace = vi.fn();

interface FormVM {
  inputs: ReceiptInputs;
  donor: DonorDto | null;
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

const hans: DonorDto = {
  id: 7,
  name: 'Hans Schmidt',
  street: 'Musterstr. 1',
  city: 'Berlin',
  letterSalutation: 'Sehr geehrter Herr Schmidt',
  addressSalutation: 'Herrn',
};

const settings = {
  treasurer: 'Kim Kasse',
  charitablePurpose: 'Förderung des Sports',
  taxOfficeName: 'FA Mitte',
  taxNumber: '12/345/67890',
  exemptionDate: '2024-05-02',
  assessmentPeriod: '2021–2023',
};

const revisionInputs: ReceiptInputs = {
  name: 'Hans Schmidt (alt)',
  street: 'Altweg 3',
  city: 'Berlin',
  letterSalutation: 'Lieber Hans',
  addressSalutation: null,
  donationAmountCents: 25000,
  donationDate: '2026-02-01T00:00:00.000Z',
  withCoverLetter: true,
  treasurer: 'Old Treasurer',
  charitablePurpose: 'Jugendarbeit',
  taxOfficeName: 'FA Alt',
  taxNumber: '11/111/11111',
  exemptionDate: '2023-01-10',
  assessmentPeriod: '2020–2022',
};

function receiptDto(inputs: ReceiptInputs = revisionInputs): DonationReceiptDto {
  return {
    id: 3,
    number: 'SQ-2026-003',
    status: 'AKTIV',
    donor: hans,
    donationDate: '2026-02-01T00:00:00.000Z',
    createdAt: '2026-02-01T10:00:00.000Z',
    activeRevision: {
      id: 31,
      revisionNumber: 1,
      status: 'AKTIV',
      pdfStatus: 'OK',
      pdfError: null,
      pdfTechError: null,
      inputs,
      filePath: 'receipts/31.pdf',
      createdAt: '2026-02-01T10:00:00.000Z',
    },
    revisions: [],
  };
}

const today = toIsoDate(new Date());

function setRoute(params: Record<string, string>, query: Record<string, string> = {}) {
  vi.mocked(useRoute).mockReturnValue({ params, query } as unknown as ReturnType<typeof useRoute>);
}

async function mountForm() {
  const wrapper = mount(DonationReceiptFormView, {
    attachTo: document.body,
    global: withPrimeVue(),
  });
  await flushPromises();
  return wrapper;
}

function picker(wrapper: VueWrapper) {
  return wrapper.findComponent(DonorAutocomplete);
}

function datePicker(wrapper: VueWrapper, testid: string) {
  return wrapper.findAllComponents(DatePicker).find((c) => c.attributes('data-testid') === testid)!;
}

async function setAmount(wrapper: VueWrapper, euros: number | null) {
  wrapper.findComponent(InputNumber).vm.$emit('update:modelValue', euros);
  await flushPromises();
}

async function submit(wrapper: VueWrapper) {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  replies = { 'GET /api/settings': { status: 200, body: settings } };
  fetchMock.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  setActivePinia(createPinia());
  useAppStore().receiptTemplateAvailable = true;
  setRoute({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DonationReceiptFormView — new receipt', () => {
  it('redirects to the list without a receipt template', async () => {
    useAppStore().receiptTemplateAvailable = false;
    await mountForm();
    expect(mockReplace).toHaveBeenCalledWith('/donation-receipt');
  });

  it('pre-fills association data, today and the cover letter', async () => {
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('New Donation Receipt');
    expect(wrapper.find('[data-testid="submit"]').text()).toContain('Create Receipt');
    expect(vm(wrapper).inputs).toMatchObject({
      treasurer: 'Kim Kasse',
      taxOfficeName: 'FA Mitte',
      exemptionDate: '2024-05-02',
      donationDate: today,
      withCoverLetter: true,
    });
    expect(wrapper.find('[data-testid="donor-search"]').exists()).toBe(true);
  });

  it('ignores empty settings values', async () => {
    replies['GET /api/settings'] = { status: 200, body: { ...settings, treasurer: '' } };
    const wrapper = await mountForm();
    expect(vm(wrapper).inputs.treasurer).toBe('');
    expect(vm(wrapper).inputs.taxOfficeName).toBe('FA Mitte');
  });

  it('fills and locks the donor fields when a donor is picked', async () => {
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('update:modelValue', hans);
    await flushPromises();

    expect(vm(wrapper).inputs).toMatchObject({
      name: 'Hans Schmidt',
      street: 'Musterstr. 1',
      city: 'Berlin',
      letterSalutation: 'Sehr geehrter Herr Schmidt',
      addressSalutation: 'Herrn',
    });
    expect(wrapper.find('#name').attributes('disabled')).toBeDefined();
  });

  it('unlinks and unlocks the donor when the user searches again', async () => {
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('update:modelValue', hans);
    await flushPromises();
    picker(wrapper).vm.$emit('update:modelValue', null);
    await flushPromises();

    expect(vm(wrapper).donor).toBeNull();
    expect(wrapper.find('#name').attributes('disabled')).toBeUndefined();
  });

  it('starts a new donor with the typed name and a default letter salutation', async () => {
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('neu', { name: 'Neue Person', street: '', city: '' });
    await flushPromises();
    expect(vm(wrapper).inputs.name).toBe('Neue Person');
    expect(vm(wrapper).inputs.letterSalutation).toBe('Sehr geehrte Damen und Herren');
    expect(wrapper.find('#name').attributes('disabled')).toBeUndefined();
  });

  it('stores euro amounts as cents', async () => {
    const wrapper = await mountForm();
    await setAmount(wrapper, 12.5);
    expect(vm(wrapper).inputs.donationAmountCents).toBe(1250);
    await setAmount(wrapper, null);
    expect(vm(wrapper).inputs.donationAmountCents).toBe(0);
  });

  it('writes picked dates as YYYY-MM-DD and clears the exemption date to ""', async () => {
    const wrapper = await mountForm();
    datePicker(wrapper, 'donation-date').vm.$emit('update:modelValue', new Date(2026, 2, 1));
    datePicker(wrapper, 'exemption-date').vm.$emit('update:modelValue', null);
    await flushPromises();
    expect(vm(wrapper).inputs.donationDate).toBe('2026-03-01');
    expect(vm(wrapper).inputs.exemptionDate).toBe('');
  });

  it('requires an amount and a letter salutation for a cover letter', async () => {
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('neu', { name: 'Neue Person', street: '', city: '' });
    await flushPromises();
    vm(wrapper).inputs.letterSalutation = '';

    await submit(wrapper);

    expect(calls()).toEqual(['GET /api/settings']);
    expect(wrapper.find('[data-testid="error-amount"]').text()).toBe('Amount is required');
    expect(wrapper.find('[data-testid="error-letter-salutation"]').text()).toBe(
      'Letter Salutation is required when creating a cover letter.',
    );

    vm(wrapper).inputs.letterSalutation = 'Liebe Freunde';
    await flushPromises();
    expect(wrapper.find('[data-testid="error-letter-salutation"]').exists()).toBe(false);
  });

  it('requires a donation date', async () => {
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('update:modelValue', hans);
    await setAmount(wrapper, 100);
    datePicker(wrapper, 'donation-date').vm.$emit('update:modelValue', null);
    await flushPromises();

    await submit(wrapper);

    expect(calls()).toEqual(['GET /api/settings']);
    expect(wrapper.find('[data-testid="error-donation-date"]').text()).toBe(
      'Donation Date is required',
    );
  });

  it('does not require a letter salutation without a cover letter', async () => {
    replies['POST /api/donation-receipt'] = {
      status: 201,
      body: { receiptId: 12, pdfStatus: 'OK' },
    };
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('neu', { name: 'Neue Person', street: '', city: '' });
    await flushPromises();
    Object.assign(vm(wrapper).inputs, { letterSalutation: '', withCoverLetter: false });
    await setAmount(wrapper, 50);

    await submit(wrapper);

    expect(calls()).toContain('POST /api/donation-receipt');
  });

  it('creates a receipt for a picked donor and opens it', async () => {
    replies['POST /api/donation-receipt'] = {
      status: 201,
      body: { receiptId: 12, pdfStatus: 'OK' },
    };
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('update:modelValue', hans);
    await setAmount(wrapper, 100);

    await submit(wrapper);

    const body = bodyOf('POST /api/donation-receipt');
    expect(body.donorId).toBe(7);
    expect(body.donorData).toBeUndefined();
    expect((body.inputs as ReceiptInputs).donationAmountCents).toBe(10000);
    expect(notify.success).toHaveBeenCalledWith('Receipt saved successfully.');
    expect(mockPush).toHaveBeenCalledWith('/donation-receipt/12');
  });

  it('creates a new donor from the fields', async () => {
    replies['POST /api/donation-receipt'] = {
      status: 201,
      body: { receiptId: 12, pdfStatus: 'OK' },
    };
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('neu', { name: 'Neue Person', street: '', city: '' });
    await flushPromises();
    await wrapper.find('#street').setValue('Weg 1');
    await wrapper.find('#city').setValue('Stadt');
    await setAmount(wrapper, 20);

    await submit(wrapper);

    const body = bodyOf('POST /api/donation-receipt');
    expect(body.donorId).toBeUndefined();
    expect(body.donorData).toEqual({
      name: 'Neue Person',
      street: 'Weg 1',
      city: 'Stadt',
      letterSalutation: 'Sehr geehrte Damen und Herren',
      addressSalutation: '',
    });
  });

  it('warns about a failed PDF and reports a donor update', async () => {
    replies['POST /api/donation-receipt'] = {
      status: 201,
      body: {
        receiptId: 12,
        pdfStatus: 'FAILED',
        pdfError: 'LibreOffice missing',
        donorUpdated: true,
      },
    };
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('update:modelValue', hans);
    await setAmount(wrapper, 100);
    await submit(wrapper);

    expect(notify.warn).toHaveBeenCalledWith('LibreOffice missing');
    expect(notify.info).toHaveBeenCalledWith('Donor master data updated.');
    expect(notify.success).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/donation-receipt/12');
  });

  it('shows server errors and stays on the form', async () => {
    replies['POST /api/donation-receipt'] = { status: 400, body: { error: 'Street is required' } };
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('update:modelValue', hans);
    await setAmount(wrapper, 100);
    await submit(wrapper);

    expect(notify.error).toHaveBeenCalledWith('Street is required');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('reports a network error while loading', async () => {
    replies = {};
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="load-error"]').text()).toContain(
      'Network error while loading',
    );
  });
});

describe('DonationReceiptFormView — new revision', () => {
  beforeEach(() => {
    setRoute({ id: '3' });
    replies['GET /api/donation-receipt/3'] = { status: 200, body: receiptDto() };
  });

  it('loads the revision and refreshes the donor fields from the donor record', async () => {
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Create New Revision');
    expect(wrapper.find('[data-testid="submit"]').text()).toContain('Save Revision');
    expect(wrapper.find('[data-testid="donor-search"]').exists()).toBe(false);
    expect(vm(wrapper).inputs).toMatchObject({
      name: 'Hans Schmidt',
      street: 'Musterstr. 1',
      letterSalutation: 'Sehr geehrter Herr Schmidt',
      addressSalutation: 'Herrn',
      treasurer: 'Old Treasurer',
      donationAmountCents: 25000,
      donationDate: '2026-02-01',
    });
    expect(wrapper.find('[data-testid="defaults-hint"]').exists()).toBe(true);
  });

  it('shows no hint when the revision already matches the donor', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: receiptDto({
        ...revisionInputs,
        name: hans.name,
        street: hans.street,
        city: hans.city,
        letterSalutation: hans.letterSalutation,
        addressSalutation: hans.addressSalutation,
      }),
    };
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="defaults-hint"]').exists()).toBe(false);
  });

  it('keeps the donor fields editable and posts the edits for the in-place update', async () => {
    replies['POST /api/donation-receipt/3/revision'] = {
      status: 201,
      body: { revisionId: 40, pdfStatus: 'OK', donorUpdated: true },
    };
    const wrapper = await mountForm();
    expect(wrapper.find('#name').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="donor-edit-hint"]').exists()).toBe(true);

    await wrapper.find('#city').setValue('Potsdam');
    await submit(wrapper);

    const body = bodyOf('POST /api/donation-receipt/3/revision');
    expect(Object.keys(body)).toEqual(['inputs']);
    expect((body.inputs as ReceiptInputs).city).toBe('Potsdam');
    expect(notify.info).toHaveBeenCalledWith('Donor master data updated.');
    expect(mockPush).toHaveBeenCalledWith('/donation-receipt/3');
  });

  it('shows a load error', async () => {
    replies['GET /api/donation-receipt/3'] = { status: 404, body: { error: 'Receipt not found' } };
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="load-error"]').text()).toContain(
      'Receipt could not be loaded',
    );
  });
});

describe('DonationReceiptFormView — failed load', () => {
  it('blocks saving after a failed receipt load', async () => {
    setRoute({ id: '3' });
    replies['GET /api/donation-receipt/3'] = { status: 404, body: { error: 'Receipt not found' } };
    const wrapper = await mountForm();

    await submit(wrapper);

    expect(calls()).not.toContain('POST /api/donation-receipt/3/revision');
    expect(wrapper.find('[data-testid="submit"]').attributes('disabled')).toBeDefined();
  });
});

describe('DonationReceiptFormView — copy', () => {
  beforeEach(() => {
    setRoute({}, { copyFrom: '3' });
    replies['GET /api/donation-receipt/3'] = { status: 200, body: receiptDto() };
  });

  it('copies with today as donation date and the linked, locked donor', async () => {
    replies['POST /api/donation-receipt'] = {
      status: 201,
      body: { receiptId: 13, pdfStatus: 'OK' },
    };
    const wrapper = await mountForm();

    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Duplicate Receipt');
    expect(vm(wrapper).inputs.donationDate).toBe(today);
    expect(vm(wrapper).inputs.donationAmountCents).toBe(25000);
    expect(vm(wrapper).inputs.name).toBe('Hans Schmidt');
    expect(wrapper.find('#name').attributes('disabled')).toBeDefined();

    await submit(wrapper);
    expect(bodyOf('POST /api/donation-receipt').donorId).toBe(7);
    expect(mockPush).toHaveBeenCalledWith('/donation-receipt/13');
  });
});
