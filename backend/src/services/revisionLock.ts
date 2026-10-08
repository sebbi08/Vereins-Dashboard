export type LockResult<T> = { busy: true } | { busy: false; value: T };

/**
 * Allows one running action per revision, e.g. sending an invoice or regenerating a PDF. A double
 * click would otherwise run it twice; the second call gets `{ busy: true }` while the first runs.
 */
export function createRevisionLock() {
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
