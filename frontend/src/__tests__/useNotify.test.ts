import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNotify } from '../composables/useNotify';

const add = vi.fn();
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add }) }));

describe('useNotify', () => {
  afterEach(() => add.mockReset());

  it('shows success, info and error toasts', () => {
    const notify = useNotify();

    notify.success('Saved');
    notify.info('Heads up');
    notify.error('Failed');

    expect(add.mock.calls.map(([message]) => message)).toEqual([
      { severity: 'success', summary: 'Success', detail: 'Saved', life: 4000 },
      { severity: 'info', summary: 'Info', detail: 'Heads up', life: 4000 },
      { severity: 'error', summary: 'Error', detail: 'Failed', life: 6000 },
    ]);
  });
});
