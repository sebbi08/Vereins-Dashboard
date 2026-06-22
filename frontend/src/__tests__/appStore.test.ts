import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../stores/app';

describe('useAppStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('has correct initial state', () => {
    const store = useAppStore();
    expect(store.appName).toBe('MV Dashboard');
    expect(store.receiptTemplateAvailable).toBeNull();
  });

  it('sets receiptTemplateAvailable to true when a QUITTUNG template exists', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce([{ type: 'QUITTUNG', id: 1 }]),
    } as unknown as Response);

    const store = useAppStore();
    await store.checkTemplates();

    expect(store.receiptTemplateAvailable).toBe(true);
  });

  it('sets receiptTemplateAvailable to false when no QUITTUNG template exists', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce([{ type: 'ANSCHREIBEN', id: 1 }]),
    } as unknown as Response);

    const store = useAppStore();
    await store.checkTemplates();

    expect(store.receiptTemplateAvailable).toBe(false);
  });

  it('sets receiptTemplateAvailable to false when fetch returns a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
    } as unknown as Response);

    const store = useAppStore();
    await store.checkTemplates();

    expect(store.receiptTemplateAvailable).toBe(false);
  });

  it('sets receiptTemplateAvailable to false when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    const store = useAppStore();
    await store.checkTemplates();

    expect(store.receiptTemplateAvailable).toBe(false);
  });

  it('sets receiptTemplateAvailable to false when vorlagen list is empty', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce([]),
    } as unknown as Response);

    const store = useAppStore();
    await store.checkTemplates();

    expect(store.receiptTemplateAvailable).toBe(false);
  });
});
