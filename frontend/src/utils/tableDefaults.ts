import { FilterMatchMode } from '@primevue/core/api';
import type { DataTableProps } from 'primevue/datatable';

/** Shared DataTable settings; spread with v-bind="TABLE_DEFAULTS". */
export const TABLE_DEFAULTS = {
  paginator: true,
  rows: 25,
  rowsPerPageOptions: [10, 25, 50, 100],
  removableSort: true,
  filterDisplay: 'row',
} satisfies Partial<DataTableProps>;

/**
 * Filter model for the toolbar search box; bind as `:filters="filters"` on a DataTable and
 * set `filters.global.value` from the input. Matches case-insensitively on "contains".
 */
export function globalFilter(value?: string) {
  return { global: { value: value ?? null, matchMode: FilterMatchMode.CONTAINS } };
}
