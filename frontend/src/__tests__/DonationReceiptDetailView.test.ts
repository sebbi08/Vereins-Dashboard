import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { DonationReceiptDto, DonationReceiptRevisionDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import DonationReceiptDetailView from '../views/DonationReceiptDetailView.vue';
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

function revision(overrides: Partial<DonationReceiptRevisionDto>): DonationReceiptRevisionDto {
  return {
    id: 31,
    revisionNumber: 1,
    status: 'AKTIV',
    pdfStatus: 'OK',
    pdfError: null,
    pdfTechError: null,
    inputs: {
      name: 'Hans Schmidt',
      street: 'Musterstr. 1',
      city: 'Berlin',
      letterSalutation: 'Sehr geehrter Herr Schmidt',
      addressSalutation: null,
      donationAmountCents: 25000,
      donationDate: '2026-02-01T00:00:00.000Z',
      withCoverLetter: true,
      treasurer: 'Kim Kasse',
      charitablePurpose: 'Förderung des Sports',
      taxOfficeName: 'FA Mitte',
      taxNumber: '12/345/67890',
      exemptionDate: '',
      assessmentPeriod: '2021–2023',
    },
    filePath: 'receipts/31.pdf',
    createdAt: '2026-02-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<DonationReceiptDto> = {}): DonationReceiptDto {
  return {
    id: 3,
    number: 'SQ-2026-003',
    status: 'AKTIV',
    donor: {
      id: 7,
      name: 'Hans Schmidt',
      street: 'Musterstr. 1',
      city: 'Berlin',
      letterSalutation: 'Sehr geehrter Herr Schmidt',
      addressSalutation: null,
    },
    donationDate: '2026-02-01T00:00:00.000Z',
    createdAt: '2026-02-01T10:00:00.000Z',
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
  const wrapper = mount(DonationReceiptDetailView, {
    global: withPrimeVue({ stubs: { RouterLink: { template: '<a><slot /></a>' } } }),
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  replies = { 'GET /api/donation-receipt/3': { status: 200, body: makeReceipt() } };
  fetchMock.mockClear();
  push.mockReset();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRoute).mockReturnValue({ params: { id: '3' } } as unknown as ReturnType<
    typeof useRoute
  >);
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DonationReceiptDetailView', () => {
  it('shows number, status, donor and the newest revision expanded', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Receipt SQ-2026-003');
    expect(wrapper.find('[data-testid="receipt-status"]').text()).toBe('Active');
    expect(wrapper.text()).toContain('01.02.2026');
    expect(wrapper.text()).toContain('Musterstr. 1, Berlin');
    expect(wrapper.text()).toContain('Revision 1');
    expect(wrapper.text()).toContain('250,00');
  });

  it('shows association data, cover letter flag and placeholders for empty values', async () => {
    const wrapper = await mountView();
    const facts = wrapper.find('[data-testid="revision-facts"]').text();
    expect(facts).toContain('FA Mitte');
    expect(facts).toContain('12/345/67890');
    expect(facts).toContain('Förderung des Sports');
    expect(facts).toContain('Yes');
    expect(facts).toMatch(/Exemption Date\s*—/);
    expect(facts).toMatch(/Address Salutation\s*—/);
  });

  it('formats a set exemption date', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({
        revisions: [revision({ inputs: { ...revision({}).inputs, exemptionDate: '2024-05-02' } })],
      }),
    };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="revision-facts"]').text()).toContain('02.05.2024');
  });

  it('expands only the newest of several revisions', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({
        revisions: [
          revision({ id: 32, revisionNumber: 2 }),
          revision({ id: 31, revisionNumber: 1, status: 'ERSETZT' }),
        ],
      }),
    };
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Revision 2');
    expect(wrapper.text()).toContain('Revision 1');
    expect(wrapper.findAll('[data-testid="revision-facts"]')).toHaveLength(1);
  });

  it('copes with a receipt without a revisions list', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({ revisions: undefined }),
    };
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('No revisions available');
  });

  it('cancels after confirmation and reloads', async () => {
    replies['PATCH /api/donation-receipt/3/cancel'] = { status: 200, body: {} };
    const wrapper = await mountView();

    await wrapper.find('[data-testid="cancel-receipt"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ header: 'Cancel receipt', danger: true }),
    );
    expect(calls()).toEqual([
      'GET /api/donation-receipt/3',
      'PATCH /api/donation-receipt/3/cancel',
      'GET /api/donation-receipt/3',
    ]);
    expect(notify.success).toHaveBeenCalledWith('Receipt cancelled');
  });

  it('does not cancel when the confirmation is declined', async () => {
    confirmAction.mockResolvedValue(false);
    const wrapper = await mountView();
    await wrapper.find('[data-testid="cancel-receipt"]').trigger('click');
    await flushPromises();
    expect(calls()).toEqual(['GET /api/donation-receipt/3']);
  });

  it('shows the cancel error', async () => {
    replies['PATCH /api/donation-receipt/3/cancel'] = {
      status: 400,
      body: { error: 'Already cancelled' },
    };
    const wrapper = await mountView();
    await wrapper.find('[data-testid="cancel-receipt"]').trigger('click');
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Already cancelled');
  });

  it('keeps the receipt on screen when a reload fails', async () => {
    replies['PATCH /api/donation-receipt/3/cancel'] = { status: 200, body: {} };
    const wrapper = await mountView();
    replies['GET /api/donation-receipt/3'] = { status: 500, body: {} };

    await wrapper.find('[data-testid="cancel-receipt"]').trigger('click');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Receipt could not be loaded');
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Receipt SQ-2026-003');
  });

  it('hides revision and cancel actions for cancelled receipts', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({ status: 'STORNIERT' }),
    };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="receipt-status"]').text()).toBe('Cancelled');
    expect(wrapper.find('[data-testid="new-revision"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cancel-receipt"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="duplicate"]').exists()).toBe(true);
  });

  it('navigates to new revision and duplicate', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="new-revision"]').trigger('click');
    await wrapper.find('[data-testid="duplicate"]').trigger('click');
    expect(push).toHaveBeenNthCalledWith(1, '/donation-receipt/3/revision');
    expect(push).toHaveBeenNthCalledWith(2, '/donation-receipt/new?copyFrom=3');
  });

  it('offers PDF regeneration for a failed PDF on the current revision', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({
        revisions: [
          revision({ pdfStatus: 'FAILED', pdfError: 'Template broken', pdfTechError: 'stack' }),
        ],
      }),
    };
    replies['POST /api/donation-receipt/revision/31/retry-pdf'] = { status: 200, body: {} };
    const wrapper = await mountView();

    expect(wrapper.find('[data-testid="pdf-failure"]').text()).toContain('Template broken');
    expect(wrapper.find('[data-testid="download-pdf"]').exists()).toBe(false);
    await wrapper.find('[data-testid="retry-pdf"]').trigger('click');
    await flushPromises();
    expect(calls()).toContain('POST /api/donation-receipt/revision/31/retry-pdf');
    expect(notify.success).toHaveBeenCalledWith('PDF generated successfully');
  });

  it('does not offer regeneration for a superseded revision', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({ revisions: [revision({ pdfStatus: 'FAILED', status: 'ERSETZT' })] }),
    };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="retry-pdf"]').exists()).toBe(false);
  });

  it('opens the PDF download', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const wrapper = await mountView();
    await wrapper.find('[data-testid="download-pdf"]').trigger('click');
    expect(open).toHaveBeenCalledWith('/api/donation-receipt/revision/31/download', '_blank');
  });

  it('shows a load error', async () => {
    replies['GET /api/donation-receipt/3'] = { status: 404, body: {} };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="load-error"]').text()).toContain(
      'Receipt could not be loaded',
    );
  });
});
