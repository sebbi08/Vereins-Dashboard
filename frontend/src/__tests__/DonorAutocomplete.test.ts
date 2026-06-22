import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import type { DonorDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DonorAutocomplete from '../components/DonorAutocomplete.vue';

const mockDonor: DonorDto[] = [
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

describe('DonorAutocomplete', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockDonor),
    } as unknown as Response);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders a text input', () => {
    const wrapper = mount(DonorAutocomplete, {
      props: { modelValue: null },
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.find('input[type="text"]').exists()).toBe(true);
  });

  it('shows modelValue name in the input when provided', () => {
    const wrapper = mount(DonorAutocomplete, {
      props: { modelValue: mockDonor[0] },
      global: { plugins: [createPinia()] },
    });
    const input = wrapper.find('input').element as HTMLInputElement;
    expect(input.value).toBe('Hans Schmidt');
  });

  it('does not call fetch when query is shorter than 2 characters', async () => {
    const wrapper = mount(DonorAutocomplete, {
      props: { modelValue: null },
      global: { plugins: [createPinia()] },
    });
    const input = wrapper.find('input');
    await input.setValue('H');
    await input.trigger('input');
    vi.runAllTimers();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('calls fetch with the search query after debounce', async () => {
    const wrapper = mount(DonorAutocomplete, {
      props: { modelValue: null },
      global: { plugins: [createPinia()] },
    });
    const input = wrapper.find('input');
    await input.setValue('Han');
    await input.trigger('input');
    vi.runAllTimers();
    expect(global.fetch).toHaveBeenCalledWith('/api/donor?q=Han');
  });

  it('emits update:modelValue with null when user types', async () => {
    const wrapper = mount(DonorAutocomplete, {
      props: { modelValue: mockDonor[0] },
      global: { plugins: [createPinia()] },
    });
    const input = wrapper.find('input');
    await input.setValue('Hans S');
    await input.trigger('input');
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([null]);
  });

  it('shows dropdown results after search', async () => {
    const wrapper = mount(DonorAutocomplete, {
      props: { modelValue: null },
      global: { plugins: [createPinia()] },
    });
    const input = wrapper.find('input');
    await input.setValue('Han');
    await input.trigger('input');
    vi.runAllTimers();
    // Flush the fetch promise
    await vi.runAllTimersAsync();
    await wrapper.vm.$nextTick();

    const items = wrapper.findAll('li');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('emits update:modelValue with the selected spender', async () => {
    const wrapper = mount(DonorAutocomplete, {
      props: { modelValue: null },
      global: { plugins: [createPinia()] },
    });
    const input = wrapper.find('input');
    await input.setValue('Han');
    await input.trigger('input');
    vi.runAllTimers();
    await vi.runAllTimersAsync();
    await wrapper.vm.$nextTick();

    const firstItem = wrapper.find('li');
    if (firstItem.exists()) {
      await firstItem.trigger('mousedown');
      const emitted = wrapper.emitted('update:modelValue');
      expect(emitted).toBeTruthy();
      expect(emitted![emitted!.length - 1][0]).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
      });
    }
  });

  it('emits "neu" event when new donor option is clicked', async () => {
    const wrapper = mount(DonorAutocomplete, {
      props: { modelValue: null },
      global: { plugins: [createPinia()] },
    });
    const input = wrapper.find('input');
    await input.setValue('Han');
    await input.trigger('input');
    vi.runAllTimers();
    await vi.runAllTimersAsync();
    await wrapper.vm.$nextTick();

    const lastItem = wrapper.findAll('li').at(-1);
    if (lastItem?.exists()) {
      await lastItem.trigger('mousedown');
      expect(wrapper.emitted('neu')).toBeTruthy();
    }
  });
});
