import { useConfirm } from 'primevue/useconfirm';

export interface ConfirmActionOptions {
  message: string;
  header?: string;
  acceptLabel?: string;
  danger?: boolean;
}

/** Promise-based confirm dialog; a drop-in replacement for window.confirm. */
export function useConfirmAction() {
  const confirm = useConfirm();

  function confirmAction(options: ConfirmActionOptions): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      confirm.require({
        message: options.message,
        header: options.header ?? 'Please confirm',
        icon: options.danger ? 'pi pi-exclamation-triangle' : 'pi pi-question-circle',
        rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
        acceptProps: {
          label: options.acceptLabel ?? 'OK',
          ...(options.danger && { severity: 'danger' }),
        },
        accept: () => settle(true),
        reject: () => settle(false),
        onHide: () => settle(false),
      });
    });
  }

  return { confirmAction };
}
