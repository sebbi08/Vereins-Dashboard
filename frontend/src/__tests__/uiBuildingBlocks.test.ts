import { FilterMatchMode } from '@primevue/core/api';
import { mount } from '@vue/test-utils';
import DataTable from 'primevue/datatable';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import FormSection from '../components/ui/FormSection.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { globalFilter, TABLE_DEFAULTS } from '../utils/tableDefaults';
import { withPrimeVue } from './helpers/primeVue';

describe('PageHeader', () => {
  it('renders title, subtitle and actions', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Invoices', subtitle: 'All invoices' },
      slots: { actions: '<button>New invoice</button>' },
      global: withPrimeVue(),
    });
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Invoices');
    expect(wrapper.text()).toContain('All invoices');
    expect(wrapper.find('button').text()).toBe('New invoice');
  });

  it('omits subtitle and actions when not given', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Invoices' }, global: withPrimeVue() });
    expect(wrapper.find('.page-header__subtitle').exists()).toBe(false);
    expect(wrapper.find('.page-header__actions').exists()).toBe(false);
  });
});

describe('FormSection', () => {
  it('renders a card with title and content', () => {
    const wrapper = mount(FormSection, {
      props: { title: 'Recipient' },
      slots: { default: '<input data-testid="inner" />' },
      global: withPrimeVue(),
    });
    expect(wrapper.text()).toContain('Recipient');
    expect(wrapper.find('[data-testid="inner"]').exists()).toBe(true);
  });
});

describe('tableDefaults', () => {
  it('provides paginated, sortable defaults with a filter row', () => {
    expect(TABLE_DEFAULTS).toEqual({
      paginator: true,
      rows: 25,
      rowsPerPageOptions: [10, 25, 50, 100],
      removableSort: true,
      filterDisplay: 'row',
    });
  });

  it('builds the global filter entry', () => {
    expect(globalFilter()).toEqual({
      global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    });
    expect(globalFilter('Anna').global.value).toBe('Anna');
    expect(globalFilter('Anna').global.matchMode).toBe(FilterMatchMode.CONTAINS);
  });

  it('binds to a DataTable (typechecked by vue-tsc)', () => {
    const Host = defineComponent({
      render: () =>
        h(DataTable, {
          ...TABLE_DEFAULTS,
          value: [{ name: 'Anna' }],
          globalFilterFields: ['name'],
          filters: globalFilter('Anna'),
        }),
    });
    const wrapper = mount(Host, { global: withPrimeVue() });
    expect(wrapper.find('.p-datatable').exists()).toBe(true);
  });
});
