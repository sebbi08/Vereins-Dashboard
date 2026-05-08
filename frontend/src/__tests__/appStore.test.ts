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
    expect(store.quittungsVorlageVorhanden).toBeNull();
  });

  it('sets quittungsVorlageVorhanden to true when a QUITTUNG vorlage exists', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce([{ typ: 'QUITTUNG', id: 1 }]),
    } as unknown as Response);

    const store = useAppStore();
    await store.pruefeVorlagen();

    expect(store.quittungsVorlageVorhanden).toBe(true);
  });

  it('sets quittungsVorlageVorhanden to false when no QUITTUNG vorlage exists', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce([{ typ: 'ANSCHREIBEN', id: 1 }]),
    } as unknown as Response);

    const store = useAppStore();
    await store.pruefeVorlagen();

    expect(store.quittungsVorlageVorhanden).toBe(false);
  });

  it('sets quittungsVorlageVorhanden to false when fetch returns a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
    } as unknown as Response);

    const store = useAppStore();
    await store.pruefeVorlagen();

    expect(store.quittungsVorlageVorhanden).toBe(false);
  });

  it('sets quittungsVorlageVorhanden to false when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    const store = useAppStore();
    await store.pruefeVorlagen();

    expect(store.quittungsVorlageVorhanden).toBe(false);
  });

  it('sets quittungsVorlageVorhanden to false when vorlagen list is empty', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce([]),
    } as unknown as Response);

    const store = useAppStore();
    await store.pruefeVorlagen();

    expect(store.quittungsVorlageVorhanden).toBe(false);
  });
});
