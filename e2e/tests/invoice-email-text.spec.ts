import { BACKEND_URL, uploadInvoiceTemplate } from './helpers';

async function acceptConfirm(label: string) {
  const accept = await $('.p-confirmdialog').$(`button=${label}`);
  await accept.waitForClickable({ timeout: 5000 });
  await accept.click();
}

describe('Invoice email text and draft preview', () => {
  let draftId = 0;

  before(async function () {
    this.timeout(60000);
    await uploadInvoiceTemplate();
    const res = await fetch(`${BACKEND_URL}/api/invoice-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: {
          salutation: 'Frau',
          name: 'E2E Entwurf GmbH',
          street: 'Entwurfsweg 1',
          city: 'Entwurfsstadt',
          title: 'E2E Kursgebühr',
          lineItems: [{ text: 'Kursgebühr', priceInCents: 5000 }],
          vat: 19,
          directDebit: false,
          email: 'entwurf@example.com',
          emailSalutation: 'Sehr geehrte Damen und Herren',
        },
        recipientData: {
          name: 'E2E Entwurf GmbH',
          street: 'Entwurfsweg 1',
          city: 'Entwurfsstadt',
        },
      }),
    });
    expect(res.status).toBe(201);
    draftId = (await res.json()).draftId;
  });

  it('keeps an edited email text with the draft', async function () {
    this.timeout(30000);
    await browser.url(`/invoice/draft/${draftId}`);
    const body = await $('[data-testid="email-body"]');
    await body.waitForDisplayed({ timeout: 10000 });
    await expect(body).toHaveValue(expect.stringContaining('{number}'));

    await body.setValue('E2E Text für Rechnung {number}');
    await $('[data-testid="save-draft"]').click();
    await expect($('[data-testid="preview-draft"]')).toBeEnabled();

    await browser.refresh();
    await expect($('[data-testid="email-body"]')).toHaveValue('E2E Text für Rechnung {number}');
  });

  it('answers a preview PDF for the draft without creating an invoice', async function () {
    this.timeout(60000);
    const res = await fetch(`${BACKEND_URL}/api/invoice-draft/${draftId}/preview`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    const invoices = await (await fetch(`${BACKEND_URL}/api/invoice?withCancelled=true`)).json();
    expect(invoices).toHaveLength(0);
  });

  it('takes the text over when the draft becomes an invoice', async function () {
    this.timeout(60000);
    await browser.url(`/invoice/draft/${draftId}`);
    const activate = await $('[data-testid="activate-draft"]');
    await activate.waitForClickable({ timeout: 10000 });
    await activate.click();
    await acceptConfirm('Activate');

    await (await $('h2*=Invoice ')).waitForDisplayed({ timeout: 20000 });
    await expect($('[data-testid="email-body"]')).toHaveValue('E2E Text für Rechnung {number}');
  });
});
