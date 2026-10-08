import { describe, expect, it } from 'vitest';
import router from '../router';

describe('router', () => {
  it('shows the not-found page for an unknown address', () => {
    const resolved = router.resolve('/no/such/page');
    expect(resolved.name).toBe('not-found');
  });

  it('still resolves the known pages', () => {
    expect(router.resolve('/invoice/new').name).not.toBe('not-found');
    expect(router.resolve('/settings').name).not.toBe('not-found');
  });
});
