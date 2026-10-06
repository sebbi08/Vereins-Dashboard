import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { DataTableFilterMeta } from 'primevue/datatable';
import type { InstructorListItemDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import InstructorView from '../views/InstructorView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify, confirmAction } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  confirmAction: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: vi.fn(),
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('../composables/useConfirmAction', () => ({
  useConfirmAction: () => ({ confirmAction }),
}));

interface ViewVM {
  filters: DataTableFilterMeta;
}

const instructors: InstructorListItemDto[] = [
  {
    id: 1,
    name: 'Anna Alt',
    hourlyRateCents: 1200,
    months: 6,
    calculation: { netMinutesPerWeek: 450, monthlyCents: 29250, totalCents: 175500 },
  },
  {
    id: 2,
    name: 'Bernd Bach',
    hourlyRateCents: 1000,
    months: 1,
    calculation: { netMinutesPerWeek: 60, monthlyCents: 3250, totalCents: 3250 },
  },
];

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;
const push = vi.fn();

const defaultFetch: FetchImpl = (url, init) => {
  if (url === '/api/instructor') return Promise.resolve(jsonResponse(instructors));
  if (url === '/api/instructor/settings' && init?.method === 'PUT') {
    return Promise.resolve(
      jsonResponse({ invoiceTemplate: null, ...JSON.parse(String(init.body)) }),
    );
  }
  if (url === '/api/instructor/settings') {
    return Promise.resolve(jsonResponse({ weeksPerMonth: 3.25, invoiceTemplate: null }));
  }
  if (url === '/api/instructor/1')
    return Promise.resolve(
      jsonResponse({
        ...instructors[0],
        recipient: { id: 7, name: 'Anna Alt', street: '', city: '', email: null, salutation: null },
        timeBlocks: [],
      }),
    );
  return Promise.resolve(jsonResponse({}, false));
};

async function mountView() {
  const wrapper = mount(InstructorView, {
    attachTo: document.body,
    global: withPrimeVue({ stubs: { RouterLink: { template: '<a><slot /></a>' } } }),
  });
  await flushPromises();
  return wrapper;
}

function rows(wrapper: VueWrapper) {
  return wrapper.findAll('.instructor-row');
}

async function setWeeks(wrapper: VueWrapper, value: string) {
  await wrapper.find('#weeks-per-month').setValue(value);
  await flushPromises();
}

function puts() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
}

beforeEach(() => {
  fetchMock = vi.fn(defaultFetch);
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  push.mockReset();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  setActivePinia(createPinia());
  useAppStore().invoiceTemplateAvailable = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InstructorView', () => {
  it('shows the heading and the new-instructor action', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Instructor Rent');
    await wrapper.find('[data-testid="new-instructor"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/instructor/new');
  });

  it('renders one row per instructor and the sum of totals', async () => {
    const wrapper = await mountView();

    expect(rows(wrapper)).toHaveLength(2);
    expect(rows(wrapper)[0].text()).toContain('Anna Alt');
    expect(rows(wrapper)[0].text()).toContain('12,00');
    expect(rows(wrapper)[0].text()).toContain('7,5');
    expect(rows(wrapper)[0].text()).toContain('292,50');
    expect(rows(wrapper)[0].text()).toContain('1.755,00');
    expect(wrapper.find('[data-testid="footer-total"]').text()).toContain('1.787,50');
  });

  it('sums only the rows left by the filters', async () => {
    const wrapper = await mountView();

    await wrapper.find('[data-testid="global-search"]').setValue('bach');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(1);
    expect(wrapper.find('[data-testid="footer-total"]').text()).toContain('32,50');

    await wrapper.find('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="footer-total"]').text()).toContain('1.787,50');
  });

  it('filters by total amount in euros', async () => {
    const wrapper = await mountView();
    const vm = wrapper.vm as unknown as ViewVM;
    const current = vm.filters['calculation.totalCents'] as { matchMode: string };
    vm.filters = { ...vm.filters, 'calculation.totalCents': { ...current, value: [100, null] } };
    await flushPromises();

    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Anna Alt');
  });

  it('keeps the calculation settings in a collapsed panel with the saved value in its header', async () => {
    const wrapper = await mountView();
    const panel = wrapper.find('[data-testid="calculation-settings"]');
    expect(panel.text()).toContain('Calculation settings (3,25 weeks/month)');
    expect(panel.find('[data-testid="invoice-template"]').exists()).toBe(true);
    expect((wrapper.find('#weeks-per-month').element as HTMLInputElement).value).toBe('3,25');
  });

  it('saves weeks per month, updates the header and reloads the list', async () => {
    const wrapper = await mountView();
    const listCallsBefore = fetchMock.mock.calls.filter(([u]) => u === '/api/instructor').length;

    await setWeeks(wrapper, '4');
    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();

    expect(JSON.parse(String(puts()[0][1].body))).toEqual({ weeksPerMonth: 4 });
    expect(notify.success).toHaveBeenCalledWith('Weeks per month saved');
    expect(wrapper.find('[data-testid="calculation-settings"]').text()).toContain(
      'Calculation settings (4 weeks/month)',
    );
    const listCallsAfter = fetchMock.mock.calls.filter(([u]) => u === '/api/instructor').length;
    expect(listCallsAfter).toBe(listCallsBefore + 1);
  });

  it('saves "3.5" weeks per month as 3.5', async () => {
    const wrapper = await mountView();
    await setWeeks(wrapper, '3.5');
    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();
    expect(JSON.parse(String(puts()[0][1].body))).toEqual({ weeksPerMonth: 3.5 });
  });

  it.each([
    ['0', 'Weeks per month must be greater than 0'],
    ['', 'Weeks per month must be greater than 0'],
  ])('shows an error and does not save weeks per month of %j', async (value, message) => {
    const wrapper = await mountView();

    await setWeeks(wrapper, value);
    expect(wrapper.find('[data-testid="weeks-error"]').text()).toBe(message);
    expect(wrapper.find('[data-testid="save-settings"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();
    expect(puts()).toHaveLength(0);
  });

  it.each([
    ['responds with an error', () => Promise.resolve(jsonResponse({}, false))],
    ['is unreachable', () => Promise.reject(new Error('offline'))],
  ])('disables saving when loading the setting %s', async (_label, settingsReply) => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/instructor/settings' && !init?.method
        ? settingsReply()
        : defaultFetch(url, init),
    );
    const wrapper = await mountView();

    expect(wrapper.find('[data-testid="settings-load-error"]').text()).toBe(
      'Could not load settings',
    );
    expect(wrapper.find('[data-testid="save-settings"]').attributes('disabled')).toBeDefined();
  });

  it('toasts the error when saving the setting fails', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? Promise.reject(new Error('offline')) : defaultFetch(url, init),
    );
    const wrapper = await mountView();

    await setWeeks(wrapper, '4');
    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Saving failed');
    expect(wrapper.find('[data-testid="calculation-settings"]').text()).toContain(
      '(3,25 weeks/month)',
    );
  });

  it('navigates to a prefilled invoice without opening the instructor', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="create-invoice-1"]').trigger('click');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/invoice/new?fromInstructor=1');
  });

  it('disables invoice creation without an invoice template', async () => {
    useAppStore().invoiceTemplateAvailable = false;
    const wrapper = await mountView();
    const button = wrapper.find('[data-testid="create-invoice-1"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('title')).toBe('No active invoice template');
  });

  it('opens the instructor on row click', async () => {
    const wrapper = await mountView();
    await rows(wrapper)[1].trigger('click');
    expect(push).toHaveBeenCalledWith('/instructor/2');
  });

  it('uses the first instructor as preview source for the invoice text', async () => {
    await mountView();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/instructor/1')).toBe(true);
  });

  it('reports a load error', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/instructor' ? Promise.reject(new Error('offline')) : defaultFetch(url, init),
    );
    const wrapper = await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading instructors');
    expect(wrapper.find('[data-testid="list-load-error"]').text()).toContain('could not be loaded');
  });

  it('shows a load-error state when the list request returns not ok', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/instructor'
        ? Promise.resolve(jsonResponse({}, false))
        : defaultFetch(url, init),
    );
    const wrapper = await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading instructors');
    expect(wrapper.find('[data-testid="list-load-error"]').text()).toContain('could not be loaded');
  });
});
