import supertest from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { initializeApp } from '../../init';
import { useCleanDatabase } from './helpers';

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await initializeApp();
  request = supertest(createApp());
});

useCleanDatabase();

describe('Email Settings API', () => {
  it('GET /api/email-settings returns empty object by default (no email settings seeded)', async () => {
    const res = await request.get('/api/email-settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('PUT /api/email-settings saves and GET returns saved settings', async () => {
    // Save settings
    const putRes = await request
      .put('/api/email-settings')
      .send({ smtpHost: 'smtp.test.com', smtpPort: '587', emailSubject: 'Test {number}' });
    expect(putRes.status).toBe(200);
    expect(putRes.body.message).toBe('Email settings saved');

    // Read back
    const getRes = await request.get('/api/email-settings');
    expect(getRes.status).toBe(200);
    expect(getRes.body.smtpHost).toBe('smtp.test.com');
    expect(getRes.body.emailSubject).toBe('Test {number}');
  });

  it('POST /api/email-settings/test fails without valid SMTP config', async () => {
    const res = await request.post('/api/email-settings/test');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('POST /api/invoice/revision/:id/send-email returns error without SMTP config', async () => {
    const res = await request.post('/api/invoice/revision/9999/send-email');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('POST /api/invoice/revision/:id/send-test-email returns error without SMTP config', async () => {
    const res = await request.post('/api/invoice/revision/9999/send-test-email');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
