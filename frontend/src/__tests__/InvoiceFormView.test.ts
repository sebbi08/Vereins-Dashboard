import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { InstructorInvoicePrefillDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import InvoiceFormView from '../views/InvoiceFormView.vue';

vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(),
}));

const prefill: InstructorInvoicePrefillDto = {
  recipient: {
    id: 7,
    name: 'Anna Alt',
    street: 'Hauptstr. 1',
    city: '12345 Berlin',
    email: 'anna@example.org',
    salutation: 'Frau',
  },
  title: 'Raummiete',
  lineItems: [
    {
      text: 'Raummiete 6 Monate (7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €)',
      priceInCents: 175500,
    },
  ],
};

interface InvoiceFormVM {
  inputs: {
    name: string;
    street: string;
    title: string;
    invoiceDate: string;
    lineItems: unknown[];
  };
  recipient: { id: number } | null;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

describe('InvoiceFormView — prefill from instructor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/templates') return Promise.resolve(jsonResponse([{ type: 'RECHNUNG' }]));
        if (url === '/api/instructor/5/invoice-prefill')
          return Promise.resolve(jsonResponse(prefill));
        return Promise.resolve(jsonResponse({}, false));
      }),
    );
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: vi.fn(), replace: vi.fn() });
    (useRoute as ReturnType<typeof vi.fn>).mockReturnValue({
      params: {},
      query: { fromInstructor: '5' },
    });
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills recipient, title, line item and today as invoice date', async () => {
    const wrapper = mount(InvoiceFormView);
    await flushPromises();

    const vm = wrapper.vm as unknown as InvoiceFormVM;
    expect(vm.recipient?.id).toBe(7);
    expect(vm.inputs.name).toBe('Anna Alt');
    expect(vm.inputs.street).toBe('Hauptstr. 1');
    expect(vm.inputs.title).toBe('Raummiete');
    expect(vm.inputs.lineItems).toEqual(prefill.lineItems);
    expect(vm.inputs.invoiceDate).toBe(new Date().toISOString().split('T')[0]);
  });
});
