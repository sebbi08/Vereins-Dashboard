import { flushPromises, mount } from '@vue/test-utils';
import ConfirmDialog from 'primevue/confirmdialog';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { useConfirmAction } from '../composables/useConfirmAction';
import { withPrimeVue } from './helpers/primeVue';

describe('confirmAction with the real ConfirmDialog', () => {
  it('resolves false when the dialog is dismissed with Escape', async () => {
    let result: Promise<boolean> | undefined;
    const Host = defineComponent({
      setup() {
        const { confirmAction } = useConfirmAction();
        return () =>
          h('div', [
            h('button', {
              'data-testid': 'ask',
              onClick: () => (result = confirmAction({ message: 'Sure?' })),
            }),
            h(ConfirmDialog),
          ]);
      },
    });
    const wrapper = mount(Host, {
      attachTo: document.body,
      global: withPrimeVue({ stubs: { transition: false } }),
    });

    await wrapper.find('[data-testid="ask"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Sure?');

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    await flushPromises();

    await expect(result).resolves.toBe(false);
    wrapper.unmount();
  });
});
