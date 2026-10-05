import type { ConfirmationOptions } from 'primevue/confirmationoptions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelPendingConfirm, useConfirmAction } from '../composables/useConfirmAction';

let lastOptions: ConfirmationOptions | null = null;
const closeMock = vi.fn();
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({
    require: (options: ConfirmationOptions) => (lastOptions = options),
    close: closeMock,
  }),
}));

describe('useConfirmAction', () => {
  afterEach(() => {
    cancelPendingConfirm();
    lastOptions = null;
    closeMock.mockClear();
  });

  it('resolves an earlier pending confirm with false when a new one opens', async () => {
    const first = useConfirmAction().confirmAction({ message: 'First?' });
    const firstOptions = lastOptions!;
    const second = useConfirmAction().confirmAction({ message: 'Second?' });
    await expect(first).resolves.toBe(false);
    // A late accept on the superseded dialog must not flip the result.
    firstOptions.accept!();
    lastOptions!.accept!();
    await expect(second).resolves.toBe(true);
  });

  it('cancelPendingConfirm resolves the pending confirm with false and closes the dialog', async () => {
    const result = useConfirmAction().confirmAction({ message: 'Delete?' });
    cancelPendingConfirm();
    await expect(result).resolves.toBe(false);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('cancelPendingConfirm does nothing when nothing is pending', () => {
    cancelPendingConfirm();
    expect(closeMock).not.toHaveBeenCalled();
  });

  it('supports a custom reject label', () => {
    void useConfirmAction().confirmAction({ message: 'Keep?', rejectLabel: 'Keep it' });
    expect(lastOptions).toMatchObject({ rejectProps: { label: 'Keep it' } });
  });

  it('focuses the reject button for dangerous actions only', () => {
    void useConfirmAction().confirmAction({ message: 'Delete?', danger: true });
    expect(lastOptions).toMatchObject({ defaultFocus: 'reject' });
    void useConfirmAction().confirmAction({ message: 'Proceed?' });
    expect(lastOptions!.defaultFocus).toBeUndefined();
  });

  it('resolves true when accepted', async () => {
    const result = useConfirmAction().confirmAction({ message: 'Delete?' });
    lastOptions!.accept!();
    lastOptions!.onHide!();
    await expect(result).resolves.toBe(true);
  });

  it('resolves false when rejected', async () => {
    const result = useConfirmAction().confirmAction({ message: 'Delete?' });
    lastOptions!.reject!();
    await expect(result).resolves.toBe(false);
  });

  it('resolves false when the dialog is closed without a choice', async () => {
    const result = useConfirmAction().confirmAction({ message: 'Delete?' });
    lastOptions!.onHide!();
    await expect(result).resolves.toBe(false);
  });

  it('passes message, header and labels', () => {
    void useConfirmAction().confirmAction({ message: 'Delete?' });
    expect(lastOptions).toMatchObject({
      message: 'Delete?',
      header: 'Please confirm',
      icon: 'pi pi-question-circle',
      rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      acceptProps: { label: 'OK' },
    });
  });

  it('styles dangerous actions', () => {
    void useConfirmAction().confirmAction({
      message: 'Cancel invoice?',
      header: 'Cancel invoice',
      acceptLabel: 'Cancel invoice',
      danger: true,
    });
    expect(lastOptions).toMatchObject({
      header: 'Cancel invoice',
      icon: 'pi pi-exclamation-triangle',
      acceptProps: { label: 'Cancel invoice', severity: 'danger' },
    });
  });
});
