import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBatchDownload } from '../composables/useBatchDownload';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

const options = {
  url: '/api/invoice/download-batch',
  fallbackFileName: 'rechnungen.zip',
  singular: 'invoice',
  plural: 'invoices',
};

function okResponse(disposition?: string): Response {
  return {
    ok: true,
    blob: () => Promise.resolve(new Blob(['zip'])),
    headers: new Headers(disposition ? { 'Content-Disposition': disposition } : {}),
  } as unknown as Response;
}

function errorResponse(body: unknown): Response {
  return { ok: false, json: () => Promise.resolve(body) } as unknown as Response;
}

let savedNames: string[];

beforeEach(() => {
  savedNames = [];
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    savedNames.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useBatchDownload', () => {
  it('does nothing without ids', async () => {
    const result = await useBatchDownload(options).download([]);
    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts the ids and saves the zip under the server file name', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse('attachment; filename="invoices-2026.zip"'));

    const result = await useBatchDownload(options).download([1, 2]);

    expect(fetch).toHaveBeenCalledWith('/api/invoice/download-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [1, 2] }),
    });
    expect(savedNames).toEqual(['invoices-2026.zip']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:zip');
    expect(result).toEqual([]);
  });

  it('falls back to the default file name', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse());
    await useBatchDownload(options).download([1]);
    expect(savedNames).toEqual(['rechnungen.zip']);
  });

  it('returns rejected ids and explains them (plural)', async () => {
    vi.mocked(fetch).mockResolvedValue(errorResponse({ error: 'PDF_NOT_READY', ids: [2, 3] }));

    const result = await useBatchDownload(options).download([1, 2, 3]);

    expect(result).toEqual([2, 3]);
    expect(notify.error).toHaveBeenCalledWith(
      '2 invoices cannot be downloaded: PDF not ready. They have been deselected.',
    );
    expect(savedNames).toEqual([]);
  });

  it.each([
    ['CANCELLED', 'cancelled'],
    ['NOT_FOUND', 'not found'],
    ['SOMETHING', 'invalid'],
  ])('explains %s for a single invoice', async (code, reason) => {
    vi.mocked(fetch).mockResolvedValue(errorResponse({ error: code, ids: [4] }));

    await useBatchDownload(options).download([4]);

    expect(notify.error).toHaveBeenCalledWith(
      `1 invoice cannot be downloaded: ${reason}. It has been deselected.`,
    );
  });

  it('reports other failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(errorResponse({ error: 'Boom' }));
    expect(await useBatchDownload(options).download([1])).toEqual([]);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    expect(await useBatchDownload(options).download([1])).toEqual([]);
    expect(notify.error).toHaveBeenCalledTimes(2);
    expect(notify.error).toHaveBeenLastCalledWith('Download failed. Please try again.');
  });

  it('flags the running download', async () => {
    let resolve: (value: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValue(new Promise((r) => (resolve = r)));
    const batch = useBatchDownload(options);

    const pending = batch.download([1]);
    expect(batch.downloading.value).toBe(true);
    resolve(okResponse());
    await pending;
    expect(batch.downloading.value).toBe(false);
  });
});
