import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { InstructorInvoiceRequestDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstructorInvoiceRequests from '../components/InstructorInvoiceRequests.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const instructors = [
  { id: 2, name: 'Bernd Bach' },
  { id: 1, name: 'Anna Alt' },
];

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;
let requestsByYear: Record<string, InstructorInvoiceRequestDto[]>;

const LIST_URL = /^\/api\/instructor\/invoice-requests\?year=(\d+)$/;

const defaultFetch: FetchImpl = (url, init) => {
  const list = LIST_URL.exec(url);
  if (list && !init?.method) return Promise.resolve(jsonResponse(requestsByYear[list[1]] ?? []));
  if (init?.method === 'PUT' || init?.method === 'DELETE') {
    return Promise.resolve({ ok: true, status: 204 } as Response);
  }
  return Promise.resolve(jsonResponse({}, false));
};

async function mountCard(list = instructors) {
  const wrapper = mount(InstructorInvoiceRequests, {
    props: { instructors: list },
    attachTo: document.body,
    global: withPrimeVue(),
  });
  await flushPromises();
  return wrapper;
}

function cell(wrapper: VueWrapper, instructorId: number, month: string) {
  return wrapper.find(`[data-testid="request-${instructorId}-${month}"]`);
}

function cellButtons(wrapper: VueWrapper) {
  return wrapper.findAll('[data-testid^="request-"]').filter((b) => b.element.tagName === 'BUTTON');
}

async function click(wrapper: VueWrapper, testId: string) {
  await wrapper.find(`[data-testid="${testId}"]`).trigger('click');
  await flushPromises();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 7)); // 7 October 2026
  requestsByYear = { '2026': [{ instructorId: 1, month: '2026-03' }] };
  fetchMock = vi.fn(defaultFetch);
  vi.stubGlobal('fetch', fetchMock);
  Object.values(notify).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('InstructorInvoiceRequests', () => {
  it('shows one row per instructor sorted by name and the 12 months of the current year', async () => {
    const wrapper = await mountCard();

    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/invoice-requests?year=2026');
    expect(wrapper.find('[data-testid="request-year"]').text()).toBe('2026');
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual(['Instructor', ...MONTHS]);
    const rows = wrapper.findAll('[data-testid="invoice-request-row"]');
    expect(rows.map((row) => row.find('th').text())).toEqual(['Anna Alt', 'Bernd Bach']);
    expect(cellButtons(wrapper)).toHaveLength(24);
  });

  it('sorts rows by name the German way', async () => {
    const wrapper = await mountCard([
      { id: 1, name: 'Zoe Zander' },
      { id: 2, name: 'Özge Öz' },
      { id: 3, name: 'Paul Pohl' },
    ]);
    const rows = wrapper.findAll('[data-testid="invoice-request-row"]');
    expect(rows.map((row) => row.find('th').text())).toEqual([
      'Özge Öz',
      'Paul Pohl',
      'Zoe Zander',
    ]);
  });

  it('ticks the months returned by the server', async () => {
    const wrapper = await mountCard();

    const ticked = cell(wrapper, 1, '2026-03');
    expect(ticked.attributes('aria-pressed')).toBe('true');
    expect(ticked.attributes('aria-label')).toBe('Anna Alt, March 2026: requested');
    expect(ticked.find('.pi-check').exists()).toBe(true);

    const open = cell(wrapper, 1, '2026-04');
    expect(open.attributes('aria-pressed')).toBe('false');
    expect(open.attributes('aria-label')).toBe('Anna Alt, April 2026: not requested');
    expect(open.find('.pi-check').exists()).toBe(false);
  });

  it('marks a month with PUT and unmarks it with DELETE', async () => {
    const wrapper = await mountCard();

    await cell(wrapper, 2, '2026-10').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/2/invoice-requests/2026-10', {
      method: 'PUT',
    });
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 2, '2026-10').attributes('aria-label')).toBe(
      'Bernd Bach, October 2026: requested',
    );

    await cell(wrapper, 1, '2026-03').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/1/invoice-requests/2026-03', {
      method: 'DELETE',
    });
    expect(cell(wrapper, 1, '2026-03').attributes('aria-pressed')).toBe('false');
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('flips the cell at once and disables it until the save is done', async () => {
    const save = deferred<Response>();
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? save.promise : defaultFetch(url, init),
    );
    const wrapper = await mountCard();

    await cell(wrapper, 2, '2026-10').trigger('click');
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 2, '2026-10').attributes('disabled')).toBeDefined();

    save.resolve({ ok: true, status: 204 } as Response);
    await flushPromises();
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 2, '2026-10').attributes('disabled')).toBeUndefined();
  });

  it.each([
    ['responds with an error', () => Promise.resolve(jsonResponse({ error: 'x' }, false))],
    ['is unreachable', () => Promise.reject(new Error('offline'))],
  ])('reverts the cell and toasts when the save %s', async (_label, reply) => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method ? reply() : defaultFetch(url, init),
    );
    const wrapper = await mountCard();

    await cell(wrapper, 2, '2026-10').trigger('click');
    await flushPromises();
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('false');

    await cell(wrapper, 1, '2026-03').trigger('click');
    await flushPromises();
    expect(cell(wrapper, 1, '2026-03').attributes('aria-pressed')).toBe('true');

    expect(notify.error).toHaveBeenCalledTimes(2);
    expect(notify.error).toHaveBeenCalledWith('Could not save the invoice request');
  });

  it('loads another year with the year switcher', async () => {
    requestsByYear['2027'] = [{ instructorId: 2, month: '2027-01' }];
    const wrapper = await mountCard();

    await click(wrapper, 'next-year');
    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/invoice-requests?year=2027');
    expect(wrapper.find('[data-testid="request-year"]').text()).toBe('2027');
    expect(cell(wrapper, 2, '2027-01').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 2, '2027-01').attributes('aria-label')).toBe(
      'Bernd Bach, January 2027: requested',
    );
    expect(cell(wrapper, 1, '2026-03').exists()).toBe(false);

    await click(wrapper, 'previous-year');
    await click(wrapper, 'previous-year');
    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/invoice-requests?year=2025');
    expect(wrapper.find('[data-testid="request-year"]').text()).toBe('2025');
  });

  it.each([
    [
      'succeeds',
      (d: ReturnType<typeof deferred<Response>>) =>
        d.resolve(jsonResponse([{ instructorId: 1, month: '2026-03' }])),
    ],
    ['fails', (d: ReturnType<typeof deferred<Response>>) => d.reject(new Error('offline'))],
  ])('ignores a late response for a year no longer shown when it %s', async (_label, settle) => {
    const stale = deferred<Response>();
    requestsByYear['2027'] = [{ instructorId: 1, month: '2027-01' }];
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url.endsWith('year=2026') ? stale.promise : defaultFetch(url, init),
    );
    const wrapper = await mountCard();

    await click(wrapper, 'next-year');
    settle(stale);
    await flushPromises();

    expect(cell(wrapper, 1, '2027-01').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 1, '2027-01').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="invoice-requests-load-error"]').exists()).toBe(false);
  });

  it('highlights the current month only in the current year', async () => {
    const wrapper = await mountCard();

    const headers = wrapper.findAll('thead th');
    expect(headers.filter((th) => th.classes('current')).map((th) => th.text())).toEqual(['Oct']);
    expect(cell(wrapper, 1, '2026-10').element.closest('td')?.classList.contains('current')).toBe(
      true,
    );

    await click(wrapper, 'next-year');
    expect(wrapper.findAll('thead th').some((th) => th.classes('current'))).toBe(false);
  });

  it.each([
    ['responds with an error', () => Promise.resolve(jsonResponse({}, false))],
    ['is unreachable', () => Promise.reject(new Error('offline'))],
  ])('shows an error and disables every cell when loading %s', async (_label, reply) => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      LIST_URL.test(url) ? reply() : defaultFetch(url, init),
    );
    const wrapper = await mountCard();

    expect(wrapper.find('[data-testid="invoice-requests-load-error"]').text()).toBe(
      'Invoice requests could not be loaded.',
    );
    expect(cellButtons(wrapper).every((b) => b.attributes('disabled') !== undefined)).toBe(true);

    await cell(wrapper, 1, '2026-10').trigger('click');
    await flushPromises();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method)).toBe(false);
  });

  it('disables every cell while the year is loading', async () => {
    const list = deferred<Response>();
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      LIST_URL.test(url) ? list.promise : defaultFetch(url, init),
    );
    const wrapper = await mountCard();
    expect(cellButtons(wrapper).every((b) => b.attributes('disabled') !== undefined)).toBe(true);

    list.resolve(jsonResponse([]));
    await flushPromises();
    expect(cellButtons(wrapper).every((b) => b.attributes('disabled') === undefined)).toBe(true);
  });

  it('keeps a cell that is still saving when its year is shown again', async () => {
    const save = deferred<Response>();
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? save.promise : defaultFetch(url, init),
    );
    const wrapper = await mountCard();

    await cell(wrapper, 2, '2026-10').trigger('click');
    await click(wrapper, 'next-year');
    await click(wrapper, 'previous-year');
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('true');

    save.resolve({ ok: true, status: 204 } as Response);
    await flushPromises();
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 2, '2026-10').attributes('disabled')).toBeUndefined();
  });

  it.each([
    [new Date(2000, 0, 15), 'previous-year', 'next-year'],
    [new Date(2100, 11, 15), 'next-year', 'previous-year'],
  ])('stops the year switcher at the supported range (%s)', async (today, stopped, open) => {
    vi.setSystemTime(today);
    const wrapper = await mountCard();
    expect(wrapper.find(`[data-testid="${stopped}"]`).attributes('disabled')).toBeDefined();
    expect(wrapper.find(`[data-testid="${open}"]`).attributes('disabled')).toBeUndefined();
  });

  it('shows the empty state without instructors', async () => {
    const wrapper = await mountCard([]);
    expect(wrapper.find('[data-testid="invoice-requests-empty"]').text()).toBe(
      'No instructors yet.',
    );
    expect(wrapper.find('table').exists()).toBe(false);
  });
});
