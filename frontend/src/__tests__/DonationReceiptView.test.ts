import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { DataTableFilterMeta } from 'primevue/datatable';
import type { DonationReceiptListItem } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import DonationReceiptView from '../views/DonationReceiptView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify, download } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  download: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: vi.fn(),
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('../composables/useBatchDownload', () => ({
  useBatchDownload: () => ({ download, downloading: false }),
}));

interface ViewVM {
  filters: DataTableFilterMeta;
  selection: DonationReceiptListItem[];
}

function vm(wrapper: VueWrapper): ViewVM {
  return wrapper.vm as unknown as ViewVM;
}

function receipt(overrides: Partial<DonationReceiptListItem>): DonationReceiptListItem {
  return {
    id: 1,
    number: 'SQ-2026-001',
    status: 'AKTIV',
    donorName: 'Anna Alt',
    donationAmountCents: 10000,
    donationDate: '2026-01-15T00:00:00.000Z',
    createdAt: '2026-01-15T10:00:00.000Z',
    activeRevisionNumber: 1,
    ...overrides,
  };
}

const receipts: DonationReceiptListItem[] = [
  receipt({ id: 1 }),
  receipt({
    id: 2,
    number: 'SQ-2026-002',
    donorName: 'Bernd Bach',
    donationAmountCents: 5000,
    donationDate: '2026-03-01T00:00:00.000Z',
    activeRevisionNumber: 2,
  }),
  receipt({
    id: 3,
    number: 'SQ-2026-003',
    donorName: 'Clara Cord',
    donationAmountCents: 20000,
    donationDate: '2026-02-10T00:00:00.000Z',
    status: 'STORNIERT',
  }),
];

const push = vi.fn();

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

async function mountView() {
  const wrapper = mount(DonationReceiptView, {
    attachTo: document.body,
    global: withPrimeVue({ stubs: { RouterLink: { template: '<a><slot /></a>' } } }),
  });
  await flushPromises();
  return wrapper;
}

function rows(wrapper: VueWrapper) {
  return wrapper.findAll('.receipt-row');
}

async function setFilter(wrapper: VueWrapper, field: string, value: unknown) {
  const current = vm(wrapper).filters[field] as { matchMode: string };
  vm(wrapper).filters = { ...vm(wrapper).filters, [field]: { ...current, value } };
  await flushPromises();
}

function statusButtons(wrapper: VueWrapper) {
  return wrapper.findAll(
    '[data-testid="status-filter"] [role="button"], [data-testid="status-filter"] button',
  );
}

beforeEach(() => {
  push.mockReset();
  download.mockReset();
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/donation-receipt?withCancelled=true'
          ? jsonResponse(receipts)
          : jsonResponse({}, false),
      ),
    ),
  );
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  setActivePinia(createPinia());
  useAppStore().receiptTemplateAvailable = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DonationReceiptView', () => {
  it('loads all receipts (incl. cancelled) once', async () => {
    await mountView();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/donation-receipt?withCancelled=true');
  });

  it('shows the heading and actions', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Donation Receipts');
    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.find('[data-testid="new-receipt"]').text()).toContain('New Receipt');
    expect(
      (wrapper.find('[data-testid="global-search"]').element as HTMLInputElement).placeholder,
    ).toContain('Search');
  });

  it('hides cancelled receipts by default', async () => {
    const wrapper = await mountView();
    expect(rows(wrapper)).toHaveLength(2);
    expect(wrapper.text()).not.toContain('Clara Cord');
  });

  it('switches the status filter with the toolbar buttons', async () => {
    const wrapper = await mountView();
    expect(statusButtons(wrapper).map((b) => b.text())).toEqual(['Active', 'Cancelled', 'All']);

    await statusButtons(wrapper)[2].trigger('click');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(3);

    await statusButtons(wrapper)[1].trigger('click');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Clara Cord');
    expect(rows(wrapper)[0].text()).toContain('Cancelled');
  });

  it('searches by donor or number', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="global-search"]').setValue('bach');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Bernd Bach');

    await wrapper.find('[data-testid="global-search"]').setValue('001');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Anna Alt');
  });

  it('filters by amount range in euros', async () => {
    const wrapper = await mountView();
    await setFilter(wrapper, 'donationAmountCents', [80, null]);
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Anna Alt');
  });

  it('filters by donation date range', async () => {
    const wrapper = await mountView();
    await setFilter(wrapper, 'donationDate', [new Date(2026, 1, 1), new Date(2026, 2, 1)]);
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Bernd Bach');
  });

  it('clears filters back to the defaults', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="global-search"]').setValue('bach');
    await statusButtons(wrapper)[2].trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(2);
    expect(statusButtons(wrapper)[0].attributes('aria-pressed')).toBe('true');
  });

  it('shows number, amount, date, revision and status', async () => {
    const wrapper = await mountView();
    const first = rows(wrapper)[0].text();
    expect(first).toContain('SQ-2026-001');
    expect(first).toContain('100,00');
    expect(first).toContain('15.01.2026');
    expect(first).toContain('R1');
    expect(first).toContain('Active');
  });

  it('opens a receipt on row click', async () => {
    const wrapper = await mountView();
    await rows(wrapper)[1].trigger('click');
    expect(push).toHaveBeenCalledWith('/donation-receipt/2');
  });

  it('selects without opening when the checkbox or its cell is clicked', async () => {
    const wrapper = await mountView();
    await rows(wrapper)[0].find('input[type="checkbox"]').trigger('click');
    await rows(wrapper)[1].find('td[data-p-selection-column="true"]').trigger('click');
    await flushPromises();
    expect(push).not.toHaveBeenCalled();
    expect(vm(wrapper).selection.map((r) => r.id)).toEqual([1]);
  });

  it('copies a receipt without opening it', async () => {
    const wrapper = await mountView();
    await wrapper.findAll('[data-testid="copy-receipt"]')[0].trigger('click');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/donation-receipt/new?copyFrom=1');
  });

  it('downloads the selection and deselects rejected receipts', async () => {
    download.mockResolvedValue([2]);
    const wrapper = await mountView();
    vm(wrapper).selection = [receipts[0], receipts[1]];
    await flushPromises();

    const button = wrapper.find('[data-testid="download-selected"]');
    expect(button.text()).toContain('Download selected (2)');
    await button.trigger('click');
    await flushPromises();

    expect(download).toHaveBeenCalledWith([1, 2]);
    expect(vm(wrapper).selection.map((r) => r.id)).toEqual([1]);
  });

  it('disables download without a selection', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="download-selected"]').attributes('disabled')).toBeDefined();
  });

  it('warns and blocks new receipts without a template', async () => {
    useAppStore().receiptTemplateAvailable = false;
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="no-template-warning"]').text()).toContain(
      'No donation receipt template uploaded',
    );
    const button = wrapper.find('[data-testid="new-receipt"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('title')).toBe(
      'Please upload a donation receipt template in Settings first',
    );
  });

  it('reports a load error', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error('offline')));
    await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading receipts');
  });
});
