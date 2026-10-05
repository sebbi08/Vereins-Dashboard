import { useToast } from 'primevue/usetoast';

/** Toast notifications; replaces inline success/error banners and alert(). */
export function useNotify() {
  const toast = useToast();
  return {
    success: (detail: string) =>
      toast.add({ severity: 'success', summary: 'Success', detail, life: 4000 }),
    info: (detail: string) => toast.add({ severity: 'info', summary: 'Info', detail, life: 4000 }),
    error: (detail: string) =>
      toast.add({ severity: 'error', summary: 'Error', detail, life: 6000 }),
  };
}
