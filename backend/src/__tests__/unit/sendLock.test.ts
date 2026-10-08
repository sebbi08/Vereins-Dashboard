import { describe, expect, it } from 'vitest';
import { createSendLock } from '../../services/sendLock';

describe('createSendLock', () => {
  it('refuses a second send for the same revision while the first is running', async () => {
    const lock = createSendLock();
    let finishFirst!: () => void;
    const first = lock(
      7,
      () => new Promise<string>((resolve) => (finishFirst = () => resolve('sent'))),
    );

    const second = await lock(7, async () => 'sent twice');

    expect(second).toEqual({ busy: true });
    finishFirst();
    expect(await first).toEqual({ busy: false, value: 'sent' });
  });

  it('lets different revisions send at the same time', async () => {
    const lock = createSendLock();
    const [a, b] = await Promise.all([lock(1, async () => 'a'), lock(2, async () => 'b')]);
    expect([a, b]).toEqual([
      { busy: false, value: 'a' },
      { busy: false, value: 'b' },
    ]);
  });

  it('releases the revision after a failed send', async () => {
    const lock = createSendLock();
    await expect(
      lock(7, async () => {
        throw new Error('smtp down');
      }),
    ).rejects.toThrow('smtp down');
    expect(await lock(7, async () => 'retry')).toEqual({ busy: false, value: 'retry' });
  });
});
