import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AmountRangeFilter from '../components/ui/AmountRangeFilter.vue';
import { withPrimeVue } from './helpers/primeVue';

function mountFilter(modelValue: [number | null, number | null] | null) {
  return mount(AmountRangeFilter, {
    props: { modelValue, label: 'Amount' },
    global: withPrimeVue(),
  });
}

describe('AmountRangeFilter', () => {
  it('renders from/to inputs with labels', () => {
    const wrapper = mountFilter(null);
    expect(wrapper.find('[data-testid="amount-from"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="amount-to"]').exists()).toBe(true);
    expect(wrapper.html()).toContain('Amount from');
    expect(wrapper.html()).toContain('Amount to');
  });

  it('emits the range when one end changes', async () => {
    const wrapper = mountFilter(null);
    await wrapper.find('[data-testid="amount-from"] input').setValue('10');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[10, null]]);
  });

  it('emits a decimal typed with a dot', async () => {
    const wrapper = mountFilter(null);
    await wrapper.find('[data-testid="amount-from"] input').setValue('12.5');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[12.5, null]]);
  });

  it('keeps the other end', async () => {
    const wrapper = mountFilter([10, null]);
    await wrapper.find('[data-testid="amount-to"] input').setValue('50');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[10, 50]]);
  });

  it('emits null when both ends are cleared', async () => {
    const wrapper = mountFilter([10, null]);
    await wrapper.find('[data-testid="amount-from"] input').setValue('');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null]);
  });
});
