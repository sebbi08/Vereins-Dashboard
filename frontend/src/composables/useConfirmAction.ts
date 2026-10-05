import { useConfirm } from 'primevue/useconfirm';

export interface ConfirmActionOptions {
  message: string;
  header?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  danger?: boolean;
}

// Only one ConfirmDialog is ever open, so one pending confirm is tracked app-wide.
let pendingSettle: ((value: boolean) => void) | null = null;
let pendingClose: (() => void) | null = null;

/**
 * Resolve a pending confirm with false and close the dialog. Used on navigation so a dialog
 * left open can never run the previous page's action.
 */
export function cancelPendingConfirm(): void {
  const settle = pendingSettle;
  const close = pendingClose;
  settle?.(false);
  if (settle) close?.();
}

/** Promise-based confirm dialog; a drop-in replacement for window.confirm. */
export function useConfirmAction() {
  const confirm = useConfirm();

  function confirmAction(options: ConfirmActionOptions): Promise<boolean> {
    // A new confirm replaces the open one; the superseded caller gets "no".
    pendingSettle?.(false);

    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        if (pendingSettle === settle) {
          pendingSettle = null;
          pendingClose = null;
        }
        resolve(value);
      };
      pendingSettle = settle;
      pendingClose = () => confirm.close();

      confirm.require({
        message: options.message,
        header: options.header ?? 'Please confirm',
        icon: options.danger ? 'pi pi-exclamation-triangle' : 'pi pi-question-circle',
        rejectProps: {
          label: options.rejectLabel ?? 'Cancel',
          severity: 'secondary',
          outlined: true,
        },
        acceptProps: {
          label: options.acceptLabel ?? 'OK',
          ...(options.danger && { severity: 'danger' }),
        },
        ...(options.danger && { defaultFocus: 'reject' as const }),
        accept: () => settle(true),
        reject: () => settle(false),
        onHide: () => settle(false),
      });
    });
  }

  return { confirmAction };
}
