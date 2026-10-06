import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import AutoComplete from 'primevue/autocomplete';
import type { InvoiceRecipientDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecipientPicker from '../components/RecipientPicker.vue';
import { emptyRecipient, type RecipientFormValue, toRecipientData } from '../utils/recipientForm';
import { withPrimeVue } from './helpers/primeVue';

const recipients: InvoiceRecipientDto[] = [
  {
    id: 7,
    name: 'Anna Alt',
    street: 'Hauptstr. 1',
    city: '12345 Berlin',
    email: 'anna@example.org',
    salutation: 'Frau',
  },
];

function mountPicker(modelValue: RecipientFormValue = emptyRecipient()) {
  return mount(RecipientPicker, { props: { modelValue }, global: withPrimeVue() });
}

function autocomplete(wrapper: VueWrapper) {
  return wrapper.findComponent(AutoComplete);
}

function lastEmitted(wrapper: VueWrapper): RecipientFormValue {
  const events = wrapper.emitted('update:modelValue') as RecipientFormValue[][];
  return events[events.length - 1][0];
}

async function typeSearch(wrapper: VueWrapper, text: string) {
  autocomplete(wrapper).vm.$emit('update:modelValue', text);
  await flushPromises();
}

function complete(wrapper: VueWrapper, query: string) {
  autocomplete(wrapper).vm.$emit('complete', { originalEvent: new Event('input'), query });
}

function okResponse(body: unknown): Response {
  return { ok: true, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(recipients)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RecipientPicker', () => {
  it('labels the search and all recipient fields', () => {
    const wrapper = mountPicker();
    expect(wrapper.find('label[for="recipient-search"]').text()).toBe('Search or create recipient');
    expect(wrapper.find('input#recipient-search').exists()).toBe(true);
    for (const key of ['salutation', 'name', 'street', 'city', 'email']) {
      expect(wrapper.find(`label[for="recipient-${key}"]`).exists()).toBe(true);
      expect(wrapper.find(`input#recipient-${key}`).attributes('data-testid')).toBe(
        `recipient-${key}`,
      );
    }
  });

  it('searches recipients and offers them as suggestions', async () => {
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'An');
    complete(wrapper, 'An');
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith('/api/invoice-recipient?search=An');
    expect(autocomplete(wrapper).props('suggestions')).toEqual(recipients);
  });

  it('emits the picked recipient with its id', async () => {
    const wrapper = mountPicker();
    autocomplete(wrapper).vm.$emit('update:modelValue', recipients[0]);
    autocomplete(wrapper).vm.$emit('option-select', {
      originalEvent: new Event('click'),
      value: recipients[0],
    });
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toEqual([
      [
        {
          id: 7,
          name: 'Anna Alt',
          street: 'Hauptstr. 1',
          city: '12345 Berlin',
          email: 'anna@example.org',
          salutation: 'Frau',
        },
      ],
    ]);
    expect((wrapper.find('input#recipient-search').element as HTMLInputElement).value).toBe(
      'Anna Alt',
    );
  });

  it('typing in the search does not change the recipient', async () => {
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'Anna');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('ignores a search response when the search text changed meanwhile', async () => {
    let resolveFirst: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveFirst = resolve)),
    );
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'An');
    complete(wrapper, 'An');

    await typeSearch(wrapper, '');
    resolveFirst(okResponse(recipients));
    await flushPromises();

    expect(autocomplete(wrapper).props('suggestions')).toEqual([]);
  });

  it('keeps the suggestions while typing until the next response arrives', async () => {
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'An');
    complete(wrapper, 'An');
    await flushPromises();
    expect(autocomplete(wrapper).props('suggestions')).toEqual(recipients);

    let resolveNext: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveNext = resolve)),
    );
    await typeSearch(wrapper, 'Ann');
    expect(autocomplete(wrapper).props('suggestions')).toEqual(recipients);

    complete(wrapper, 'Ann');
    await flushPromises();
    expect(autocomplete(wrapper).props('suggestions')).toEqual(recipients);
    resolveNext(okResponse([]));
    await flushPromises();
    expect(autocomplete(wrapper).props('suggestions')).toEqual([]);
  });

  it('ignores a response for the old query that arrives after more typing', async () => {
    let resolveFirst: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveFirst = resolve)),
    );
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'An');
    complete(wrapper, 'An');

    await typeSearch(wrapper, 'Ann');
    resolveFirst(okResponse(recipients));
    await flushPromises();

    expect(autocomplete(wrapper).props('suggestions')).toEqual([]);
  });

  it('ignores a search response that arrives after "New recipient"', async () => {
    let resolveFirst: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveFirst = resolve)),
    );
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'An');
    complete(wrapper, 'An');

    await wrapper.find('[data-testid="recipient-new"]').trigger('click');
    resolveFirst(okResponse(recipients));
    await flushPromises();

    expect(autocomplete(wrapper).props('suggestions')).toEqual([]);
  });

  it('clears suggestions when the search request fails', async () => {
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'An');
    complete(wrapper, 'An');
    await flushPromises();
    expect(autocomplete(wrapper).props('suggestions')).toHaveLength(1);

    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await typeSearch(wrapper, 'Ann');
    complete(wrapper, 'Ann');
    await flushPromises();

    expect(autocomplete(wrapper).props('suggestions')).toEqual([]);
  });

  it('emits field edits and keeps the linked id', async () => {
    const linked: RecipientFormValue = { ...emptyRecipient(), id: 7, name: 'Anna Alt' };
    const wrapper = mountPicker(linked);

    expect(wrapper.find('[data-testid="recipient-linked-hint"]').exists()).toBe(true);
    await wrapper.find('[data-testid="recipient-street"]').setValue('Neue Str. 2');

    expect(lastEmitted(wrapper)).toMatchObject({ id: 7, name: 'Anna Alt', street: 'Neue Str. 2' });
  });

  it('has no linked hint for a new recipient', () => {
    const wrapper = mountPicker();
    expect(wrapper.find('[data-testid="recipient-linked-hint"]').exists()).toBe(false);
  });

  it('starts a new recipient with the trimmed search text as name', async () => {
    const linked: RecipientFormValue = { ...emptyRecipient(), id: 7, name: 'Anna Alt' };
    const wrapper = mountPicker(linked);
    await typeSearch(wrapper, ' Carla Cron ');

    await wrapper.find('[data-testid="recipient-new"]').trigger('click');

    expect(lastEmitted(wrapper)).toEqual({ ...emptyRecipient(), name: 'Carla Cron' });
  });

  it('shows the linked recipient name in the search box when the model changes', async () => {
    const wrapper = mountPicker();
    await wrapper.setProps({ modelValue: { ...emptyRecipient(), id: 9, name: 'Bernd Bach' } });
    expect((wrapper.find('input#recipient-search').element as HTMLInputElement).value).toBe(
      'Bernd Bach',
    );
  });

  it('converts form values to request data with nulls for empty optionals', () => {
    expect(
      toRecipientData({ id: null, name: 'A', street: 'B', city: 'C', email: '', salutation: '' }),
    ).toEqual({ name: 'A', street: 'B', city: 'C', email: null, salutation: null });
  });
});
