import fs from 'fs';
import path from 'path';

// same default as wdio.conf.ts; set E2E_BACKEND_URL to run against another backend
export const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000';

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixture');

/**
 * Upload a template file via the API (bypasses the UI for speed).
 * Uses Node.js FormData + fetch — call from test context (Node.js process, not browser.execute).
 */
export async function uploadTemplateViaApi(
  type: 'QUITTUNG' | 'ANSCHREIBEN' | 'RECHNUNG',
  fixtureFilename: string,
): Promise<number> {
  const filePath = path.join(FIXTURES_DIR, fixtureFilename);
  const fileBuffer = await fs.promises.readFile(filePath);

  const formData = new FormData();
  formData.append(
    'template',
    new Blob([fileBuffer], { type: 'application/octet-stream' }),
    fixtureFilename,
  );

  const res = await fetch(`${BACKEND_URL}/api/templates/${type}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Template upload failed (${res.status}): ${JSON.stringify(body)}`);
  }

  const json = await res.json();
  return json.id as number;
}

/**
 * Upload the donation receipt template (PDF) needed for creating receipts.
 */
export async function uploadReceiptTemplate(): Promise<void> {
  await uploadTemplateViaApi('QUITTUNG', 'geldspende_verein.pdf');
}

/**
 * Upload the invoice template (DOCX) needed for creating invoices.
 */
export async function uploadInvoiceTemplate(): Promise<void> {
  await uploadTemplateViaApi('RECHNUNG', 'Rechnung.docx');
}
