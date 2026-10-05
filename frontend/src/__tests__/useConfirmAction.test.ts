import type { ConfirmationOptions } from 'primevue/confirmationoptions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConfirmAction } from '../composables/useConfirmAction';

let lastOptions: ConfirmationOptions | null = null;
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({ require: (options: ConfirmationOptions) => (lastOptions = options) }),
}));

describe('useConfirmAction', () => {
  afterEach(() => {
    lastOptions = null;
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
