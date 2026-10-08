export type LockResult<T> = { busy: true } | { busy: false; value: T };

/**
 * Allows one running send per revision. A double click on "Send" would otherwise mail the
 * invoice twice; the second request gets `{ busy: true }` while the first is still running.
 */
export function createSendLock() {
  const running = new Set<number>();
  return async function withLock<T>(id: number, send: () => Promise<T>): Promise<LockResult<T>> {
    if (running.has(id)) return { busy: true };
    running.add(id);
    try {
      return { busy: false, value: await send() };
    } finally {
      running.delete(id);
    }
  };
}
