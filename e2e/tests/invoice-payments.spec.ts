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

/** An invoice over 59,50 € for the payer of the booking file; answers its id. */
async function createInvoice(title: string): Promise<number> {
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
        title,
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
  const id: number = (await res.json()).invoiceId;
  expect(id).toBeGreaterThan(0);
  return id;
}

describe('Invoice payments', () => {
  let invoiceId = 0;
  let file = '';

  before(async function () {
    this.timeout(60000);
    await uploadInvoiceTemplate();
    invoiceId = await createInvoice('E2E Raummiete Juni');
    file = writeBookingFile([
      'Buchungstag;Konto;Empfänger;Verwendungszweck;Betrag',
      '01.07.2025;Giro;E2E Zahler GmbH;"Miete Juni; danke";59,50',
      '02.07.2025;Giro;Stadtwerke;Strom;-120,00',
    ]);
  });

  it('marks the invoice paid from a bank export', async function () {
    this.timeout(60000);
    await browser.url('/invoice/payment-import');
    await (await $('h2=Import bank bookings')).waitForDisplayed({ timeout: 10000 });

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

  it('does not propose the used booking for another invoice of the payer', async function () {
    this.timeout(60000);
    await createInvoice('E2E Raummiete Juli');

    await browser.url('/invoice/payment-import');
    await (await $('h2=Import bank bookings')).waitForDisplayed({ timeout: 10000 });
    await $('[data-testid="booking-file"]').setValue(file);
    await $('[data-testid="match-bookings"]').click();

    const used = await $('[data-testid="used-bookings"] summary');
    await used.waitForDisplayed({ timeout: 10000 });
    await expect(used).toHaveText('Bookings already used for a paid invoice (1)');
    await expect($('.match-row')).not.toBeExisting();
  });

  it('marks the invoice unpaid again on its page', async function () {
    this.timeout(30000);
    await browser.url(`/invoice/${invoiceId}`);
    await $('[data-testid="mark-unpaid"]').click();
    await acceptConfirm('Mark as unpaid');
    await expect($('[data-testid="payment-status"]')).toHaveText('Open');
  });
});
