import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { InstructorDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import InstructorFormView from '../views/InstructorFormView.vue';
import { withPrimeVue } from './helpers/primeVue';

vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(),
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

function setup(params: Record<string, string> = {}) {
  (useRoute as ReturnType<typeof vi.fn>).mockReturnValue({ params, query: {} });
  return mount(InstructorFormView, { global: withPrimeVue() });
}

async function addMondayBlock(wrapper: VueWrapper, start: string, end: string) {
  await wrapper.find('[data-testid="add-block-MO"]').trigger('click');
  const blocks = wrapper.find('[data-testid="day-MO"]').findAll('[data-testid="block"]');
  const last = blocks[blocks.length - 1];
  await last.find('[data-testid="block-start"]').setValue(start);
  await last.find('[data-testid="block-end"]').setValue(end);
}

describe('InstructorFormView', () => {
  beforeEach(() => {
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/instructor/settings') {
        return Promise.resolve(jsonResponse({ weeksPerMonth: 3.25 }));
      }
      if (url === '/api/instructor/5' && !init?.method) {
        return Promise.resolve(jsonResponse(existing));
      }
      if (url === '/api/instructor' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ id: 9 }));
      }
      if (url === '/api/instructor/5' && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204 } as Response);
      }
      if (url === '/api/templates') return Promise.resolve(jsonResponse(templates));
      return Promise.resolve(jsonResponse({}, false));
    });
    templates = [{ type: 'RECHNUNG' }];
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: mockPush });
    setActivePinia(createPinia());
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates the live summary while editing', async () => {
    const wrapper = setup();
    await flushPromises();

    await wrapper.find('[data-testid="hourly-rate"]').setValue('12');
    await wrapper.find('[data-testid="months"]').setValue('6');
    await addMondayBlock(wrapper, '08:00', '15:30');

    expect(wrapper.find('[data-testid="summary-hours"]').text()).toContain('7,5');
    expect(wrapper.find('[data-testid="summary-monthly"]').text()).toContain('292,50');
    expect(wrapper.find('[data-testid="summary-total"]').text()).toContain('1.755,00');
  });

  it('shows an overlap error and disables save', async () => {
    const wrapper = setup();
    await flushPromises();
    await wrapper.find('[data-testid="recipient-name"]').setValue('Anna Alt');
    await wrapper.find('[data-testid="hourly-rate"]').setValue('12');
    await addMondayBlock(wrapper, '08:00', '12:00');
    await addMondayBlock(wrapper, '11:00', '13:00');

    expect(wrapper.text()).toContain('Time blocks on the same day must not overlap');
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeDefined();
  });

  it('shows a rate error for unparseable input', async () => {
    const wrapper = setup();
    await flushPromises();

    await wrapper.find('[data-testid="hourly-rate"]').setValue('abc');

    expect(wrapper.find('[data-testid="hourly-rate-error"]').text()).toBe(
      'Hourly rate must be greater than 0',
    );
  });

  it('posts the expected body for a new instructor and returns to the list', async () => {
    const wrapper = setup();
    await flushPromises();
    await wrapper.find('[data-testid="recipient-name"]').setValue('Anna Alt');
    await wrapper.find('[data-testid="recipient-street"]').setValue('Hauptstr. 1');
    await wrapper.find('[data-testid="recipient-city"]').setValue('12345 Berlin');
    await wrapper.find('[data-testid="hourly-rate"]').setValue('12,50');
    await wrapper.find('[data-testid="months"]').setValue('6');
    await addMondayBlock(wrapper, '08:00', '12:00');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/instructor');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
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
    expect(mockPush).toHaveBeenCalledWith('/instructor');
  });

  it('loads an existing instructor and offers invoice creation until edited', async () => {
    const wrapper = setup({ id: '5' });
    await flushPromises();

    expect((wrapper.find('[data-testid="hourly-rate"]').element as HTMLInputElement).value).toBe(
      '12,00',
    );
    const createInvoice = wrapper.find('[data-testid="create-invoice"]');
    expect(createInvoice.attributes('disabled')).toBeUndefined();
    await createInvoice.trigger('click');
    expect(mockPush).toHaveBeenCalledWith('/invoice/new?fromInstructor=5');

    await wrapper.find('[data-testid="months"]').setValue('3');
    expect(wrapper.find('[data-testid="create-invoice"]').attributes('disabled')).toBeDefined();
  });

  it('Save is the submit button of the form so Enter saves', async () => {
    const wrapper = setup();
    await flushPromises();

    expect(wrapper.find('[data-testid="save"]').attributes('type')).toBe('submit');
  });

  it('disables invoice creation without an active invoice template', async () => {
    templates = [];
    const wrapper = setup({ id: '5' });
    await flushPromises();

    const createInvoice = wrapper.find('[data-testid="create-invoice"]');
    expect(createInvoice.attributes('disabled')).toBeDefined();
    expect(createInvoice.attributes('title')).toBe('No active invoice template');

    await wrapper.find('[data-testid="months"]').setValue('3');
    expect(wrapper.find('[data-testid="create-invoice"]').attributes('title')).toBe(
      'Save your changes first',
    );
  });

  it('deletes after confirmation', async () => {
    const wrapper = setup({ id: '5' });
    await flushPromises();

    await wrapper.find('[data-testid="delete"]').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/5', { method: 'DELETE' });
    expect(mockPush).toHaveBeenCalledWith('/instructor');
  });

  it('shows the server error when saving fails', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/instructor/settings')
        return Promise.resolve(jsonResponse({ weeksPerMonth: 3.25 }));
      if (init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({ error: 'Recipient already has an instructor' }, false),
        );
      }
      return Promise.resolve(jsonResponse({}, false));
    });
    const wrapper = setup();
    await flushPromises();
    await wrapper.find('[data-testid="recipient-name"]').setValue('Anna Alt');
    await wrapper.find('[data-testid="hourly-rate"]').setValue('12');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="form-error"]').text()).toBe(
      'Recipient already has an instructor',
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
