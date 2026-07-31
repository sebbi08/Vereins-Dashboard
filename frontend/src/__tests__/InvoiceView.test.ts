import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { InvoiceListItem } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useRouter } from 'vue-router';
import InvoiceView from '../views/InvoiceView.vue';

vi.mock('vue-router', () => ({
  useRouter: vi.fn(),
}));

const mockPush = vi.fn();

/** Internal state exposed by InvoiceView's &lt;script setup&gt; at runtime. */
interface InvoiceViewVM {
  invoices: InvoiceListItem[];
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
  toggleSelectAll: () => void;
  allSelected: boolean;
  downloadSelected: () => Promise<void>;
}

function vm(wrapper: VueWrapper): InvoiceViewVM {
  return wrapper.vm as unknown as InvoiceViewVM;
}

function makeInvoice(overrides: Partial<InvoiceListItem> = {}): InvoiceListItem {
  return {
    id: 1,
    number: 'INV-2024-001',
    status: 'AKTIV',
    recipientName: 'Test Recipient',
    amountCents: 10000,
    invoiceDate: '2024-01-15',
    createdAt: '2024-01-15T10:00:00Z',
    activeRevisionNumber: 1,
    emailStatus: 'NOT_SENT',
    ...overrides,
  };
}

const mockInvoices: InvoiceListItem[] = [
  makeInvoice({ id: 1, number: 'INV-001' }),
  makeInvoice({ id: 2, number: 'INV-002' }),
  makeInvoice({ id: 3, number: 'INV-003' }),
];

describe('InvoiceView — selection & download', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve(mockInvoices) } as Response),
    );
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: mockPush });
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mountInvoiceView() {
    return mount(InvoiceView, {
      global: {
        stubs: {
          'router-link': { template: '<a><slot /></a>' },
        },
      },
    });
  }

  describe('toggleSelect', () => {
    it('adds an ID to the Set when not present', async () => {
      const wrapper = mountInvoiceView();
      await nextTick();
      // Set invoices data so we have items to select
      vm(wrapper).invoices = [...mockInvoices];

      vm(wrapper).toggleSelect(1);
      expect(vm(wrapper).selectedIds.has(1)).toBe(true);
      expect(vm(wrapper).selectedIds.size).toBe(1);

      vm(wrapper).toggleSelect(2);
      expect(vm(wrapper).selectedIds.has(1)).toBe(true);
      expect(vm(wrapper).selectedIds.has(2)).toBe(true);
      expect(vm(wrapper).selectedIds.size).toBe(2);
    });

    it('removes an ID from the Set when already present', async () => {
      const wrapper = mountInvoiceView();
      await nextTick();
      vm(wrapper).invoices = [...mockInvoices];

      vm(wrapper).toggleSelect(1);
      vm(wrapper).toggleSelect(2);
      expect(vm(wrapper).selectedIds.size).toBe(2);

      vm(wrapper).toggleSelect(1);
      expect(vm(wrapper).selectedIds.has(1)).toBe(false);
      expect(vm(wrapper).selectedIds.has(2)).toBe(true);
      expect(vm(wrapper).selectedIds.size).toBe(1);
    });

    it('does not mutate the previous Set reference', async () => {
      const wrapper = mountInvoiceView();
      await nextTick();
      vm(wrapper).invoices = [...mockInvoices];

      const before = vm(wrapper).selectedIds;
      vm(wrapper).toggleSelect(1);
      expect(vm(wrapper).selectedIds).not.toBe(before);
    });
  });

  describe('toggleSelectAll', () => {
    it('selects all when none are selected', async () => {
      const wrapper = mountInvoiceView();
      await nextTick();
      vm(wrapper).invoices = [...mockInvoices];
      expect(vm(wrapper).selectedIds.size).toBe(0);

      vm(wrapper).toggleSelectAll();
      expect(vm(wrapper).selectedIds.size).toBe(3);
      expect(vm(wrapper).selectedIds.has(1)).toBe(true);
      expect(vm(wrapper).selectedIds.has(2)).toBe(true);
      expect(vm(wrapper).selectedIds.has(3)).toBe(true);
    });

    it('selects all when partially selected', async () => {
      const wrapper = mountInvoiceView();
      await nextTick();
      vm(wrapper).invoices = [...mockInvoices];
      vm(wrapper).toggleSelect(1);

      vm(wrapper).toggleSelectAll();
      expect(vm(wrapper).selectedIds.size).toBe(3);
      expect(vm(wrapper).selectedIds.has(2)).toBe(true);
    });

    it('deselects all when all are selected', async () => {
      const wrapper = mountInvoiceView();
      await nextTick();
      vm(wrapper).invoices = [...mockInvoices];
      vm(wrapper).toggleSelect(1);
      vm(wrapper).toggleSelect(2);
      vm(wrapper).toggleSelect(3);
      expect(vm(wrapper).selectedIds.size).toBe(3);

      vm(wrapper).toggleSelectAll();
      expect(vm(wrapper).selectedIds.size).toBe(0);
    });
  });

  describe('allSelected', () => {
    it('returns false when the invoice list is empty', async () => {
      const wrapper = mountInvoiceView();
      await nextTick();
      vm(wrapper).invoices = [];
      vm(wrapper).selectedIds = new Set();
      await nextTick();

      expect(vm(wrapper).allSelected).toBe(false);
    });

    it('returns false when no invoices are selected', async () => {
      const wrapper = mountInvoiceView();
      await nextTick();
      vm(wrapper).invoices = [...mockInvoices];
      vm(wrapper).selectedIds = new Set();
      await nextTick();

      expect(vm(wrapper).allSelected).toBe(false);
    });

    it('returns false when only some invoices are selected', async () => {
      const wrapper = mountInvoiceView();
      await nextTick();
      vm(wrapper).invoices = [...mockInvoices];
      vm(wrapper).selectedIds = new Set([1]);
      await nextTick();

      expect(vm(wrapper).allSelected).toBe(false);
    });

    it('returns true when all invoices are selected', async () => {
      const wrapper = mountInvoiceView();
      await nextTick();
      vm(wrapper).invoices = [...mockInvoices];
      vm(wrapper).selectedIds = new Set([1, 2, 3]);
      await nextTick();

      expect(vm(wrapper).allSelected).toBe(true);
    });
  });

  describe('downloadSelected', () => {
    /** Creates a fetch mock that returns invoices for the list endpoint and
     *  delegates POST /api/invoice/download-batch to the provided handler. */
    function stubFetch(downloadHandler: () => Promise<Response>) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (typeof url === 'string' && url.startsWith('/api/invoice/download-batch')) {
            return downloadHandler();
          }
          // Initial loadData call
          return Promise.resolve({
            json: () => Promise.resolve(mockInvoices),
          } as Response);
        }),
      );
    }

    it('does nothing when no IDs are selected', async () => {
      const downloadHandler = vi.fn();
      stubFetch(downloadHandler as unknown as () => Promise<Response>);

      const wrapper = mountInvoiceView();
      await nextTick();
      await nextTick(); // let loadData settle

      vm(wrapper).selectedIds = new Set();

      await vm(wrapper).downloadSelected();
      expect(downloadHandler).not.toHaveBeenCalled();
    });

    describe('success path', () => {
      beforeEach(() => {
        vi.stubGlobal('URL', {
          createObjectURL: vi.fn().mockReturnValue('blob:test'),
          revokeObjectURL: vi.fn(),
        });
      });

      it('calls fetch with selected IDs', async () => {
        const downloadHandler = vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(new Blob(['zip-content'])),
          headers: new Headers({
            'Content-Disposition': 'attachment; filename="rechnungen.zip"',
          }),
        } as Response);
        stubFetch(downloadHandler);

        const wrapper = mountInvoiceView();
        await nextTick();
        await nextTick();
        vm(wrapper).selectedIds = new Set([1, 2]);

        await vm(wrapper).downloadSelected();

        expect(downloadHandler).toHaveBeenCalled();
      });

      it('triggers a download via anchor click', async () => {
        stubFetch(() =>
          Promise.resolve({
            ok: true,
            blob: () => Promise.resolve(new Blob(['zip-content'])),
            headers: new Headers({
              'Content-Disposition': 'attachment; filename="rechnungen.zip"',
            }),
          } as Response),
        );

        const clickSpy = vi.fn();
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
          const el = originalCreateElement(tag);
          if (tag === 'a') {
            el.click = clickSpy;
          }
          return el;
        });

        const wrapper = mountInvoiceView();
        await nextTick();
        await nextTick();
        vm(wrapper).selectedIds = new Set([1]);

        await vm(wrapper).downloadSelected();

        expect(clickSpy).toHaveBeenCalled();
        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
      });

      it('uses default filename when Content-Disposition lacks filename', async () => {
        stubFetch(() =>
          Promise.resolve({
            ok: true,
            blob: () => Promise.resolve(new Blob(['zip-content'])),
            headers: new Headers(),
          } as Response),
        );

        let anchorDownload = '';
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
          const el = originalCreateElement(tag);
          if (tag === 'a') {
            Object.defineProperty(el, 'download', {
              set(val: string) {
                anchorDownload = val;
              },
              get() {
                return anchorDownload;
              },
            });
          }
          return el;
        });

        const wrapper = mountInvoiceView();
        await nextTick();
        await nextTick();
        vm(wrapper).selectedIds = new Set([1]);

        await vm(wrapper).downloadSelected();

        expect(anchorDownload).toBe('rechnungen.zip');
      });
    });

    describe('400 error paths', () => {
      it('deselects IDs returned in the error body and alerts with CANCELLED label', async () => {
        const alertSpy = vi.fn();
        vi.stubGlobal('alert', alertSpy);
        stubFetch(() =>
          Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ ids: [1, 2], error: 'CANCELLED' }),
          } as Response),
        );

        const wrapper = mountInvoiceView();
        await nextTick();
        await nextTick();
        vm(wrapper).selectedIds = new Set([1, 2, 3]);

        await vm(wrapper).downloadSelected();

        // IDs 1 and 2 should be removed, 3 should remain
        expect(vm(wrapper).selectedIds.has(1)).toBe(false);
        expect(vm(wrapper).selectedIds.has(2)).toBe(false);
        expect(vm(wrapper).selectedIds.has(3)).toBe(true);
        expect(vm(wrapper).selectedIds.size).toBe(1);

        expect(alertSpy).toHaveBeenCalledWith(
          '2 invoices cannot be downloaded: cancelled. They have been deselected.',
        );
      });

      it('uses PDF_NOT_READY label when error code is PDF_NOT_READY', async () => {
        const alertSpy = vi.fn();
        vi.stubGlobal('alert', alertSpy);
        stubFetch(() =>
          Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ ids: [1], error: 'PDF_NOT_READY' }),
          } as Response),
        );

        const wrapper = mountInvoiceView();
        await nextTick();
        await nextTick();
        vm(wrapper).selectedIds = new Set([1]);

        await vm(wrapper).downloadSelected();

        expect(alertSpy).toHaveBeenCalledWith(
          '1 invoice cannot be downloaded: PDF not ready. It has been deselected.',
        );
      });

      it('uses NOT_FOUND label when error code is NOT_FOUND', async () => {
        const alertSpy = vi.fn();
        vi.stubGlobal('alert', alertSpy);
        stubFetch(() =>
          Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ ids: [1], error: 'NOT_FOUND' }),
          } as Response),
        );

        const wrapper = mountInvoiceView();
        await nextTick();
        await nextTick();
        vm(wrapper).selectedIds = new Set([1]);

        await vm(wrapper).downloadSelected();

        expect(alertSpy).toHaveBeenCalledWith(
          '1 invoice cannot be downloaded: not found. It has been deselected.',
        );
      });

      it('uses "invalid" label for unknown error codes', async () => {
        const alertSpy = vi.fn();
        vi.stubGlobal('alert', alertSpy);
        stubFetch(() =>
          Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ ids: [3], error: 'SOME_OTHER' }),
          } as Response),
        );

        const wrapper = mountInvoiceView();
        await nextTick();
        await nextTick();
        vm(wrapper).selectedIds = new Set([3]);

        await vm(wrapper).downloadSelected();

        expect(alertSpy).toHaveBeenCalledWith(
          '1 invoice cannot be downloaded: invalid. It has been deselected.',
        );
      });

      it('shows generic alert when 400 body has no ids array', async () => {
        const alertSpy = vi.fn();
        vi.stubGlobal('alert', alertSpy);
        stubFetch(() =>
          Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ message: 'something else' }),
          } as Response),
        );

        const wrapper = mountInvoiceView();
        await nextTick();
        await nextTick();
        vm(wrapper).selectedIds = new Set([1]);

        await vm(wrapper).downloadSelected();

        expect(alertSpy).toHaveBeenCalledWith('Download failed. Please try again.');
      });

      it('shows generic alert on network error (catch path)', async () => {
        const alertSpy = vi.fn();
        vi.stubGlobal('alert', alertSpy);

        // For the catch path we reject the download call; loadData must still work
        vi.stubGlobal(
          'fetch',
          vi.fn().mockImplementation((url: string) => {
            if (typeof url === 'string' && url.startsWith('/api/invoice/download-batch')) {
              return Promise.reject(new Error('Network error'));
            }
            return Promise.resolve({
              json: () => Promise.resolve(mockInvoices),
            } as Response);
          }),
        );

        const wrapper = mountInvoiceView();
        await nextTick();
        await nextTick();
        vm(wrapper).selectedIds = new Set([1]);

        await vm(wrapper).downloadSelected();

        expect(alertSpy).toHaveBeenCalledWith('Download failed. Please try again.');
      });
    });
  });
});
