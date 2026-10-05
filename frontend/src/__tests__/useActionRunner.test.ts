import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useActionRunner } from '../composables/useActionRunner';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

function response(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: () => (body instanceof Error ? Promise.reject(body) : Promise.resolve(body)),
  } as unknown as Response;
}

beforeEach(() => {
  Object.values(notify).forEach((fn) => fn.mockReset());
});

describe('useActionRunner', () => {
  it('resolves true on success and flags the action while it runs', async () => {
    const { busy, run } = useActionRunner();
    let resolve: (value: Response) => void = () => {};
    const pending = run(
      'save',
      () => new Promise((r) => (resolve = r)),
      () => 'unused',
    );

    expect(busy.value.save).toBe(true);
    resolve(response(true, {}));
    expect(await pending).toBe(true);
    expect(busy.value.save).toBe(false);
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('toasts the error text built from the response body', async () => {
    const { run } = useActionRunner();
    const ok = await run(
      'cancel',
      () => Promise.resolve(response(false, { error: 'Already cancelled' })),
      (body) => body.error || 'Error cancelling',
    );
    expect(ok).toBe(false);
    expect(notify.error).toHaveBeenCalledWith('Already cancelled');
  });

  it('uses an empty body when the error response is not JSON', async () => {
    const { run } = useActionRunner();
    await run(
      'cancel',
      () => Promise.resolve(response(false, new Error('not json'))),
      (body) => body.error || 'Error cancelling',
    );
    expect(notify.error).toHaveBeenCalledWith('Error cancelling');
  });

  it('reports network errors and clears the busy flag', async () => {
    const { busy, run } = useActionRunner();
    const ok = await run(
      'retry',
      () => Promise.reject(new Error('offline')),
      () => 'unused',
    );
    expect(ok).toBe(false);
    expect(notify.error).toHaveBeenCalledWith('Network error');
    expect(busy.value.retry).toBe(false);
  });
});
