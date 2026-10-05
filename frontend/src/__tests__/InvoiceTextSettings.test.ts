import { flushPromises, mount } from '@vue/test-utils';
import { DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE, type InstructorDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceTextSettings from '../components/InvoiceTextSettings.vue';

const instructor: InstructorDto = {
  id: 1,
  recipient: {
    id: 7,
    name: 'Bernd Bach',
    street: 'Weg 1',
    city: 'Stadt',
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

let storedTemplate: string | null;
let fetchMock: ReturnType<typeof vi.fn>;

function mountCard(previewInstructorId: number | null = 1) {
  return mount(InvoiceTextSettings, {
    props: { previewInstructorId, weeksPerMonth: 3.25 },
    attachTo: document.body,
  });
}

function textarea(wrapper: ReturnType<typeof mountCard>) {
  return wrapper.find('[data-testid="invoice-template"]').element as HTMLTextAreaElement;
}

describe('InvoiceTextSettings', () => {
  beforeEach(() => {
    storedTemplate = null;
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/instructor/settings' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { invoiceTemplate: string | null };
        // Like the server: a blank template means "default".
        storedTemplate = body.invoiceTemplate?.trim() ? body.invoiceTemplate : null;
        return Promise.resolve(
          jsonResponse({ weeksPerMonth: 3.25, invoiceTemplate: storedTemplate }),
        );
      }
      if (url === '/api/instructor/settings') {
        return Promise.resolve(
          jsonResponse({ weeksPerMonth: 3.25, invoiceTemplate: storedTemplate }),
        );
      }
      if (url === '/api/instructor/1') return Promise.resolve(jsonResponse(instructor));
      return Promise.resolve(jsonResponse({}, false));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('shows the default text with a hint when none is configured', async () => {
    const wrapper = mountCard();
    await flushPromises();

    expect(textarea(wrapper).value).toBe(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(true);
  });

  it('shows a configured template without the default hint', async () => {
    storedTemplate = 'Miete {name}';
    const wrapper = mountCard();
    await flushPromises();

    expect(textarea(wrapper).value).toBe('Miete {name}');
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(false);
  });

  it('previews the text with the first instructor', async () => {
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.find('[data-testid="invoice-template-preview"]').element.textContent).toBe(
      'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €',
    );
    expect(wrapper.find('[data-testid="invoice-template-example-caption"]').exists()).toBe(false);
  });

  it('previews with example values when there is no instructor', async () => {
    const wrapper = mountCard(null);
    await flushPromises();

    expect(wrapper.find('[data-testid="invoice-template-preview"]').element.textContent).toBe(
      'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,50 €',
    );
    expect(wrapper.find('[data-testid="invoice-template-example-caption"]').exists()).toBe(true);
  });

  it('updates the preview while typing', async () => {
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="invoice-template"]').setValue('Für {name}\n{zeiten}');

    expect(wrapper.find('[data-testid="invoice-template-preview"]').element.textContent).toBe(
      'Für Bernd Bach\nMo 08:00–15:30',
    );
  });

  it('previews the default text when the textarea is blank', async () => {
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="invoice-template"]').setValue('   ');

    expect(wrapper.find('[data-testid="invoice-template-preview"]').element.textContent).toBe(
      'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €',
    );
  });

  it('shows the default text after saving a blank template', async () => {
    storedTemplate = 'Miete {name}';
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('[data-testid="invoice-template"]').setValue('   ');

    await wrapper.find('[data-testid="save-invoice-template"]').trigger('click');
    await flushPromises();

    expect(textarea(wrapper).value).toBe(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(true);
  });

  it('flags unknown placeholders and disables save', async () => {
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="invoice-template"]').setValue('Raummiete {monat}');

    expect(wrapper.find('[data-testid="invoice-template-error"]').text()).toBe(
      'Unknown placeholders: {monat}',
    );
    expect(
      wrapper.find('[data-testid="save-invoice-template"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('inserts a placeholder at the cursor', async () => {
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('[data-testid="invoice-template"]').setValue('AB');
    textarea(wrapper).setSelectionRange(1, 1);

    await wrapper.find('[data-testid="placeholder-name"]').trigger('click');

    expect(textarea(wrapper).value).toBe('A{name}B');
  });

  it('saves the template', async () => {
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('[data-testid="invoice-template"]').setValue('Miete {name}');

    await wrapper.find('[data-testid="save-invoice-template"]').trigger('click');
    await flushPromises();

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ invoiceTemplate: 'Miete {name}' });
    expect(wrapper.find('[data-testid="invoice-template-saved"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(false);
  });

  it('resets to the default after confirmation', async () => {
    storedTemplate = 'Miete {name}';
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="reset-invoice-template"]').trigger('click');
    await flushPromises();

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ invoiceTemplate: null });
    expect(textarea(wrapper).value).toBe(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(true);
  });

  it('shows the server error when saving fails', async () => {
    const wrapper = mountCard();
    await flushPromises();
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({ error: 'Invoice text must be at most 2000 characters' }, false),
      ),
    );

    await wrapper.find('[data-testid="save-invoice-template"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="invoice-template-error"]').text()).toBe(
      'Invoice text must be at most 2000 characters',
    );
  });

  it('disables save when the settings cannot be loaded', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, false)));
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.find('[data-testid="invoice-template-error"]').text()).toBe(
      'Could not load invoice text',
    );
    expect(
      wrapper.find('[data-testid="save-invoice-template"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('keeps the load error and the disabled save after typing', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, false)));
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="invoice-template"]').setValue('Miete {name}');

    expect(wrapper.find('[data-testid="invoice-template-error"]').text()).toBe(
      'Could not load invoice text',
    );
    expect(
      wrapper.find('[data-testid="save-invoice-template"]').attributes('disabled'),
    ).toBeDefined();
  });
});
