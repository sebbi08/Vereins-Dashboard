import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';

describe('security headers', () => {
  it('does not advertise the server framework', async () => {
    const res = await supertest(createApp()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('forbids embedding the app in other sites (clickjacking)', async () => {
    const res = await supertest(createApp()).get('/api/health');
    expect(res.headers['content-security-policy']).toBe("frame-ancestors 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('stops browsers from guessing content types', async () => {
    const res = await supertest(createApp()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
