import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { InstructorListItemDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import InstructorView from '../views/InstructorView.vue';

vi.mock('vue-router', () => ({
  useRouter: vi.fn(),
}));

const mockPush = vi.fn();

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

let fetchMock: ReturnType<typeof vi.fn>;

function mountView() {
  return mount(InstructorView, {
    global: { stubs: { 'router-link': { template: '<a><slot /></a>' } } },
  });
}

describe('InstructorView', () => {
  beforeEach(() => {
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/instructor') return Promise.resolve(jsonResponse(instructors));
      if (url === '/api/instructor/settings' && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse(JSON.parse(String(init.body))));
      }
      if (url === '/api/instructor/settings') {
        return Promise.resolve(jsonResponse({ weeksPerMonth: 3.25 }));
      }
      if (url === '/api/templates') return Promise.resolve(jsonResponse([{ type: 'RECHNUNG' }]));
      return Promise.resolve(jsonResponse({}, false));
    });
    vi.stubGlobal('fetch', fetchMock);
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: mockPush });
    setActivePinia(createPinia());
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders one row per instructor and the sum of totals', async () => {
    const wrapper = mountView();
    await flushPromises();

    const rows = wrapper.findAll('[data-testid="instructor-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('Anna Alt');
    expect(rows[0].text()).toContain('7,5');
    expect(rows[0].text()).toContain('1.755,00');
    expect(wrapper.find('[data-testid="footer-total"]').text()).toContain('1.787,50');
  });

  it('loads the weeks-per-month setting into the input', async () => {
    const wrapper = mountView();
    await flushPromises();

    const input = wrapper.find('[data-testid="weeks-per-month"]').element as HTMLInputElement;
    expect(input.value).toBe('3.25');
  });

  it('saves the setting and reloads the list', async () => {
    const wrapper = mountView();
    await flushPromises();
    const listCallsBefore = fetchMock.mock.calls.filter(([u]) => u === '/api/instructor').length;

    await wrapper.find('[data-testid="weeks-per-month"]').setValue('4');
    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();

    const putCall = fetchMock.mock.calls.find(
      ([u, init]) => u === '/api/instructor/settings' && init?.method === 'PUT',
    );
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ weeksPerMonth: 4 });
    const listCallsAfter = fetchMock.mock.calls.filter(([u]) => u === '/api/instructor').length;
    expect(listCallsAfter).toBe(listCallsBefore + 1);
  });

  it('shows a validation error and does not save weeks per month of 0', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('[data-testid="weeks-per-month"]').setValue('0');
    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="settings-error"]').text()).toBe(
      'Weeks per month must be greater than 0',
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('navigates to a prefilled invoice', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('[data-testid="create-invoice-1"]').trigger('click');

    expect(mockPush).toHaveBeenCalledWith('/invoice/new?fromInstructor=1');
  });

  it('opens the instructor on row click', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.findAll('[data-testid="instructor-row"]')[1].trigger('click');

    expect(mockPush).toHaveBeenCalledWith('/instructor/2');
  });

  it('does not open the instructor when Enter is pressed on the create-invoice button', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('[data-testid="create-invoice-1"]').trigger('keydown', { key: 'Enter' });

    expect(mockPush).not.toHaveBeenCalledWith('/instructor/1');
  });
});
