import fs from 'fs';
import os from 'os';
import path from 'path';
import { BACKEND_URL, uploadInvoiceTemplate } from './helpers';

/** A synthetic bank export as the bank writes it: UTF-16 LE with BOM, CRLF, semicolons. */
function writeBookingFile(lines: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-bookings-'));
  const file = path.join(dir, 'bookings.csv');
  const text = lines.join('\r\n') + '\r\n';
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
  return file;
}

async function acceptConfirm(label: string) {
  const accept = await $('.p-confirmdialog').$(`button=${label}`);
  await accept.waitForClickable({ timeout: 5000 });
  await accept.click();
}

describe('Invoice payments', () => {
  let invoiceId = 0;

  before(async function () {
    this.timeout(60000);
    await uploadInvoiceTemplate();
    const res = await fetch(`${BACKEND_URL}/api/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: {
          salutation: '',
          name: 'E2E Zahler GmbH',
          street: 'Zahlweg 1',
          city: 'Zahlstadt',
          invoiceDate: '2025-06-01',
          title: 'E2E Raummiete',
          lineItems: [{ text: 'Raummiete Juni', priceInCents: 5000 }],
          vat: 19,
          directDebit: false,
          email: '',
          emailSalutation: '',
        },
        recipientData: { name: 'E2E Zahler GmbH', street: 'Zahlweg 1', city: 'Zahlstadt' },
      }),
    });
    expect([200, 201, 202]).toContain(res.status);
    invoiceId = (await res.json()).invoiceId;
    expect(invoiceId).toBeGreaterThan(0);
  });

  it('marks the invoice paid from a bank export', async function () {
    this.timeout(60000);
    await browser.url('/invoice/payment-import');
    await (await $('h2=Import bank bookings')).waitForDisplayed({ timeout: 10000 });

    const file = writeBookingFile([
      'Buchungstag;Konto;Empfänger;Verwendungszweck;Betrag',
      '01.07.2025;Giro;E2E Zahler GmbH;"Miete Juni; danke";59,50',
      '02.07.2025;Giro;Stadtwerke;Strom;-120,00',
    ]);
    await $('[data-testid="booking-file"]').setValue(file);
    await expect($('[data-testid="csv-preview"]')).toHaveText(
      expect.stringContaining('E2E Zahler GmbH'),
    );

    await $('[data-testid="match-bookings"]').click();
    const row = await $('.match-row');
    await row.waitForDisplayed({ timeout: 10000 });
    await expect(row).toHaveText(expect.stringContaining('Confident'));

    await $('[data-testid="confirm-paid"]').click();
    await acceptConfirm('Mark as paid');
    await $('.match-row').waitForExist({ reverse: true, timeout: 10000 });

    await browser.url(`/invoice/${invoiceId}`);
    await expect($('[data-testid="payment-status"]')).toHaveText('Paid');
  });

  it('marks the invoice unpaid again on its page', async function () {
    this.timeout(30000);
    await browser.url(`/invoice/${invoiceId}`);
    await $('[data-testid="mark-unpaid"]').click();
    await acceptConfirm('Mark as unpaid');
    await expect($('[data-testid="payment-status"]')).toHaveText('Open');
  });
});
