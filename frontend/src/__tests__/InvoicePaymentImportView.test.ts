import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { Booking, BookingImportSettings, MatchCandidate, MatchResult } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import { formatCents } from '../utils/format';
import type { MatchRow } from '../utils/paymentSelection';
import InvoicePaymentImportView from '../views/InvoicePaymentImportView.vue';
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
  settings: BookingImportSettings;
  encoding: string;
  rows: MatchRow[];
  choose: (row: MatchRow, invoiceId: number | null) => void;
}

function vm(wrapper: VueWrapper): ViewVM {
  return wrapper.vm as unknown as ViewVM;
}

const STORED: BookingImportSettings = {
  encoding: 'utf-8',
  delimiter: ';',
  columns: { date: 'Datum', payer: 'Name', purpose: 'Zweck', amount: 'Betrag' },
};

// Row 3 is outgoing (dropped), row 4 has an unreadable amount (skipped)
const CSV =
  'Datum;Name;Zweck;Betrag\n' +
  '10.03.2026;Anna Alt;Miete;59,50\n' +
  '11.03.2026;Bernd Bach;"RE 2/2026; danke";40,00\n' +
  '12.03.2026;Stadtwerke;Strom;-10,00\n' +
  '13.03.2026;Clara Cord;Beitrag;zwölf\n';

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    invoiceId: 1,
    invoiceNumber: '1 / 2026',
    recipientName: 'Anna Alt',
    invoiceDate: '2026-03-01',
    amountCents: 5950,
    reasons: ['AMOUNT', 'NAME'],
    differenceCents: 0,
    ...overrides,
  };
}

function bookingOf(row: number, overrides: Partial<Booking> = {}): Booking {
  return {
    row,
    date: '2026-03-10',
    payer: 'Anna Alt',
    purpose: 'Miete',
    amountCents: 5950,
    ...overrides,
  };
}

const RESULT: MatchResult = {
  matches: [
    { booking: bookingOf(1), level: 'CONFIDENT', candidates: [candidate()] },
    {
      booking: bookingOf(2, {
        date: '2026-03-11',
        payer: 'Bernd Bach',
        purpose: 'RE 2/2026; danke',
        amountCents: 4000,
      }),
      level: 'AMOUNT_DIFFERS',
      candidates: [
        candidate({
          invoiceId: 2,
          invoiceNumber: '2 / 2026',
          recipientName: 'Bernd Bach',
          amountCents: 4100,
          reasons: ['INVOICE_NUMBER'],
          differenceCents: -100,
        }),
      ],
    },
  ],
  unmatched: [],
};

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

function sentBody(method: string, url: string): unknown {
  const call = fetchMock.mock.calls.find(
    ([u, init]) => u === url && (init?.method ?? 'GET') === method,
  );
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(InvoicePaymentImportView, {
    attachTo: document.body,
    global: withPrimeVue(),
  });
  await flushPromises();
  return wrapper;
}

async function chooseFile(wrapper: VueWrapper, content: string | Uint8Array<ArrayBuffer>) {
  const file = new File([content], 'bookings.csv');
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  await vi.waitFor(() => expect(wrapper.find('[data-testid="csv-preview"]').exists()).toBe(true));
  await flushPromises();
}

async function runMatch(wrapper: VueWrapper) {
  await chooseFile(wrapper, CSV);
  await wrapper.find('[data-testid="match-bookings"]').trigger('click');
  await flushPromises();
}

function headerCells(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[data-testid="csv-preview"] th').map((th) => th.text());
}

function matchButton(wrapper: VueWrapper) {
  return wrapper.find('[data-testid="match-bookings"]');
}

function checkbox(wrapper: VueWrapper, key: number) {
  return wrapper.find(`[data-testid="match-select-${key}"] input`);
}

beforeEach(() => {
  replies = {
    'GET /api/settings/booking-import': { status: 200, body: STORED },
    'PUT /api/settings/booking-import': { status: 200, body: STORED },
    'POST /api/invoice-payment/match': { status: 200, body: RESULT },
  };
  fetchMock.mockClear();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<
    typeof useRouter
  >);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoicePaymentImportView', () => {
  it('previews the header and the first 3 rows with the stored settings', async () => {
    const wrapper = await mountView();
    await chooseFile(wrapper, CSV);

    expect(headerCells(wrapper)).toEqual(['Datum', 'Name', 'Zweck', 'Betrag']);
    const preview = wrapper.find('[data-testid="csv-preview"]');
    expect(preview.findAll('tbody tr')).toHaveLength(3);
    expect(preview.text()).toContain('RE 2/2026; danke');
    expect(preview.text()).not.toContain('Clara Cord');
    expect(preview.findAll('th.mapped')).toHaveLength(4);
    expect(matchButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('updates the preview when the delimiter changes', async () => {
    const wrapper = await mountView();
    await chooseFile(wrapper, CSV);

    vm(wrapper).settings.delimiter = ',';
    await flushPromises();

    expect(headerCells(wrapper)).toEqual(['Datum;Name;Zweck;Betrag']);
    expect(matchButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('updates the preview when the encoding changes', async () => {
    const head = new TextEncoder().encode('Datum;Name;Zweck;Betrag\n10.03.2026;M');
    const tail = new TextEncoder().encode('ller;Miete;59,50\n');
    const wrapper = await mountView();
    await chooseFile(wrapper, new Uint8Array([...head, 0xfc, ...tail]));
    expect(wrapper.find('[data-testid="csv-preview"]').text()).not.toContain('Müller');

    vm(wrapper).settings.encoding = 'windows-1252';
    await flushPromises();
    expect(wrapper.find('[data-testid="csv-preview"]').text()).toContain('Müller');
  });

  it('shows the encoding a byte order mark states', async () => {
    const text = 'Datum;Name;Zweck;Betrag\n10.03.2026;Anna;Miete;59,50\n';
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) bytes[2 + i * 2] = text.charCodeAt(i);
    const wrapper = await mountView();
    await chooseFile(wrapper, bytes);

    expect(vm(wrapper).encoding).toBe('utf-16le');
    expect(headerCells(wrapper)).toEqual(['Datum', 'Name', 'Zweck', 'Betrag']);
  });

  it('leaves a column unmapped when the file lacks the stored name', async () => {
    const wrapper = await mountView();
    await chooseFile(wrapper, 'Datum;Name;Zweck;Umsatz\n10.03.2026;Anna;Miete;59,50\n');
    expect(matchButton(wrapper).attributes('disabled')).toBeDefined();

    vm(wrapper).settings.columns.amount = 'Umsatz';
    await flushPromises();
    expect(matchButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('says when the file holds no bookings', async () => {
    const wrapper = await mountView();
    await chooseFile(wrapper, 'Datum;Name;Zweck;Betrag\n');
    expect(wrapper.find('[data-testid="no-bookings"]').text()).toContain(
      'The file contains no bookings',
    );
    expect(matchButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('falls back to the default settings when they cannot be loaded', async () => {
    replies['GET /api/settings/booking-import'] = { status: 500, body: {} };
    const wrapper = await mountView();
    expect(notify.error).toHaveBeenCalledWith('Import settings could not be loaded');
    expect(vm(wrapper).settings.encoding).toBe('utf-16le');
  });

  it('saves the settings, sends the incoming bookings and lists the proposals', async () => {
    const wrapper = await mountView();
    await runMatch(wrapper);

    expect(sentBody('PUT', '/api/settings/booking-import')).toEqual(STORED);
    expect(sentBody('POST', '/api/invoice-payment/match')).toEqual({
      bookings: [
        { row: 1, date: '2026-03-10', payer: 'Anna Alt', purpose: 'Miete', amountCents: 5950 },
        {
          row: 2,
          date: '2026-03-11',
          payer: 'Bernd Bach',
          purpose: 'RE 2/2026; danke',
          amountCents: 4000,
        },
      ],
    });

    const rows = wrapper.findAll('.match-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('Confident');
    expect(rows[0].text()).toContain('Amount · Name');
    expect(rows[1].text()).toContain('Amount differs');
    expect(rows[1].text()).toContain(formatCents(-100));
    expect((checkbox(wrapper, 0).element as HTMLInputElement).checked).toBe(true);
    expect((checkbox(wrapper, 1).element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.find('[data-testid="confirm-paid"]').text()).toContain('Mark 1 invoice as paid');

    const skipped = wrapper.find('[data-testid="skipped-rows"]');
    expect(skipped.text()).toContain('Skipped rows (1)');
    expect(skipped.text()).toContain('Unreadable amount');
    expect(skipped.text()).toContain('Clara Cord');
  });

  it('lets an invoice be selected in one row only', async () => {
    replies['POST /api/invoice-payment/match'] = {
      status: 200,
      body: {
        matches: [
          { booking: bookingOf(1), level: 'CONFIDENT', candidates: [candidate()] },
          { booking: bookingOf(2), level: 'CONFIDENT', candidates: [candidate()] },
        ],
        unmatched: [],
      },
    };
    const wrapper = await mountView();
    await runMatch(wrapper);

    expect(checkbox(wrapper, 1).attributes('disabled')).toBeDefined();
    await checkbox(wrapper, 0).setValue(false);
    await flushPromises();
    expect(checkbox(wrapper, 1).attributes('disabled')).toBeUndefined();
  });

  it('asks for a choice when a booking fits several invoices', async () => {
    replies['POST /api/invoice-payment/match'] = {
      status: 200,
      body: {
        matches: [
          {
            booking: bookingOf(1),
            level: 'AMOUNT_ONLY',
            candidates: [candidate(), candidate({ invoiceId: 2, invoiceNumber: '2 / 2026' })],
          },
        ],
        unmatched: [],
      },
    };
    const wrapper = await mountView();
    await runMatch(wrapper);

    expect(wrapper.find('[data-testid="candidate-select"]').exists()).toBe(true);
    expect(checkbox(wrapper, 0).attributes('disabled')).toBeDefined();

    vm(wrapper).choose(vm(wrapper).rows[0], 2);
    await flushPromises();
    expect(checkbox(wrapper, 0).attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="invoice-link"]').attributes('href')).toBe('/invoice/2');
  });

  it('marks the selected invoices as paid and removes their rows', async () => {
    replies['POST /api/invoice-payment/confirm'] = { status: 200, body: { marked: 1 } };
    const wrapper = await mountView();
    await runMatch(wrapper);

    await wrapper.find('[data-testid="confirm-paid"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Mark 1 invoice as paid?' }),
    );
    expect(sentBody('POST', '/api/invoice-payment/confirm')).toEqual({ invoiceIds: [1] });
    expect(notify.success).toHaveBeenCalledWith('1 invoice marked as paid');
    expect(wrapper.findAll('.match-row')).toHaveLength(1);
  });

  it('keeps the rows and explains a refused confirmation', async () => {
    replies['POST /api/invoice-payment/confirm'] = {
      status: 400,
      body: { error: 'CANCELLED', ids: [1] },
    };
    const wrapper = await mountView();
    await runMatch(wrapper);

    await wrapper.find('[data-testid="confirm-paid"]').trigger('click');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith(
      'Some invoices have been cancelled. Run the match again.',
    );
    expect(wrapper.findAll('.match-row')).toHaveLength(2);
  });

  it('lists the bookings without a match', async () => {
    replies['POST /api/invoice-payment/match'] = {
      status: 200,
      body: { matches: [], unmatched: [bookingOf(1)] },
    };
    const wrapper = await mountView();
    await runMatch(wrapper);

    const unmatched = wrapper.find('[data-testid="unmatched-bookings"]');
    expect(unmatched.text()).toContain('Bookings without a match (1)');
    expect(unmatched.text()).toContain('Anna Alt');
  });
});
