import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorMessage, requestJson } from '../utils/requestJson';

function respond(status: number, json: () => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 400, status, json }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson', () => {
  it('returns the parsed body of a successful response', async () => {
    respond(201, () => Promise.resolve({ invoiceId: 3 }));
    expect(await requestJson('/api/invoice', { method: 'POST' })).toEqual({
      ok: true,
      status: 201,
      body: { invoiceId: 3 },
    });
  });

  it('reports an HTTP error with its JSON error message', async () => {
    respond(400, () => Promise.resolve({ error: 'Street is required' }));
    const res = await requestJson('/api/invoice');
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(errorMessage(res)).toBe('Street is required');
  });

  it('reports an HTTP error whose body is not JSON (e.g. a proxy error page)', async () => {
    respond(502, () => Promise.reject(new SyntaxError('Unexpected token <')));
    const res = await requestJson('/api/invoice');
    expect(res).toEqual({ ok: false, status: 502, body: {} });
    expect(errorMessage(res)).toBe('Server error (502)');
  });

  it('rejects only when the server could not be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(requestJson('/api/invoice')).rejects.toThrow('Failed to fetch');
  });

  it('gives up after the timeout', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestJson('/api/invoice', {}, 10)).rejects.toBeDefined();
  });
});
