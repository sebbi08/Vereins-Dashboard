import { ref } from 'vue';
import { useNotify } from './useNotify';

export type ErrorBody = Record<string, string>;

/** Runs one request per action key with a busy flag; failures become error toasts. */
export function useActionRunner() {
  const notify = useNotify();
  const busy = ref<Record<string, boolean>>({});

  /** Resolves with whether the request succeeded. */
  async function run(
    key: string,
    request: () => Promise<Response>,
    errorText: (body: ErrorBody) => string,
  ): Promise<boolean> {
    busy.value = { ...busy.value, [key]: true };
    try {
      const res = await request();
      const body = (await res.json().catch(() => ({}))) as ErrorBody;
      if (!res.ok) {
        notify.error(errorText(body));
        return false;
      }
      return true;
    } catch {
      notify.error('Network error');
      return false;
    } finally {
      busy.value = { ...busy.value, [key]: false };
    }
  }

  return { busy, run };
}
