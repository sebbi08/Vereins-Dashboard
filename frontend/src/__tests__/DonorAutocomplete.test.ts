import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import AutoComplete from 'primevue/autocomplete';
import type { DonorDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DonorAutocomplete from '../components/DonorAutocomplete.vue';
import { withPrimeVue } from './helpers/primeVue';

const donors: DonorDto[] = [
  {
    id: 1,
    name: 'Hans Schmidt',
    street: 'Musterstr. 1',
    city: 'Berlin',
    letterSalutation: 'Sehr geehrter Herr Schmidt',
    addressSalutation: null,
  },
  {
    id: 2,
    name: 'Maria Müller',
    street: 'Testgasse 2',
    city: 'Hamburg',
    letterSalutation: 'Sehr geehrte Frau Müller',
    addressSalutation: null,
  },
];

function newDonorOption(name: string): DonorDto {
  return { id: -1, name, street: '', city: '', letterSalutation: '' };
}

function mountPicker(modelValue: DonorDto | null = null) {
  return mount(DonorAutocomplete, {
    props: { modelValue, inputId: 'donor-input' },
    global: withPrimeVue(),
  });
}

function autocomplete(wrapper: VueWrapper) {
  return wrapper.findComponent(AutoComplete);
}

function input(wrapper: VueWrapper): HTMLInputElement {
  return wrapper.find('input#donor-input').element as HTMLInputElement;
}

async function complete(wrapper: VueWrapper, query: string) {
  autocomplete(wrapper).vm.$emit('complete', { originalEvent: new Event('input'), query });
  await flushPromises();
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(donors) }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DonorAutocomplete', () => {
  it('renders a search input with the given id', () => {
    const wrapper = mountPicker();
    expect(input(wrapper).placeholder).toBe('Search donor…');
    expect(wrapper.attributes('data-testid')).toBe('donor-search');
  });

  it('shows the selected donor name and follows the model', async () => {
    const wrapper = mountPicker(donors[0]);
    expect(input(wrapper).value).toBe('Hans Schmidt');
    await wrapper.setProps({ modelValue: donors[1] });
    expect(input(wrapper).value).toBe('Maria Müller');
  });

  it('does not search below 2 characters', async () => {
    const wrapper = mountPicker();
    await complete(wrapper, 'H');
    expect(fetch).not.toHaveBeenCalled();
    expect(autocomplete(wrapper).props('suggestions')).toEqual([]);
  });

  it('searches donors and offers a new donor last', async () => {
    const wrapper = mountPicker();
    await complete(wrapper, 'Han');
    expect(fetch).toHaveBeenCalledWith('/api/donor?q=Han');
    expect(autocomplete(wrapper).props('suggestions')).toEqual([...donors, newDonorOption('Han')]);
  });

  it('trims and encodes the query', async () => {
    const wrapper = mountPicker();
    await complete(wrapper, ' Mü ller ');
    expect(fetch).toHaveBeenCalledWith('/api/donor?q=M%C3%BC%20ller');
  });

  it('still offers a new donor when the search fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const wrapper = mountPicker();
    await complete(wrapper, 'Han');
    expect(autocomplete(wrapper).props('suggestions')).toEqual([newDonorOption('Han')]);
  });

  it('keeps the selected donor while the user types in the search', async () => {
    // Unlinking on every keystroke silently turned a typo fix into a duplicate donor
    const wrapper = mountPicker(donors[0]);
    autocomplete(wrapper).vm.$emit('update:modelValue', 'Hans S');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('ignores a search response that arrives after a newer one', async () => {
    let answerFirst!: (value: unknown) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([donors[1]]) });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPicker();

    autocomplete(wrapper).vm.$emit('complete', { originalEvent: new Event('input'), query: 'Ha' });
    await complete(wrapper, 'Mar');
    answerFirst({ ok: true, json: () => Promise.resolve([donors[0]]) });
    await flushPromises();

    expect(autocomplete(wrapper).props('suggestions')).toEqual([donors[1], newDonorOption('Mar')]);
  });

  it('emits the picked donor', async () => {
    const wrapper = mountPicker();
    autocomplete(wrapper).vm.$emit('update:modelValue', donors[0]);
    autocomplete(wrapper).vm.$emit('option-select', {
      originalEvent: new Event('click'),
      value: donors[0],
    });
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([[donors[0]]]);
    expect(input(wrapper).value).toBe('Hans Schmidt');
  });

  it('emits "neu" with the typed name for the new-donor option', async () => {
    const wrapper = mountPicker();
    await complete(wrapper, 'Neue Person');
    autocomplete(wrapper).vm.$emit('option-select', {
      originalEvent: new Event('click'),
      value: newDonorOption('Neue Person'),
    });
    await flushPromises();
    expect(wrapper.emitted('neu')).toEqual([[{ name: 'Neue Person', street: '', city: '' }]]);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
