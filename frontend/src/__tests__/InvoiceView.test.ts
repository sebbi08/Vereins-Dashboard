import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { DataTableFilterMeta } from 'primevue/datatable';
import type { InvoiceDraftListItem, InvoiceListItem } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import InvoiceView from '../views/InvoiceView.vue';
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
  selection: InvoiceListItem[];
}

function vm(wrapper: VueWrapper): ViewVM {
  return wrapper.vm as unknown as ViewVM;
}

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    number: '1 / 2026',
    status: 'AKTIV',
    paid: false,
    recipientName: 'Anna Alt',
    amountCents: 11900,
    invoiceDate: '2026-01-15T00:00:00.000Z',
    createdAt: '2026-01-15T10:00:00.000Z',
    activeRevisionNumber: 1,
    emailStatus: 'NOT_SENT',
    ...overrides,
  };
}

const invoices: InvoiceListItem[] = [
  invoice({ id: 1 }),
  invoice({
    id: 2,
    number: '2 / 2026',
    recipientName: 'Bernd Bach',
    amountCents: 5950,
    invoiceDate: '2026-03-01T00:00:00.000Z',
    emailStatus: 'SENT',
    paid: true,
  }),
  invoice({
    id: 3,
    number: '3 / 2026',
    recipientName: 'Clara Cord',
    amountCents: 23800,
    invoiceDate: '2026-02-10T00:00:00.000Z',
    status: 'STORNIERT',
  }),
];

let drafts: InvoiceDraftListItem[];
const push = vi.fn();

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

async function mountView() {
  const wrapper = mount(InvoiceView, {
    attachTo: document.body,
    global: withPrimeVue({ stubs: { RouterLink: { template: '<a><slot /></a>' } } }),
  });
  await flushPromises();
  return wrapper;
}

function rows(wrapper: VueWrapper) {
  return wrapper.findAll('.invoice-row');
}

async function setFilter(wrapper: VueWrapper, field: string, value: unknown) {
  const current = vm(wrapper).filters[field] as { matchMode: string };
  vm(wrapper).filters = { ...vm(wrapper).filters, [field]: { ...current, value } };
  await flushPromises();
}

beforeEach(() => {
  drafts = [];
  push.mockReset();
  download.mockReset();
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/invoice?withCancelled=true') return Promise.resolve(jsonResponse(invoices));
      if (url === '/api/invoice-draft') return Promise.resolve(jsonResponse(drafts));
      return Promise.resolve(jsonResponse({}, false));
    }),
  );
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  setActivePinia(createPinia());
  useAppStore().invoiceTemplateAvailable = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceView', () => {
  it('loads all invoices (incl. cancelled) and drafts once', async () => {
    await mountView();
    expect(fetch).toHaveBeenCalledWith('/api/invoice?withCancelled=true');
    expect(fetch).toHaveBeenCalledWith('/api/invoice-draft');
  });

  it('shows the heading and actions', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Invoices');
    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.find('[data-testid="new-invoice"]').text()).toContain('New Invoice');
  });

  it('hides cancelled invoices by default', async () => {
    const wrapper = await mountView();
    expect(rows(wrapper)).toHaveLength(2);
    expect(wrapper.text()).not.toContain('Clara Cord');
  });

  it('shows cancelled invoices when the status filter is cleared', async () => {
    const wrapper = await mountView();
    await setFilter(wrapper, 'status', null);
    expect(rows(wrapper)).toHaveLength(3);
    expect(wrapper.text()).toContain('Cancelled');
  });

  it('switches the status filter with the toolbar buttons', async () => {
    const wrapper = await mountView();
    const buttons = () =>
      wrapper.findAll(
        '[data-testid="status-filter"] [role="button"], [data-testid="status-filter"] button',
      );
    expect(buttons().map((b) => b.text())).toEqual(['Active', 'Cancelled', 'All']);

    await buttons()[2].trigger('click');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(3);

    await buttons()[1].trigger('click');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Clara Cord');

    await wrapper.find('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(2);
    expect(buttons()[0].attributes('aria-pressed')).toBe('true');
  });

  it('keeps the status filter out of the column filter row', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[aria-label="Filter by status"]').exists()).toBe(true);
    expect(wrapper.findAll('thead [aria-label="Filter by status"]')).toHaveLength(0);
  });

  it('searches by recipient or number', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="global-search"]').setValue('bach');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Bernd Bach');
  });

  it('filters by amount range in euros', async () => {
    const wrapper = await mountView();
    await setFilter(wrapper, 'amountCents', [100, null]);
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Anna Alt');
  });

  it('filters by date range', async () => {
    const wrapper = await mountView();
    await setFilter(wrapper, 'invoiceDate', [new Date(2026, 1, 1), new Date(2026, 2, 1)]);
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Bernd Bach');
  });

  it('clears filters back to the defaults', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="global-search"]').setValue('bach');
    await flushPromises();
    await wrapper.find('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(2);
    expect((wrapper.find('[data-testid="global-search"]').element as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('shows amount, date, revision and status tags', async () => {
    const wrapper = await mountView();
    const first = rows(wrapper)[0].text();
    expect(first).toContain('1 / 2026');
    expect(first).toContain('119,00');
    expect(first).toContain('15.01.2026');
    expect(first).toContain('R1');
    expect(first).toContain('Active');
    expect(rows(wrapper)[1].text()).toContain('Email sent');
  });

  it('opens an invoice on row click', async () => {
    const wrapper = await mountView();
    await rows(wrapper)[1].trigger('click');
    expect(push).toHaveBeenCalledWith('/invoice/2');
  });

  it('does not open the invoice when its checkbox is clicked', async () => {
    const wrapper = await mountView();
    const checkbox = rows(wrapper)[0].find('input[type="checkbox"]');
    await checkbox.trigger('click');
    await flushPromises();
    expect(push).not.toHaveBeenCalled();
    expect(vm(wrapper).selection.map((i) => i.id)).toEqual([1]);
  });

  it('does not open the invoice when the selection cell is clicked', async () => {
    const wrapper = await mountView();
    await rows(wrapper)[0].find('td[data-p-selection-column="true"]').trigger('click');
    expect(push).not.toHaveBeenCalled();
  });

  it('copies an invoice without opening it', async () => {
    const wrapper = await mountView();
    await wrapper.findAll('[data-testid="copy-invoice"]')[0].trigger('click');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/invoice/new?copyFrom=1');
  });

  it('downloads the selection and deselects rejected invoices', async () => {
    download.mockResolvedValue([2]);
    const wrapper = await mountView();
    vm(wrapper).selection = [invoices[0], invoices[1]];
    await flushPromises();

    const button = wrapper.find('[data-testid="download-selected"]');
    expect(button.text()).toContain('Download selected (2)');
    await button.trigger('click');
    await flushPromises();

    expect(download).toHaveBeenCalledWith([1, 2]);
    expect(vm(wrapper).selection.map((i) => i.id)).toEqual([1]);
  });

  it('drops selected invoices that a filter hides, so they are not downloaded unseen', async () => {
    const wrapper = await mountView();
    const anna = invoices.find((i) => i.recipientName === 'Anna Alt')!;
    const bernd = invoices.find((i) => i.recipientName === 'Bernd Bach')!;
    vm(wrapper).selection = [anna, bernd];
    await flushPromises();

    await wrapper.find('[data-testid="global-search"]').setValue('bach');
    await flushPromises();

    expect(vm(wrapper).selection.map((i) => i.id)).toEqual([bernd.id]);
  });

  it('disables download without a selection', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="download-selected"]').attributes('disabled')).toBeDefined();
  });

  it('shows drafts above the invoices and opens them', async () => {
    drafts = [
      {
        id: 9,
        recipientName: 'Dora Drei',
        title: '',
        amountCents: 1000,
        updatedAt: '2026-10-01T10:00:00Z',
      },
    ];
    const wrapper = await mountView();

    const section = wrapper.find('[data-testid="drafts-section"]');
    expect(section.text()).toContain('Drafts (1)');
    expect(section.text()).toContain('Dora Drei');
    expect(section.text()).toContain('—');
    await wrapper.find('.draft-row').trigger('click');
    expect(push).toHaveBeenCalledWith('/invoice/draft/9');
  });

  it('links the draft recipient to the draft so it is keyboard-operable', async () => {
    drafts = [
      {
        id: 9,
        recipientName: 'Dora Drei',
        title: '',
        amountCents: 1000,
        updatedAt: '2026-10-01T10:00:00Z',
      },
    ];
    const wrapper = await mountView();
    const link = wrapper.findComponent('[data-testid="drafts-section"] .draft-row a');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('Dora Drei');
  });

  it('reports drafts that could not be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/invoice?withCancelled=true') {
          return Promise.resolve(jsonResponse(invoices));
        }
        return Promise.resolve(jsonResponse({}, false));
      }),
    );
    await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading drafts');
  });

  it('has no drafts section without drafts', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="drafts-section"]').exists()).toBe(false);
  });

  it('warns and blocks new invoices without a template', async () => {
    useAppStore().invoiceTemplateAvailable = false;
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="no-template-warning"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="new-invoice"]').attributes('disabled')).toBeDefined();
  });

  it('reports a load error', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error('offline')));
    const wrapper = await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading invoices');
    expect(wrapper.find('[data-testid="list-load-error"]').text()).toContain('could not be loaded');
  });

  it('shows a load-error state when the list request returns not ok', async () => {
    vi.mocked(fetch).mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : String(url);
      if (urlStr === '/api/invoice?withCancelled=true')
        return Promise.resolve(jsonResponse({}, false));
      if (urlStr === '/api/invoice-draft') return Promise.resolve(jsonResponse(drafts));
      return Promise.resolve(jsonResponse({}, false));
    });
    const wrapper = await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading invoices');
    expect(wrapper.find('[data-testid="list-load-error"]').text()).toContain('could not be loaded');
  });

  it('shows the payment state and filters by it', async () => {
    const wrapper = await mountView();
    const bernd = rows(wrapper).find((row) => row.text().includes('Bernd Bach'));
    const anna = rows(wrapper).find((row) => row.text().includes('Anna Alt'));
    expect(bernd?.text()).toContain('Paid');
    expect(anna?.text()).toContain('Open');

    await setFilter(wrapper, 'paid', true);
    expect(rows(wrapper).map((row) => row.text())).toEqual([expect.stringContaining('Bernd Bach')]);

    await setFilter(wrapper, 'paid', false);
    expect(rows(wrapper).map((row) => row.text())).toEqual([expect.stringContaining('Anna Alt')]);
  });

  it('leads to the bank booking import', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="import-bookings"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/invoice/payment-import');
  });
});
