import supertest from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// LibreOffice is not part of these tests: the route is checked against a stand-in generator
const { previewMock } = vi.hoisted(() => ({ previewMock: vi.fn() }));
vi.mock('../../services/invoicePreview', () => ({ generateInvoicePreview: previewMock }));

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

const PDF = Buffer.from('%PDF-1.7 preview');

/** Collects a binary response body (supertest buffers only text by default). */
function binary(res: supertest.Response, callback: (err: Error | null, body: Buffer) => void) {
  const stream = res as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
}

const inputs = {
  salutation: 'Frau',
  name: 'Anna Alt',
  street: 'Hauptstr. 1',
  city: '12345 Berlin',
  title: 'Raummiete',
  lineItems: [{ text: 'Raummiete Oktober', priceInCents: 10000 }],
  vat: 19,
  directDebit: false,
  email: 'anna@example.org',
  emailSalutation: 'Hallo',
};

async function seedTemplate() {
  await prisma.template.create({
    data: {
      type: 'RECHNUNG',
      version: 1,
      fileName: 'template.docx',
      filePath: 'templates/template.docx',
      active: true,
    },
  });
}

async function createDraft(): Promise<number> {
  const res = await request.post('/api/invoice-draft').send({
    recipientData: { name: 'Anna Alt', street: 'Hauptstr. 1', city: '12345 Berlin' },
    inputs,
  });
  return res.body.draftId;
}

beforeEach(() => {
  previewMock.mockReset().mockResolvedValue(PDF);
});

describe('GET /api/invoice-draft/:id/preview', () => {
  it('answers the preview PDF of the saved draft', async () => {
    await seedTemplate();
    const id = await createDraft();

    const res = await request.get(`/api/invoice-draft/${id}/preview`).buffer(true).parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('inline; filename="invoice-preview.pdf"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect((res.body as Buffer).equals(PDF)).toBe(true);
    expect(previewMock).toHaveBeenCalledWith('templates/template.docx', inputs, expect.any(Date));
  });

  it('takes no invoice number and keeps the draft', async () => {
    await seedTemplate();
    const id = await createDraft();
    await request.get(`/api/invoice-draft/${id}/preview`);

    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.invoiceRevision.count()).toBe(0);
    expect(await prisma.invoiceDraft.count()).toBe(1);
  });

  it('answers 400 without an active invoice template', async () => {
    const id = await createDraft();
    const res = await request.get(`/api/invoice-draft/${id}/preview`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No active invoice template found');
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('answers 500 with a plain message when the PDF cannot be generated', async () => {
    await seedTemplate();
    const id = await createDraft();
    previewMock.mockRejectedValue(new Error('libreoffice: secret path /app/data'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request.get(`/api/invoice-draft/${id}/preview`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Preview could not be generated' });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('answers 404 for a missing draft and 400 for an invalid id', async () => {
    expect((await request.get('/api/invoice-draft/99999/preview')).status).toBe(404);
    expect((await request.get('/api/invoice-draft/abc/preview')).status).toBe(400);
  });
});
