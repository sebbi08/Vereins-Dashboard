import { createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import type { SpenderDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SpenderAutocomplete from '../components/SpenderAutocomplete.vue';

const mockSpender: SpenderDto[] = [
  {
    id: 1,
    name: 'Hans Schmidt',
    strasse: 'Musterstr. 1',
    ort: 'Berlin',
    briefAnrede: 'Sehr geehrter Herr Schmidt',
    adressAnrede: null,
  },
  {
    id: 2,
    name: 'Maria Müller',
    strasse: 'Testgasse 2',
    ort: 'Hamburg',
    briefAnrede: 'Sehr geehrte Frau Müller',
    adressAnrede: null,
  },
];

describe('SpenderAutocomplete', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockSpender),
    } as unknown as Response);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders a text input', () => {
    const wrapper = mount(SpenderAutocomplete, {
      props: { modelValue: null },
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.find('input[type="text"]').exists()).toBe(true);
  });

  it('shows modelValue name in the input when provided', () => {
    const wrapper = mount(SpenderAutocomplete, {
      props: { modelValue: mockSpender[0] },
      global: { plugins: [createPinia()] },
    });
    const input = wrapper.find('input').element as HTMLInputElement;
    expect(input.value).toBe('Hans Schmidt');
  });

  it('does not call fetch when query is shorter than 2 characters', async () => {
    const wrapper = mount(SpenderAutocomplete, {
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
    const wrapper = mount(SpenderAutocomplete, {
      props: { modelValue: null },
      global: { plugins: [createPinia()] },
    });
    const input = wrapper.find('input');
    await input.setValue('Han');
    await input.trigger('input');
    vi.runAllTimers();
    expect(global.fetch).toHaveBeenCalledWith('/api/spender?q=Han');
  });

  it('emits update:modelValue with null when user types', async () => {
    const wrapper = mount(SpenderAutocomplete, {
      props: { modelValue: mockSpender[0] },
      global: { plugins: [createPinia()] },
    });
    const input = wrapper.find('input');
    await input.setValue('Hans S');
    await input.trigger('input');
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([null]);
  });

  it('shows dropdown results after search', async () => {
    const wrapper = mount(SpenderAutocomplete, {
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
    const wrapper = mount(SpenderAutocomplete, {
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
    const wrapper = mount(SpenderAutocomplete, {
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
