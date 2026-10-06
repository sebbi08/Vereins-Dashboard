import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DecimalInput from '../components/ui/DecimalInput.vue';
import { withPrimeVue } from './helpers/primeVue';

function mountInput(props: Record<string, unknown> = {}) {
  return mount(DecimalInput, {
    props: { modelValue: null, inputId: 'amount', ...props },
    global: withPrimeVue(),
  });
}

function input(wrapper: VueWrapper) {
  return wrapper.find('input#amount');
}

function lastEmitted(wrapper: VueWrapper): unknown {
  const events = wrapper.emitted('update:modelValue') as unknown[][];
  return events[events.length - 1][0];
}

describe('DecimalInput', () => {
  it('shows the value in German format and an empty field for null', () => {
    expect(
      (input(mountInput({ modelValue: 1250.5, minFractionDigits: 2 })).element as HTMLInputElement)
        .value,
    ).toBe('1.250,50');
    expect((input(mountInput()).element as HTMLInputElement).value).toBe('');
  });

  it('marks the input for decimal keyboards and passes the aria-label', () => {
    const field = input(mountInput({ ariaLabel: 'Price' }));
    expect(field.attributes('inputmode')).toBe('decimal');
    expect(field.attributes('aria-label')).toBe('Price');
  });

  it.each([
    ['12,50', 12.5],
    ['12.50', 12.5],
    ['1.250,00', 1250],
    ['1250', 1250],
    ['', null],
  ])('emits %j as %j on every keystroke', async (text, value) => {
    const wrapper = mountInput();
    await input(wrapper).setValue(text);
    expect(lastEmitted(wrapper)).toBe(value);
    expect(wrapper.find('[data-testid="decimal-format-error"]').exists()).toBe(false);
  });

  it.each(['abc', '12,505'])('emits null and explains the format for %j', async (text) => {
    const wrapper = mountInput();
    await input(wrapper).setValue(text);
    expect(lastEmitted(wrapper)).toBeNull();
    expect(wrapper.find('[data-testid="decimal-format-error"]').text()).toBe(
      'Enter a number like 12,50',
    );
  });

  it('rejects decimals for whole numbers', async () => {
    const wrapper = mountInput({ maxFractionDigits: 0 });
    await input(wrapper).setValue('1,5');
    expect(lastEmitted(wrapper)).toBeNull();
    expect(wrapper.find('[data-testid="decimal-format-error"]').text()).toBe(
      'Enter a number like 6',
    );
  });

  it('keeps the typed text while focused even when the model changes', async () => {
    const wrapper = mountInput();
    await input(wrapper).trigger('focus');
    await input(wrapper).setValue('0,');
    await wrapper.setProps({ modelValue: null });
    expect((input(wrapper).element as HTMLInputElement).value).toBe('0,');
  });

  it('follows model changes while not focused', async () => {
    const wrapper = mountInput({ minFractionDigits: 2 });
    await wrapper.setProps({ modelValue: 12 });
    expect((input(wrapper).element as HTMLInputElement).value).toBe('12,00');
    await wrapper.setProps({ modelValue: null });
    expect((input(wrapper).element as HTMLInputElement).value).toBe('');
  });

  it('normalizes valid text on blur', async () => {
    const wrapper = mountInput({ minFractionDigits: 2 });
    await input(wrapper).trigger('focus');
    await input(wrapper).setValue('1250.5');
    await wrapper.setProps({ modelValue: 1250.5 });
    await input(wrapper).trigger('blur');
    expect((input(wrapper).element as HTMLInputElement).value).toBe('1.250,50');
  });

  it('keeps invalid text and the hint on blur', async () => {
    const wrapper = mountInput();
    await input(wrapper).trigger('focus');
    await input(wrapper).setValue('abc');
    await input(wrapper).trigger('blur');
    expect((input(wrapper).element as HTMLInputElement).value).toBe('abc');
    expect(wrapper.find('[data-testid="decimal-format-error"]').exists()).toBe(true);
  });

  it('shows the suffix addon', () => {
    const wrapper = mountInput({ suffix: '€' });
    expect(wrapper.find('.p-inputgroupaddon').text()).toBe('€');
  });

  it('puts data-testid on the wrapper', () => {
    const wrapper = mount(DecimalInput, {
      props: { modelValue: null, inputId: 'x' },
      attrs: { 'data-testid': 'price' },
      global: withPrimeVue(),
    });
    expect(wrapper.attributes('data-testid')).toBe('price');
  });
});
