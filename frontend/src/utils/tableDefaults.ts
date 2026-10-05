import { FilterMatchMode } from '@primevue/core/api';

/** Shared DataTable settings; spread with v-bind="TABLE_DEFAULTS". */
export const TABLE_DEFAULTS = {
  paginator: true,
  rows: 25,
  rowsPerPageOptions: [10, 25, 50, 100],
  removableSort: true,
  filterDisplay: 'row',
} as const;

export function globalFilter(value?: string) {
  return { global: { value: value ?? null, matchMode: FilterMatchMode.CONTAINS } };
}
