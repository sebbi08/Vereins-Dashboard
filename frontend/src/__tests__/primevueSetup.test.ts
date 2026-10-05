import { mount } from '@vue/test-utils';
import Button from 'primevue/button';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { DE_DATE_LOCALE, primeVueOptions } from '../primevue';
import { withPrimeVue } from './helpers/primeVue';

describe('primeVueOptions', () => {
  it('uses the Aura preset with the app-dark selector', () => {
    const options = primeVueOptions();
    expect(options.theme.options.darkModeSelector).toBe('.app-dark');
    expect(options.theme.preset).toBeTruthy();
  });

  it('passes a license key only when one is given', () => {
    expect(primeVueOptions().license).toBeUndefined();
    expect(primeVueOptions('').license).toBeUndefined();
    expect(primeVueOptions('KEY-123').license).toBe('KEY-123');
  });

  it('formats dates German-style with Monday first', () => {
    expect(DE_DATE_LOCALE.dateFormat).toBe('dd.mm.yy');
    expect(DE_DATE_LOCALE.firstDayOfWeek).toBe(1);
    expect(DE_DATE_LOCALE.dayNamesMin).toEqual(['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']);
    expect(DE_DATE_LOCALE.monthNames[2]).toBe('März');
    expect(primeVueOptions().locale).toMatchObject(DE_DATE_LOCALE);
  });
});

describe('withPrimeVue', () => {
  it('mounts PrimeVue components', () => {
    const Host = defineComponent({ render: () => h(Button, { label: 'Speichern' }) });
    const wrapper = mount(Host, { global: withPrimeVue() });
    expect(wrapper.find('button').text()).toContain('Speichern');
  });

  it('keeps plugins passed by the caller', () => {
    let installed = false;
    const plugin = { install: () => (installed = true) };
    mount(defineComponent({ render: () => h('div') }), {
      global: withPrimeVue({ plugins: [plugin] }),
    });
    expect(installed).toBe(true);
  });

  it('provides matchMedia in jsdom', () => {
    expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(false);
  });
});
