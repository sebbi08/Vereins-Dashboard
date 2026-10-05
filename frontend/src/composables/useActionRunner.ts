import { ref } from 'vue';
import { useNotify } from './useNotify';

export type ErrorBody = Record<string, string>;
export type ActionResult = { ok: boolean; body: Record<string, unknown> };

/** Runs one request per action key with a busy flag; failures become error toasts. */
export function useActionRunner() {
  const notify = useNotify();
  const busy = ref<Record<string, boolean>>({});

  /** Resolves with whether the request succeeded and the parsed response body. */
  async function runWithBody(
    key: string,
    request: () => Promise<Response>,
    errorText: (body: ErrorBody) => string,
  ): Promise<ActionResult> {
    busy.value = { ...busy.value, [key]: true };
    try {
      const res = await request();
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        notify.error(errorText(body as ErrorBody));
        return { ok: false, body };
      }
      return { ok: true, body };
    } catch {
      notify.error('Network error');
      return { ok: false, body: {} };
    } finally {
      busy.value = { ...busy.value, [key]: false };
    }
  }

  /** Resolves with whether the request succeeded. */
  async function run(
    key: string,
    request: () => Promise<Response>,
    errorText: (body: ErrorBody) => string,
  ): Promise<boolean> {
    return (await runWithBody(key, request, errorText)).ok;
  }

  return { busy, run, runWithBody };
}
