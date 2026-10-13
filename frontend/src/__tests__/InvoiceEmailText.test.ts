import { flushPromises, mount } from '@vue/test-utils';
import type { EmailTextValues } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import InvoiceEmailText from '../components/InvoiceEmailText.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

const source: EmailTextValues & { street: string } = {
  emailSalutation: 'Hallo Anna',
  name: 'Anna Alt',
  title: 'Raummiete',
  email: 'anna@example.org',
  street: 'not part of the request',
};

let reply: { status: number; body?: unknown };
const fetchMock = vi.fn(async () => ({
  ok: reply.status < 400,
  status: reply.status,
  json: () => Promise.resolve(reply.body),
}));

/** A parent that holds the three models, as the form and the invoice page do. */
function mountEditor(options: { subject?: string; body?: string; disabled?: boolean } = {}) {
  const subject = ref(options.subject ?? 'Rechnung {number}');
  const body = ref(options.body ?? 'Hallo,\n\nanbei.');
  const invalid = ref(false);
  const Parent = defineComponent({
    setup: () => () =>
      h(InvoiceEmailText, {
        subject: subject.value,
        'onUpdate:subject': (value: string) => (subject.value = value),
        body: body.value,
        'onUpdate:body': (value: string) => (body.value = value),
        invalid: invalid.value,
        'onUpdate:invalid': (value: boolean) => (invalid.value = value),
        source,
        disabled: options.disabled ?? false,
      }),
  });
  const wrapper = mount(Parent, { attachTo: document.body, global: withPrimeVue() });
  return { wrapper, subject, body, invalid };
}

beforeEach(() => {
  reply = { status: 200, body: { emailSubject: 'Neu {number}', emailBody: 'Neuer Text' } };
  fetchMock.mockClear();
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceEmailText', () => {
  it('shows subject and text and passes edits on', async () => {
    const { wrapper, subject, body } = mountEditor();
    const subjectInput = wrapper.find('[data-testid="email-subject"]');
    const bodyInput = wrapper.find('[data-testid="email-body"]');
    expect((subjectInput.element as HTMLInputElement).value).toBe('Rechnung {number}');
    expect((bodyInput.element as HTMLTextAreaElement).value).toBe('Hallo,\n\nanbei.');

    await subjectInput.setValue('Mein Betreff');
    await bodyInput.setValue('Mein Text');
    expect(subject.value).toBe('Mein Betreff');
    expect(body.value).toBe('Mein Text');
  });

  it('says that {number} is filled in when the email is sent', () => {
    const { wrapper } = mountEditor();
    expect(wrapper.text()).toContain(
      '{number} is replaced by the invoice number when the email is sent.',
    );
  });

  it('reports a blank subject', async () => {
    const { wrapper, invalid } = mountEditor();
    expect(invalid.value).toBe(false);
    expect(wrapper.find('[data-testid="error-email-subject"]').exists()).toBe(false);

    await wrapper.find('[data-testid="email-subject"]').setValue('   ');
    await flushPromises();
    expect(invalid.value).toBe(true);
    expect(wrapper.find('[data-testid="error-email-subject"]').text()).toBe(
      'Email subject is required',
    );
  });

  it('resets both fields from the template, built from the given values', async () => {
    const { wrapper, subject, body } = mountEditor();

    await wrapper.find('[data-testid="reset-email-text"]').trigger('click');
    await flushPromises();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/email-settings/invoice-text');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      emailSalutation: 'Hallo Anna',
      name: 'Anna Alt',
      title: 'Raummiete',
      email: 'anna@example.org',
    });
    expect(subject.value).toBe('Neu {number}');
    expect(body.value).toBe('Neuer Text');
  });

  it('keeps the fields and says so when the reset fails', async () => {
    reply = { status: 500, body: {} };
    const { wrapper, subject, body } = mountEditor();

    await wrapper.find('[data-testid="reset-email-text"]').trigger('click');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Email text could not be loaded from the template');
    expect(subject.value).toBe('Rechnung {number}');
    expect(body.value).toBe('Hallo,\n\nanbei.');
  });

  it('is read-only when disabled', () => {
    const { wrapper } = mountEditor({ disabled: true });
    expect(wrapper.find('[data-testid="email-subject"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="email-body"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="reset-email-text"]').exists()).toBe(false);
  });
});
