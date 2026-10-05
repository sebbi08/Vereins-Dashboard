import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PdfFailureNotice from '../components/PdfFailureNotice.vue';
import { withPrimeVue } from './helpers/primeVue';

function mountNotice(error: string | null, techError: string | null) {
  return mount(PdfFailureNotice, { props: { error, techError }, global: withPrimeVue() });
}

describe('PdfFailureNotice', () => {
  it('shows the error', () => {
    expect(mountNotice('Template broken', null).text()).toContain('Template broken');
  });

  it('falls back to a generic message', () => {
    expect(mountNotice(null, null).text()).toContain(
      'PDF could not be generated. Please try again.',
    );
  });

  it('has no details toggle without technical details', () => {
    const wrapper = mountNotice('x', null);
    expect(wrapper.find('[data-testid="toggle-tech-error"]').exists()).toBe(false);
  });

  it('toggles the technical details', async () => {
    const wrapper = mountNotice('x', 'stack trace');
    const toggle = wrapper.find('[data-testid="toggle-tech-error"]');
    expect(toggle.text()).toBe('Show Details');
    expect(wrapper.find('pre').exists()).toBe(false);

    await toggle.trigger('click');
    expect(wrapper.find('pre').text()).toBe('stack trace');
    expect(toggle.text()).toBe('Hide Details');

    await toggle.trigger('click');
    expect(wrapper.find('pre').exists()).toBe(false);
  });
});
