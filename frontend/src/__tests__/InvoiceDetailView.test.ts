import { flushPromises, mount } from '@vue/test-utils';
import type { InvoiceDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import InvoiceDetailView from '../views/InvoiceDetailView.vue';

vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(),
}));

const invoice: InvoiceDto = {
  id: 1,
  number: '1 / 2026',
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
  createdAt: '2026-10-05T10:00:00.000Z',
  activeRevision: null,
  revisions: [
    {
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
        email: '',
        emailSalutation: 'Hallo',
      },
      filePath: null,
      createdAt: '2026-10-05T10:00:00.000Z',
    },
  ],
};

describe('InvoiceDetailView', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(invoice) } as Response),
    );
    (useRoute as ReturnType<typeof vi.fn>).mockReturnValue({ params: { id: '1' } });
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps line breaks in line item texts', async () => {
    const wrapper = mount(InvoiceDetailView, {
      global: { stubs: { 'router-link': { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    const text = wrapper.find('[data-testid="line-item-text"]');
    expect(text.classes()).toContain('whitespace-pre-line');
    expect(text.element.textContent).toBe('Raummiete 6 Monate\n7,5 h/Woche');
  });
});
