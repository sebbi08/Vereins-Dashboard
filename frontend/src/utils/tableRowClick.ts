/** Clicks on checkboxes, buttons, links, inputs and the selection cell belong to that control, not to the row. */
export function isControlClick(event: Event): boolean {
  const target = event.target as HTMLElement | null;
  return !!target?.closest('.p-checkbox, button, a, input, td[data-p-selection-column="true"]');
}
