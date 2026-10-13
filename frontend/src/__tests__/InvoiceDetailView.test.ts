import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { InvoiceDto, InvoiceRevisionDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import InvoiceDetailView from '../views/InvoiceDetailView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify, confirmAction } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  confirmAction: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: vi.fn(),
  useRouter: vi.fn(),
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('../composables/useConfirmAction', () => ({
  useConfirmAction: () => ({ confirmAction }),
}));

function revision(overrides: Partial<InvoiceRevisionDto>): InvoiceRevisionDto {
  return {
    id: 11,
    revisionNumber: 1,
    status: 'AKTIV',
    pdfStatus: 'OK',
    pdfError: null,
    pdfTechError: null,
    emailStatus: 'NOT_SENT',
    emailError: null,
    inputs: {
      salutation: '',
      name: 'Anna Alt',
      street: 'Hauptstr. 1',
      city: '12345 Berlin',
      invoiceDate: '2026-10-05T00:00:00.000Z',
      title: 'Raummiete',
      lineItems: [{ text: 'Raummiete 6 Monate\n7,5 h/Woche', priceInCents: 182813 }],
      vat: 19,
      directDebit: false,
      email: 'anna@example.org',
      emailSalutation: 'Hallo',
    },
    filePath: null,
    createdAt: '2026-10-05T10:00:00.000Z',
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    id: 1,
    number: '1 / 2026',
    paid: false,
    status: 'AKTIV',
    recipient: {
      id: 7,
      name: 'Anna Alt',
      street: 'Hauptstr. 1',
      city: '12345 Berlin',
      email: null,
      salutation: null,
    },
    invoiceDate: '2026-10-05T00:00:00.000Z',
    emailSubject: 'Ihre Rechnung {number}',
    emailBody: 'Hallo\n\nanbei Ihre Rechnung {number}.',
    createdAt: '2026-10-05T10:00:00.000Z',
    activeRevision: null,
    revisions: [revision({})],
    ...overrides,
  };
}

type Reply = { status: number; body?: unknown };
let replies: Record<string, Reply>;
const push = vi.fn();

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
  return fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(InvoiceDetailView, {
    global: withPrimeVue({ stubs: { RouterLink: { template: '<a><slot /></a>' } } }),
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  replies = { 'GET /api/invoice/1': { status: 200, body: makeInvoice() } };
  fetchMock.mockClear();
  push.mockReset();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRoute).mockReturnValue({ params: { id: '1' } } as unknown as ReturnType<
    typeof useRoute
  >);
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceDetailView', () => {
  it('shows number, status and the newest revision expanded', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Invoice 1 / 2026');
    expect(wrapper.find('[data-testid="invoice-status"]').text()).toBe('Active');
    expect(wrapper.text()).toContain('Revision 1');
    expect(wrapper.text()).toContain('2.175,47');
  });

  it('keeps line breaks in line item texts', async () => {
    const wrapper = await mountView();
    const text = wrapper.find('[data-testid="line-item-text"]');
    expect(text.classes()).toContain('line-items__text');
    expect(text.element.textContent).toBe('Raummiete 6 Monate\n7,5 h/Woche');
  });

  it('expands only the newest of several revisions', async () => {
    replies['GET /api/invoice/1'] = {
      status: 200,
      body: makeInvoice({
        revisions: [
          revision({ id: 12, revisionNumber: 2 }),
          revision({ id: 11, revisionNumber: 1, status: 'ERSETZT' }),
        ],
      }),
    };
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Revision 2');
    expect(wrapper.text()).toContain('Revision 1');
    expect(wrapper.findAll('[data-testid="line-item-text"]')).toHaveLength(1);
  });

  it('cancels after confirmation and reloads', async () => {
    replies['PATCH /api/invoice/1/cancel'] = { status: 200, body: {} };
    const wrapper = await mountView();

    await wrapper.find('[data-testid="cancel-invoice"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(calls()).toEqual([
      'GET /api/invoice/1',
      'PATCH /api/invoice/1/cancel',
      'GET /api/invoice/1',
    ]);
    expect(notify.success).toHaveBeenCalledWith('Invoice cancelled');
  });

  it('does not cancel when the confirmation is declined', async () => {
    confirmAction.mockResolvedValue(false);
    const wrapper = await mountView();
    await wrapper.find('[data-testid="cancel-invoice"]').trigger('click');
    await flushPromises();
    expect(calls()).toEqual(['GET /api/invoice/1']);
  });

  it('shows the cancel error', async () => {
    replies['PATCH /api/invoice/1/cancel'] = { status: 400, body: { error: 'Already cancelled' } };
    const wrapper = await mountView();
    await wrapper.find('[data-testid="cancel-invoice"]').trigger('click');
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Already cancelled');
  });

  it('hides revision and cancel actions for cancelled invoices', async () => {
    replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice({ status: 'STORNIERT' }) };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="new-revision"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cancel-invoice"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="duplicate"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="send-email"]').exists()).toBe(false);
  });

  it('sends the email only after confirmation', async () => {
    replies['POST /api/invoice/revision/11/send-email'] = { status: 200, body: {} };
    const wrapper = await mountView();

    confirmAction.mockResolvedValueOnce(false);
    await wrapper.find('[data-testid="send-email"]').trigger('click');
    await flushPromises();
    expect(calls()).not.toContain('POST /api/invoice/revision/11/send-email');

    await wrapper.find('[data-testid="send-email"]').trigger('click');
    await flushPromises();
    expect(calls()).toContain('POST /api/invoice/revision/11/send-email');
    expect(notify.success).toHaveBeenCalledWith('Email sent successfully');
  });

  it('names the invoice and the address in the send confirmation', async () => {
    confirmAction.mockResolvedValueOnce(false);
    const wrapper = await mountView();

    await wrapper.find('[data-testid="send-email"]').trigger('click');

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Send invoice 1 / 2026 to anna@example.org?' }),
    );
  });

  it('cannot send an invoice that has no email address', async () => {
    replies['GET /api/invoice/1'] = {
      status: 200,
      body: makeInvoice({
        revisions: [revision({ inputs: { ...revision({}).inputs, email: '' } })],
      }),
    };
    const wrapper = await mountView();

    const send = wrapper.find('[data-testid="send-email"]');
    expect(send.attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="no-email-hint"]').text()).toBe(
      'No email address on this invoice',
    );
  });

  it('sends a test email without confirmation', async () => {
    replies['POST /api/invoice/revision/11/send-test-email'] = {
      status: 400,
      body: { emailError: 'SMTP down' },
    };
    const wrapper = await mountView();
    await wrapper.find('[data-testid="send-test-email"]').trigger('click');
    await flushPromises();
    expect(confirmAction).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith('SMTP down');
  });

  it('offers PDF regeneration for a failed PDF', async () => {
    replies['GET /api/invoice/1'] = {
      status: 200,
      body: makeInvoice({
        revisions: [
          revision({ pdfStatus: 'FAILED', pdfError: 'Template broken', pdfTechError: 'stack' }),
        ],
      }),
    };
    replies['POST /api/invoice/revision/11/retry-pdf'] = { status: 200, body: {} };
    const wrapper = await mountView();

    expect(wrapper.text()).toContain('Template broken');
    expect(wrapper.find('[data-testid="download-pdf"]').exists()).toBe(false);
    await wrapper.find('[data-testid="retry-pdf"]').trigger('click');
    await flushPromises();
    expect(notify.success).toHaveBeenCalledWith('PDF generated successfully');
  });

  it('warns instead of reporting success when the retry fails again', async () => {
    replies['GET /api/invoice/1'] = {
      status: 200,
      body: makeInvoice({
        revisions: [revision({ pdfStatus: 'FAILED', pdfError: 'Template broken' })],
      }),
    };
    replies['POST /api/invoice/revision/11/retry-pdf'] = {
      status: 200,
      body: { pdfStatus: 'FAILED', pdfError: 'Still broken' },
    };
    const wrapper = await mountView();
    await wrapper.find('[data-testid="retry-pdf"]').trigger('click');
    await flushPromises();
    expect(notify.warn).toHaveBeenCalledWith('Still broken');
    expect(notify.success).not.toHaveBeenCalled();
  });

  describe('while a PDF is being generated', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      replies['GET /api/invoice/1'] = {
        status: 200,
        body: makeInvoice({ revisions: [revision({ pdfStatus: 'PENDING' })] }),
      };
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function loads(): number {
      return calls().filter((c) => c === 'GET /api/invoice/1').length;
    }

    it('reloads until the PDF is ready and then offers the download', async () => {
      const wrapper = await mountView();
      expect(wrapper.find('[data-testid="download-pdf"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();
      expect(loads()).toBe(2);

      replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice() };
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();
      expect(loads()).toBe(3);
      expect(wrapper.find('[data-testid="download-pdf"]').exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(10_000);
      await flushPromises();
      expect(loads()).toBe(3);
    });

    it('stops reloading when the page is left', async () => {
      const wrapper = await mountView();
      wrapper.unmount();

      await vi.advanceTimersByTimeAsync(10_000);
      await flushPromises();
      expect(loads()).toBe(1);
    });

    it('gives up after a few minutes', async () => {
      await mountView();

      await vi.advanceTimersByTimeAsync(10 * 60_000);
      await flushPromises();
      const afterCap = loads();
      await vi.advanceTimersByTimeAsync(60_000);
      await flushPromises();

      expect(afterCap).toBeLessThan(200);
      expect(loads()).toBe(afterCap);
    });
  });

  it('opens the PDF download', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const wrapper = await mountView();
    await wrapper.find('[data-testid="download-pdf"]').trigger('click');
    expect(open).toHaveBeenCalledWith('/api/invoice/revision/11/download', '_blank');
  });

  it('shows a load error', async () => {
    replies['GET /api/invoice/1'] = { status: 404, body: {} };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="load-error"]').text()).toContain(
      'Invoice could not be loaded',
    );
  });

  it('keeps the loaded invoice and toasts when a reload fails', async () => {
    replies['PATCH /api/invoice/1/cancel'] = { status: 200, body: {} };
    const wrapper = await mountView();
    delete replies['GET /api/invoice/1']; // the reload now fails on the network

    await wrapper.find('[data-testid="cancel-invoice"]').trigger('click');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Network error');
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="invoice-status"]').exists()).toBe(true);
  });

  it('clears an earlier load error when a reload succeeds', async () => {
    replies['GET /api/invoice/1'] = { status: 404, body: {} };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(true);
    replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice() };
    await (wrapper.vm as unknown as { loadData: () => Promise<void> }).loadData();
    await flushPromises();
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="invoice-status"]').exists()).toBe(true);
  });

  it('shows the guard error of a rejected send and reloads the revision', async () => {
    replies['POST /api/invoice/revision/11/send-email'] = {
      status: 400,
      body: { error: 'Email can only be sent for the latest revision' },
    };
    const wrapper = await mountView();
    await wrapper.find('[data-testid="send-email"]').trigger('click');
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Email can only be sent for the latest revision');
    expect(calls()).toEqual([
      'GET /api/invoice/1',
      'POST /api/invoice/revision/11/send-email',
      'GET /api/invoice/1',
    ]);
  });

  it('shows the guard error of a rejected test email', async () => {
    replies['POST /api/invoice/revision/11/send-test-email'] = {
      status: 400,
      body: { error: 'Revision not found' },
    };
    const wrapper = await mountView();
    await wrapper.find('[data-testid="send-test-email"]').trigger('click');
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Revision not found');
  });

  it('marks an open invoice as paid after confirming', async () => {
    replies['PATCH /api/invoice/1/paid'] = { status: 200, body: { id: 1, paid: true } };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="payment-status"]').text()).toBe('Open');

    replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice({ paid: true }) };
    await wrapper.find('[data-testid="mark-paid"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ acceptLabel: 'Mark as paid' }),
    );
    const patch = fetchMock.mock.calls.find(([url]) => url === '/api/invoice/1/paid');
    expect(patch?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ paid: true });
    expect(notify.success).toHaveBeenCalledWith('Invoice marked as paid');
    expect(wrapper.find('[data-testid="payment-status"]').text()).toBe('Paid');
    expect(wrapper.find('[data-testid="mark-paid"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mark-unpaid"]').exists()).toBe(true);
  });

  it('marks a paid invoice as unpaid after confirming', async () => {
    replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice({ paid: true }) };
    replies['PATCH /api/invoice/1/paid'] = { status: 200, body: { id: 1, paid: false } };
    const wrapper = await mountView();

    await wrapper.find('[data-testid="mark-unpaid"]').trigger('click');
    await flushPromises();

    const patch = fetchMock.mock.calls.find(([url]) => url === '/api/invoice/1/paid');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ paid: false });
    expect(notify.success).toHaveBeenCalledWith('Invoice marked as unpaid');
  });

  it('changes nothing when the confirmation is declined', async () => {
    confirmAction.mockResolvedValue(false);
    const wrapper = await mountView();
    await wrapper.find('[data-testid="mark-paid"]').trigger('click');
    await flushPromises();
    expect(calls()).not.toContain('PATCH /api/invoice/1/paid');
  });

  it('offers no paid button for a cancelled open invoice, but unpaid for a cancelled paid one', async () => {
    replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice({ status: 'STORNIERT' }) };
    const open = await mountView();
    expect(open.find('[data-testid="mark-paid"]').exists()).toBe(false);
    expect(open.find('[data-testid="payment-status"]').text()).toBe('—');

    replies['GET /api/invoice/1'] = {
      status: 200,
      body: makeInvoice({ status: 'STORNIERT', paid: true }),
    };
    const paid = await mountView();
    expect(paid.find('[data-testid="mark-unpaid"]').exists()).toBe(true);
  });
});
