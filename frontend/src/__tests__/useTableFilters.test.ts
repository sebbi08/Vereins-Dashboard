import { FilterMatchMode } from '@primevue/core/api';
import { describe, expect, it } from 'vitest';
import { useTableFilters } from '../composables/useTableFilters';
import { globalFilter } from '../utils/tableDefaults';

function defaults() {
  return {
    ...globalFilter(),
    name: { value: null, matchMode: FilterMatchMode.CONTAINS },
    status: { value: 'AKTIV', matchMode: FilterMatchMode.EQUALS },
  };
}

describe('useTableFilters', () => {
  it('starts with the defaults', () => {
    const { filters, globalSearch, statusFilter } = useTableFilters(defaults);
    expect(filters.value).toEqual(defaults());
    expect(globalSearch.value).toBe('');
    expect(statusFilter.value).toBe('AKTIV');
  });

  it('writes the global search with its match mode; empty text clears it', () => {
    const { filters, globalSearch } = useTableFilters(defaults);
    globalSearch.value = 'bach';
    expect(filters.value.global).toEqual({ value: 'bach', matchMode: FilterMatchMode.CONTAINS });
    expect(globalSearch.value).toBe('bach');
    globalSearch.value = '';
    expect(filters.value.global).toEqual({ value: null, matchMode: FilterMatchMode.CONTAINS });
  });

  it('writes the status filter; null shows all', () => {
    const { filters, statusFilter } = useTableFilters(defaults);
    statusFilter.value = null;
    expect(filters.value.status).toEqual({ value: null, matchMode: FilterMatchMode.EQUALS });
    statusFilter.value = 'STORNIERT';
    expect(statusFilter.value).toBe('STORNIERT');
  });

  it('replaces the filters object on every write', () => {
    const { filters, globalSearch } = useTableFilters(defaults);
    const before = filters.value;
    globalSearch.value = 'x';
    expect(filters.value).not.toBe(before);
    expect(filters.value.name).toEqual(before.name);
  });

  it('clears back to fresh defaults', () => {
    const { filters, globalSearch, statusFilter, clearFilters } = useTableFilters(defaults);
    globalSearch.value = 'x';
    statusFilter.value = null;
    clearFilters();
    expect(filters.value).toEqual(defaults());
  });

  it('reads null when there is no status filter', () => {
    const { statusFilter } = useTableFilters(() => ({ ...globalFilter() }));
    expect(statusFilter.value).toBeNull();
  });
});
