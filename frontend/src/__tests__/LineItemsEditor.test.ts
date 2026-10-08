import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { InvoiceLineItem } from 'shared';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import LineItemsEditor from '../components/LineItemsEditor.vue';
import { withPrimeVue } from './helpers/primeVue';

function mountEditor(modelValue: InvoiceLineItem[], error?: string) {
  return mount(LineItemsEditor, {
    props: { modelValue, error },
    attachTo: document.body,
    global: withPrimeVue(),
  });
}

function lastItems(wrapper: VueWrapper): InvoiceLineItem[] {
  const events = wrapper.emitted('update:modelValue') as InvoiceLineItem[][][];
  return events[events.length - 1][0];
}

const two: InvoiceLineItem[] = [
  { text: 'Miete', priceInCents: 1000 },
  { text: 'Strom', priceInCents: 250 },
];

describe('LineItemsEditor', () => {
  it('shows every line item in a labelled group', () => {
    const wrapper = mountEditor(two);
    expect(wrapper.findAll('[data-testid="line-item-text"]')).toHaveLength(2);
    const group = wrapper.find('[role="group"]');
    const labelId = group.attributes('aria-labelledby');
    expect(wrapper.find(`#${labelId}`).text()).toBe('Line Items');
  });

  it('emits a new list when a text changes, without changing the given one', async () => {
    const items = structuredClone(two);
    const wrapper = mountEditor(items);

    await wrapper.findAll('[data-testid="line-item-text"]')[1].setValue('Wasser');

    expect(lastItems(wrapper)).toEqual([two[0], { text: 'Wasser', priceInCents: 250 }]);
    expect(items).toEqual(two);
  });

  it('adds an empty line item and removes one', async () => {
    const wrapper = mountEditor(two);

    await wrapper.find('[data-testid="add-line-item"]').trigger('click');
    expect(lastItems(wrapper)).toEqual([...two, { text: '', priceInCents: 0 }]);

    await wrapper.setProps({ modelValue: two });
    await wrapper.find('[aria-label="Remove line item 1"]').trigger('click');
    expect(lastItems(wrapper)).toEqual([two[1]]);
  });

  it('offers no remove button for the last remaining line item', () => {
    const wrapper = mountEditor([two[0]]);
    expect(wrapper.find('[aria-label="Remove line item 1"]').exists()).toBe(false);
  });

  it('reports an unreadable price and clears it when that line item is removed', async () => {
    const wrapper = mountEditor(two);
    const price = wrapper.findAll('[data-testid="line-item-price"] input')[1];

    await price.setValue('abc');
    await flushPromises();
    expect(wrapper.emitted('update:invalid')?.at(-1)).toEqual([true]);

    await wrapper.find('[aria-label="Remove line item 2"]').trigger('click');
    await wrapper.setProps({ modelValue: lastItems(wrapper) });
    await flushPromises();
    expect(wrapper.emitted('update:invalid')?.at(-1)).toEqual([false]);
  });

  it('shows the error it is given', () => {
    const wrapper = mountEditor(two, 'All line items need text');
    expect(wrapper.find('[data-testid="error-line-items"]').text()).toBe(
      'All line items need text',
    );
  });

  it('keeps the inputs while a parent stores the edits in a reactive ref', async () => {
    // A parent's ref hands the emitted list back as a proxy; that must not count as a new list
    const Parent = defineComponent({
      setup() {
        const items = ref<InvoiceLineItem[]>(structuredClone(two));
        const invalid = ref(false);
        return () =>
          h('div', [
            h(LineItemsEditor, {
              modelValue: items.value,
              'onUpdate:modelValue': (next: InvoiceLineItem[]) => (items.value = next),
              'onUpdate:invalid': (next: boolean) => (invalid.value = next),
            }),
            h('output', { 'data-testid': 'invalid' }, String(invalid.value)),
          ]);
      },
    });
    const wrapper = mount(Parent, { attachTo: document.body, global: withPrimeVue() });
    const firstText = wrapper.find('[data-testid="line-item-text"]').element;

    // Typed like a user: the price field has focus, so the field keeps showing the text
    const price = wrapper.findAll('[data-testid="line-item-price"] input')[1];
    await price.trigger('focus');
    await price.setValue('abc');
    await wrapper.find('[data-testid="line-item-text"]').setValue('Miete März');
    await flushPromises();

    expect(wrapper.find('[data-testid="line-item-text"]').element).toBe(firstText);
    expect(wrapper.find('[data-testid="invalid"]').text()).toBe('true');
  });
});
