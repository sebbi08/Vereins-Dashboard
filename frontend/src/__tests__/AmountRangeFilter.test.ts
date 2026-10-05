import { mount } from '@vue/test-utils';
import InputNumber from 'primevue/inputnumber';
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

  it('emits the range when one end changes', () => {
    const wrapper = mountFilter(null);
    wrapper.findAllComponents(InputNumber)[0].vm.$emit('update:modelValue', 10);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[10, null]]);
  });

  it('keeps the other end', () => {
    const wrapper = mountFilter([10, null]);
    wrapper.findAllComponents(InputNumber)[1].vm.$emit('update:modelValue', 50);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[10, 50]]);
  });

  it('emits null when both ends are cleared', () => {
    const wrapper = mountFilter([10, null]);
    wrapper.findAllComponents(InputNumber)[0].vm.$emit('update:modelValue', null);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null]);
  });
});
