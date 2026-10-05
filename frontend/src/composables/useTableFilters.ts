import { FilterMatchMode } from '@primevue/core/api';
import type { DataTableFilterMeta, DataTableFilterMetaData } from 'primevue/datatable';
import { computed, ref } from 'vue';

/**
 * DataTable filter state with a global search and a toolbar `status` filter. Every write
 * replaces the filters object so DataTable re-filters; `clearFilters` restores the defaults.
 */
export function useTableFilters(defaults: () => DataTableFilterMeta) {
  const filters = ref<DataTableFilterMeta>(defaults());

  function valueOf(field: string): unknown {
    return (filters.value[field] as DataTableFilterMetaData | undefined)?.value ?? null;
  }

  function setValue(field: string, value: unknown) {
    const current = filters.value[field] as DataTableFilterMetaData | undefined;
    filters.value = {
      ...filters.value,
      [field]: { matchMode: FilterMatchMode.EQUALS, ...current, value },
    };
  }

  const globalSearch = computed<string>({
    get: () => (valueOf('global') as string | null) ?? '',
    set: (value) => setValue('global', value || null),
  });

  const statusFilter = computed<string | null>({
    get: () => valueOf('status') as string | null,
    set: (value) => setValue('status', value),
  });

  function clearFilters() {
    filters.value = defaults();
  }

  return { filters, globalSearch, statusFilter, clearFilters };
}
