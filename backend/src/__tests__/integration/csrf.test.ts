import supertest from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { useCleanDatabase } from './helpers';

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await initializeApp();
  request = supertest(createApp());
});

useCleanDatabase();

function saveTreasurer(headers: Record<string, string>) {
  return request.put('/api/settings').set(headers).send({ treasurer: 'Changed' });
}

async function treasurer(): Promise<string | undefined> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'treasurer' } });
  return row?.value;
}

describe('cross-site request protection', () => {
  it.each([
    ['a cross-site browser request', { 'Sec-Fetch-Site': 'cross-site' }],
    ['a same-site (other subdomain) browser request', { 'Sec-Fetch-Site': 'same-site' }],
    [
      'a request from a foreign origin without fetch metadata',
      { Origin: 'https://evil.example', Host: 'verein.example' },
    ],
  ])('rejects %s that changes data', async (_label, headers) => {
    const res = await saveTreasurer(headers);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Cross-site request blocked' });
    expect(await treasurer()).not.toBe('Changed');
  });

  it.each([
    ['a same-origin browser request', { 'Sec-Fetch-Site': 'same-origin' }],
    ['a request typed into the address bar', { 'Sec-Fetch-Site': 'none' }],
    [
      'a matching origin without fetch metadata',
      { Origin: 'https://verein.example', Host: 'verein.example' },
    ],
    [
      'a matching origin behind a proxy that rewrites the host',
      {
        Origin: 'https://verein.example',
        Host: 'backend:3000',
        'X-Forwarded-Host': 'verein.example',
      },
    ],
    ['a non-browser client without an origin', {}],
  ])('allows %s', async (_label, headers) => {
    const res = await saveTreasurer(headers);

    expect(res.status).toBe(200);
    expect(await treasurer()).toBe('Changed');
  });

  it('lets cross-site reads through', async () => {
    const res = await request.get('/api/settings').set('Sec-Fetch-Site', 'cross-site');
    expect(res.status).toBe(200);
  });
});
