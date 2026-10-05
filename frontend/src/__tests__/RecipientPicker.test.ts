import { flushPromises, mount } from '@vue/test-utils';
import type { InvoiceRecipientDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecipientPicker from '../components/RecipientPicker.vue';
import { emptyRecipient, type RecipientFormValue, toRecipientData } from '../utils/recipientForm';

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

function lastEmitted(wrapper: ReturnType<typeof mount>): RecipientFormValue {
  const events = wrapper.emitted('update:modelValue') as RecipientFormValue[][];
  return events[events.length - 1][0];
}

describe('RecipientPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(recipients) } as Response),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('searches recipients after typing and shows suggestions', async () => {
    const wrapper = mount(RecipientPicker, { props: { modelValue: emptyRecipient() } });

    await wrapper.find('[data-testid="recipient-search"]').setValue('An');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith('/api/invoice-recipient?search=An');
    expect(wrapper.findAll('[data-testid="recipient-suggestion"]')).toHaveLength(1);
  });

  it('emits the selected recipient with its id', async () => {
    const wrapper = mount(RecipientPicker, { props: { modelValue: emptyRecipient() } });
    await wrapper.find('[data-testid="recipient-search"]').setValue('An');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    await wrapper.find('[data-testid="recipient-suggestion"]').trigger('click');

    expect(lastEmitted(wrapper)).toEqual({
      id: 7,
      name: 'Anna Alt',
      street: 'Hauptstr. 1',
      city: '12345 Berlin',
      email: 'anna@example.org',
      salutation: 'Frau',
    });
  });

  it.each(['recipient-suggestion', 'recipient-new'])(
    'cancels a pending search when %s is clicked before the timer fires',
    async (testId) => {
      const wrapper = mount(RecipientPicker, { props: { modelValue: emptyRecipient() } });
      const searchInput = wrapper.find('[data-testid="recipient-search"]');
      await searchInput.setValue('An');
      await vi.advanceTimersByTimeAsync(300);
      await flushPromises();

      await searchInput.setValue('Ann');
      await wrapper.find(`[data-testid="${testId}"]`).trigger('click');
      await vi.advanceTimersByTimeAsync(300);
      await flushPromises();

      expect(wrapper.findAll('[data-testid="recipient-suggestion"]')).toHaveLength(0);
    },
  );

  it('ignores a search response when the search text changed meanwhile', async () => {
    let resolveFirst: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveFirst = resolve)),
    );
    const wrapper = mount(RecipientPicker, { props: { modelValue: emptyRecipient() } });
    const searchInput = wrapper.find('[data-testid="recipient-search"]');
    await searchInput.setValue('An');
    await vi.advanceTimersByTimeAsync(300);

    await searchInput.setValue('');
    resolveFirst({ ok: true, json: () => Promise.resolve(recipients) } as Response);
    await flushPromises();

    expect(wrapper.findAll('[data-testid="recipient-suggestion"]')).toHaveLength(0);
  });

  it('clears suggestions when the search request fails', async () => {
    const wrapper = mount(RecipientPicker, { props: { modelValue: emptyRecipient() } });
    const searchInput = wrapper.find('[data-testid="recipient-search"]');
    await searchInput.setValue('An');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(wrapper.findAll('[data-testid="recipient-suggestion"]')).toHaveLength(1);

    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await searchInput.setValue('Ann');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(wrapper.findAll('[data-testid="recipient-suggestion"]')).toHaveLength(0);
  });

  it('emits edits to fields and keeps the linked id', async () => {
    const linked: RecipientFormValue = { ...emptyRecipient(), id: 7, name: 'Anna Alt' };
    const wrapper = mount(RecipientPicker, { props: { modelValue: linked } });

    expect(wrapper.find('[data-testid="recipient-linked-hint"]').exists()).toBe(true);
    await wrapper.find('[data-testid="recipient-street"]').setValue('Neue Str. 2');

    expect(lastEmitted(wrapper)).toMatchObject({ id: 7, name: 'Anna Alt', street: 'Neue Str. 2' });
  });

  it('starts a new recipient with the search text as name', async () => {
    const linked: RecipientFormValue = { ...emptyRecipient(), id: 7, name: 'Anna Alt' };
    const wrapper = mount(RecipientPicker, { props: { modelValue: linked } });
    await wrapper.find('[data-testid="recipient-search"]').setValue('Carla Cron');

    await wrapper.find('[data-testid="recipient-new"]').trigger('click');

    expect(lastEmitted(wrapper)).toEqual({ ...emptyRecipient(), name: 'Carla Cron' });
  });

  it('converts form values to request data with nulls for empty optionals', () => {
    expect(
      toRecipientData({ id: null, name: 'A', street: 'B', city: 'C', email: '', salutation: '' }),
    ).toEqual({ name: 'A', street: 'B', city: 'C', email: null, salutation: null });
  });
});
