import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { InstructorDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import RecipientPicker from '../components/RecipientPicker.vue';
import InstructorFormView from '../views/InstructorFormView.vue';
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

const existing: InstructorDto = {
  id: 5,
  recipient: {
    id: 7,
    name: 'Anna Alt',
    street: 'Hauptstr. 1',
    city: '12345 Berlin',
    email: null,
    salutation: null,
  },
  hourlyRateCents: 1200,
  months: 6,
  timeBlocks: [{ weekday: 'MO', start: '08:00', end: '15:30', breaks: [] }],
  calculation: { netMinutesPerWeek: 450, monthlyCents: 29250, totalCents: 175500 },
  createdAt: '2026-10-05T10:00:00Z',
  updatedAt: '2026-10-05T10:00:00Z',
};

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let templates: { type: string }[];

const defaultFetch = (url: string, init?: RequestInit): Promise<Response> => {
  if (url === '/api/instructor/settings') {
    return Promise.resolve(jsonResponse({ weeksPerMonth: 3.25, invoiceTemplate: null }));
  }
  if (url === '/api/instructor/5' && !init?.method) return Promise.resolve(jsonResponse(existing));
  if (url === '/api/instructor' && init?.method === 'POST') {
    return Promise.resolve(jsonResponse({ id: 9 }));
  }
  if (url === '/api/instructor/5' && init?.method === 'PUT') {
    return Promise.resolve(jsonResponse({ id: 5 }));
  }
  if (url === '/api/instructor/5' && init?.method === 'DELETE') {
    return Promise.resolve({ ok: true, status: 204 } as Response);
  }
  if (url === '/api/templates') return Promise.resolve(jsonResponse(templates));
  return Promise.resolve(jsonResponse({}, false));
};

async function setup(params: Record<string, string> = {}) {
  vi.mocked(useRoute).mockReturnValue({ params, query: {} } as unknown as ReturnType<
    typeof useRoute
  >);
  const wrapper = mount(InstructorFormView, { attachTo: document.body, global: withPrimeVue() });
  await flushPromises();
  return wrapper;
}

async function setNumber(
  wrapper: VueWrapper,
  testid: 'hourly-rate' | 'months',
  value: number | null,
) {
  await wrapper.find(`#${testid}`).setValue(value === null ? '' : String(value).replace('.', ','));
  await flushPromises();
}

function inputValue(wrapper: VueWrapper, id: 'hourly-rate' | 'months'): string {
  return (wrapper.find(`#${id}`).element as HTMLInputElement).value;
}

async function addMondayBlock(wrapper: VueWrapper, start: string, end: string) {
  await wrapper.find('[data-testid="add-block-MO"]').trigger('click');
  const blocks = wrapper.find('[data-testid="day-MO"]').findAll('[data-testid="block"]');
  const last = blocks[blocks.length - 1];
  await last.find('[data-testid="block-start"]').setValue(start);
  await last.find('[data-testid="block-end"]').setValue(end);
}

async function fillValidNew(wrapper: VueWrapper) {
  await wrapper.find('[data-testid="recipient-name"]').setValue('Anna Alt');
  await wrapper.find('[data-testid="recipient-street"]').setValue('Hauptstr. 1');
  await wrapper.find('[data-testid="recipient-city"]').setValue('12345 Berlin');
  await setNumber(wrapper, 'hourly-rate', 12.5);
  await setNumber(wrapper, 'months', 6);
  await addMondayBlock(wrapper, '08:00', '12:00');
}

function requestsWith(method: string) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === method);
}

beforeEach(() => {
  templates = [{ type: 'RECHNUNG' }];
  fetchMock = vi.fn(defaultFetch);
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<
    typeof useRouter
  >);
  mockPush.mockReset();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InstructorFormView', () => {
  it('titles the new form and shows the required-field errors', async () => {
    const wrapper = await setup();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('New instructor');
    expect(wrapper.find('[data-testid="recipient-error"]').text()).toBe(
      'Recipient name is required',
    );
    expect(wrapper.find('[data-testid="hourly-rate-error"]').text()).toBe(
      'Hourly rate must be greater than 0',
    );
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeDefined();
  });

  it('updates the live summary while editing', async () => {
    const wrapper = await setup();
    expect(wrapper.text()).toContain('Summary (net, 3,25 weeks/month)');
    expect(wrapper.find('[data-testid="summary-total"]').text()).toBe('—');

    await setNumber(wrapper, 'hourly-rate', 12);
    await setNumber(wrapper, 'months', 6);
    await addMondayBlock(wrapper, '08:00', '15:30');

    expect(wrapper.find('[data-testid="summary-hours"]').text()).toContain('7,5');
    expect(wrapper.find('[data-testid="summary-monthly"]').text()).toContain('292,50');
    expect(wrapper.find('[data-testid="summary-total"]').text()).toContain('1.755,00');
  });

  it('shows the gross total with 19 % VAT', async () => {
    const wrapper = await setup();
    expect(wrapper.text()).toContain('Total (gross, 19 % VAT)');
    expect(wrapper.find('[data-testid="summary-gross"]').text()).toBe('—');

    await setNumber(wrapper, 'hourly-rate', 12);
    await setNumber(wrapper, 'months', 6);
    await addMondayBlock(wrapper, '08:00', '15:30');

    // 1.755,00 € net + 333,45 € VAT
    expect(wrapper.find('[data-testid="summary-gross"]').text()).toContain('2.088,45');
  });

  it('stores a euro rate with decimals as cents', async () => {
    const wrapper = await setup();
    await setNumber(wrapper, 'hourly-rate', 12.5);
    expect((wrapper.vm as unknown as { hourlyRateCents: number }).hourlyRateCents).toBe(1250);
    await setNumber(wrapper, 'hourly-rate', null);
    expect((wrapper.vm as unknown as { hourlyRateCents: number }).hourlyRateCents).toBe(0);
  });

  it('reports months below 1', async () => {
    const wrapper = await setup();
    await setNumber(wrapper, 'months', null);
    expect(wrapper.find('[data-testid="months-error"]').text()).toBe(
      'Months must be a whole number of at least 1',
    );
  });

  it('shows an overlap error and disables save', async () => {
    const wrapper = await setup();
    await wrapper.find('[data-testid="recipient-name"]').setValue('Anna Alt');
    await setNumber(wrapper, 'hourly-rate', 12);
    await addMondayBlock(wrapper, '08:00', '12:00');
    await addMondayBlock(wrapper, '11:00', '13:00');

    expect(wrapper.text()).toContain('Time blocks on the same day must not overlap');
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeDefined();
  });

  it('Save is the submit button of the form so Enter saves', async () => {
    const wrapper = await setup();
    expect(wrapper.find('[data-testid="save"]').attributes('type')).toBe('submit');
  });

  it('posts the expected body for a new instructor and returns to the list', async () => {
    const wrapper = await setup();
    await fillValidNew(wrapper);

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const [post] = requestsWith('POST');
    expect(post[0]).toBe('/api/instructor');
    expect(JSON.parse(String(post[1].body))).toEqual({
      recipientData: {
        name: 'Anna Alt',
        street: 'Hauptstr. 1',
        city: '12345 Berlin',
        email: null,
        salutation: null,
      },
      hourlyRateCents: 1250,
      months: 6,
      timeBlocks: [{ weekday: 'MO', start: '08:00', end: '12:00', breaks: [] }],
    });
    expect(notify.success).toHaveBeenCalledWith('Instructor saved');
    expect(mockPush).toHaveBeenCalledWith('/instructor');
  });

  it('keeps the linked recipient id and sends the edited fields', async () => {
    const wrapper = await setup();
    wrapper.findComponent(RecipientPicker).vm.$emit('update:modelValue', {
      id: 7,
      name: 'Anna Alt',
      street: 'Hauptstr. 1',
      city: '12345 Berlin',
      email: '',
      salutation: '',
    });
    await flushPromises();
    await wrapper.find('[data-testid="recipient-street"]').setValue('Neue Str. 2');
    await setNumber(wrapper, 'hourly-rate', 12);
    await addMondayBlock(wrapper, '08:00', '12:00');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const body = JSON.parse(String(requestsWith('POST')[0][1].body));
    expect(body.recipientId).toBe(7);
    expect(body.recipientData).toMatchObject({ name: 'Anna Alt', street: 'Neue Str. 2' });
  });

  it('toasts the server error when saving fails', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Promise.resolve(jsonResponse({ error: 'Recipient already has an instructor' }, false))
        : defaultFetch(url, init),
    );
    const wrapper = await setup();
    await fillValidNew(wrapper);

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Recipient already has an instructor');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('loads an existing instructor and offers invoice creation until edited', async () => {
    const wrapper = await setup({ id: '5' });

    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Edit instructor');
    expect(inputValue(wrapper, 'hourly-rate')).toBe('12,00');
    expect(inputValue(wrapper, 'months')).toBe('6');
    const createInvoice = wrapper.find('[data-testid="create-invoice"]');
    expect(createInvoice.attributes('disabled')).toBeUndefined();
    await createInvoice.trigger('click');
    expect(mockPush).toHaveBeenCalledWith('/invoice/new?fromInstructor=5');

    await setNumber(wrapper, 'months', 3);
    const blocked = wrapper.find('[data-testid="create-invoice"]');
    expect(blocked.attributes('disabled')).toBeDefined();
    expect(blocked.attributes('title')).toBe('Save your changes first');
  });

  it('updates an existing instructor with PUT', async () => {
    const wrapper = await setup({ id: '5' });
    await setNumber(wrapper, 'months', 3);

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const [put] = requestsWith('PUT');
    expect(put[0]).toBe('/api/instructor/5');
    expect(JSON.parse(String(put[1].body))).toMatchObject({ recipientId: 7, months: 3 });
  });

  it('disables invoice creation without an active invoice template', async () => {
    templates = [];
    const wrapper = await setup({ id: '5' });

    const createInvoice = wrapper.find('[data-testid="create-invoice"]');
    expect(createInvoice.attributes('disabled')).toBeDefined();
    expect(createInvoice.attributes('title')).toBe('No active invoice template');
  });

  it('deletes after confirmation', async () => {
    const wrapper = await setup({ id: '5' });

    await wrapper.find('[data-testid="delete"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ header: 'Delete instructor', danger: true }),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/5', { method: 'DELETE' });
    expect(notify.success).toHaveBeenCalledWith('Instructor deleted');
    expect(mockPush).toHaveBeenCalledWith('/instructor');
  });

  it('does not delete when the confirmation is declined', async () => {
    confirmAction.mockResolvedValue(false);
    const wrapper = await setup({ id: '5' });

    await wrapper.find('[data-testid="delete"]').trigger('click');
    await flushPromises();

    expect(requestsWith('DELETE')).toHaveLength(0);
  });

  async function fillValidAfterLoadError(wrapper: VueWrapper) {
    await wrapper.find('[data-testid="recipient-name"]').setValue('Anna Alt');
    await setNumber(wrapper, 'hourly-rate', 12);
    await addMondayBlock(wrapper, '08:00', '12:00');
  }

  it('blocks saving when the instructor could not be loaded', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/instructor/5' && !init?.method
        ? Promise.resolve(jsonResponse({ error: 'Not found' }, false))
        : defaultFetch(url, init),
    );
    const wrapper = await setup({ id: '5' });

    expect(wrapper.find('[data-testid="load-error"]').text()).toContain('Instructor not found');
    await fillValidAfterLoadError(wrapper);
    expect(wrapper.find('[data-testid="recipient-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="hourly-rate-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeDefined();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(requestsWith('PUT')).toHaveLength(0);
    expect(requestsWith('POST')).toHaveLength(0);
  });

  it('disables delete and invoice creation when the instructor could not be loaded', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/instructor/5' && !init?.method
        ? Promise.resolve(jsonResponse({ error: 'Not found' }, false))
        : defaultFetch(url, init),
    );
    const wrapper = await setup({ id: '5' });

    expect(wrapper.find('[data-testid="delete"]').attributes('disabled')).toBeDefined();
    const createInvoice = wrapper.find('[data-testid="create-invoice"]');
    expect(createInvoice.attributes('disabled')).toBeDefined();
    expect(createInvoice.attributes('title')).toBe('Instructor could not be loaded');
  });

  it('reports a network error while loading and blocks saving', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/instructor/5' ? Promise.reject(new Error('offline')) : defaultFetch(url, init),
    );
    const wrapper = await setup({ id: '5' });
    expect(wrapper.find('[data-testid="load-error"]').text()).toContain(
      'Network error while loading',
    );
    await fillValidAfterLoadError(wrapper);
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeDefined();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(requestsWith('PUT')).toHaveLength(0);
    expect(requestsWith('POST')).toHaveLength(0);
  });

  it('still saves a new instructor when the settings cannot be loaded', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/instructor/settings'
        ? Promise.reject(new Error('offline'))
        : defaultFetch(url, init),
    );
    const wrapper = await setup();

    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Summary (net, 3,25 weeks/month)');
    await fillValidNew(wrapper);
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeUndefined();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(requestsWith('POST')).toHaveLength(1);
  });

  it('rejects a fractional number of months', async () => {
    const wrapper = await setup();
    await setNumber(wrapper, 'months', 1.5);
    expect(wrapper.find('[data-testid="months-error"]').text()).toBe(
      'Months must be a whole number of at least 1',
    );
  });

  it('updates the summary and the dirty state while typing, without leaving the field', async () => {
    const wrapper = await setup({ id: '5' });
    await wrapper.find('#months').trigger('focus');
    await wrapper.find('#months').setValue('3');
    await flushPromises();

    expect(wrapper.find('[data-testid="summary-total"]').text()).toContain('877,50');
    expect(wrapper.find('[data-testid="create-invoice"]').attributes('title')).toBe(
      'Save your changes first',
    );
  });

  it('keeps Save disabled while the rate text is not a number', async () => {
    const wrapper = await setup();
    await fillValidNew(wrapper);
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeUndefined();
    await wrapper.find('#hourly-rate').setValue('abc');
    await flushPromises();
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeDefined();
  });
});
