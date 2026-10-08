import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import PdfFailureNotice from '../components/PdfFailureNotice.vue';
import { isMonotonicNowInstalled, resetWallClock, stepWallClock } from './helpers/monotonicNow';
import { withPrimeVue } from './helpers/primeVue';

// WSL2 (and VMs in general) step the wall clock backwards during time sync. Vue ignores an
// event whose timestamp predates its listener's attach time, and Vue Test Utils stamps triggered
// events with Date.now() + 1 — so a backward step between mount and trigger silently swallowed
// clicks and made random tests fail. The test setup installs a Date.now that never goes back.
describe('clock steps during a test', () => {
  afterEach(() => {
    resetWallClock();
  });

  it('runs the suite with a monotonic Date.now', () => {
    expect(isMonotonicNowInstalled()).toBe(true);
  });

  it('never lets Date.now return a smaller value than before', () => {
    const before = Date.now();
    stepWallClock(-5000);
    expect(Date.now()).toBeGreaterThanOrEqual(before);
  });

  it('still delivers a click after the wall clock stepped back 1.2 s', async () => {
    const wrapper = mount(PdfFailureNotice, {
      props: { error: 'x', techError: 'trace' },
      global: withPrimeVue(),
    });
    stepWallClock(-1200);

    await wrapper.find('[data-testid="toggle-tech-error"]').trigger('click');

    expect(wrapper.find('pre').exists()).toBe(true);
  });
});
