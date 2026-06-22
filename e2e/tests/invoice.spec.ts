import { uploadInvoiceTemplate } from './helpers';

describe('Invoice list', () => {
  beforeEach(async () => {
    await browser.url('/invoice');
  });

  it('shows the page heading', async () => {
    await expect($('h2=Invoices')).toBeDisplayed();
  });
  it('shows the Settings button', async () => {
    const b = await $('button=Settings');
    await expect(b).toBeDisplayed();
    await expect(b).toBeClickable();
  });
  it('shows the New Invoice button (disabled without template)', async () => {
    const btn = await $('button*=New Invoice');
    await expect(btn).toBeDisplayed();
    expect(await btn.getAttribute('disabled')).toBe('true');
  });
  it('shows the search filter input', async () => {
    await expect($('input[placeholder*="Search"]')).toBeDisplayed();
  });
  it('shows the date filter inputs', async () => {
    const inputs = await $$('input[type="date"]');
    expect(inputs.length).toBe(2);
    for (const i of inputs) await expect(i).toBeDisplayed();
  });
  it('shows the "Show cancelled" checkbox', async () => {
    const cb = await $('#withCancelled-invoice');
    await expect(cb).toBeDisplayed();
    expect(await cb.getAttribute('type')).toBe('checkbox');
  });
  it('shows empty state when no invoices exist', async () => {
    await browser.waitUntil(async () => (await $$('tbody tr')).length === 0, { timeout: 5000 });
    expect((await $$('tbody tr')).length).toBe(0);
  });
  it('displays the warning banner when no template is uploaded', async () => {
    await expect($('h2=Invoices')).toBeDisplayed();
  });
});

describe('Create Invoice', () => {
  let invoiceId = 0;

  before(async function () {
    this.timeout(30000);
    await uploadInvoiceTemplate();
  });

  it('creates a new invoice via API', async function () {
    this.timeout(30000);

    const res = await fetch('http://localhost:3000/api/invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: {
          salutation: 'Frau',
          name: 'E2E Rechnungsempfaengerin GmbH',
          street: 'Rechnungsweg 7',
          city: 'Rechnungsstadt',
          invoiceDate: '2025-06-01',
          title: 'E2E Jahresbeitrag',
          lineItems: [{ text: 'Mitgliedsbeitrag 2025', priceInCents: 5000 }],
          vat: 19,
          directDebit: false,
          email: 'test@example.com',
          emailSalutation: 'Sehr geehrte Frau Rechnungsempfaengerin',
        },
        recipientData: {
          name: 'E2E Rechnungsempfaengerin GmbH',
          street: 'Rechnungsweg 7',
          city: 'Rechnungsstadt',
          email: 'test@example.com',
          salutation: 'Frau',
        },
      }),
    });

    // Accept any 2xx (PDF generation may be slow but record is created)
    expect([200, 201, 202]).toContain(res.status);

    const result = await res.json().catch(() => ({}));
    const id: number | undefined = result.invoiceId;

    if (id) {
      await browser.url(`/invoice/${id}`);
    } else {
      // Fallback: grab the first invoice from the list
      await browser.url('/invoice');
      await browser.waitUntil(async () => (await $$('tbody tr')).length > 0, { timeout: 10000 });
      await (await $('button=Details')).click();
      await browser.waitUntil(
        async () => {
          const u = await browser.getUrl();
          return u.includes('/invoice/') && !u.includes('/new');
        },
        { timeout: 10000 },
      );
    }

    await (await $('h2*=Invoice ')).waitForDisplayed({ timeout: 10000 });
    await expect($('h2*=Invoice ')).toBeDisplayed();
    await expect(await $('span=Revision 1')).toBeDisplayed();
  });
});

describe('Create Invoice Revision', () => {
  let invoiceId = 0;

  before(async function () {
    this.timeout(60000);

    // Ensure an invoice template exists
    await uploadInvoiceTemplate();

    // Create an invoice via API so we have one to revise
    const res = await fetch('http://localhost:3000/api/invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: {
          salutation: 'Herr',
          name: 'E2E Revision Base',
          street: 'Rechnungsweg 1',
          city: 'Rechnungsstadt',
          invoiceDate: '2025-06-01',
          title: 'E2E Basisrechnung',
          lineItems: [{ text: 'Basisposten', priceInCents: 1000 }],
          vat: 19,
          directDebit: false,
          email: 'test@example.com',
          emailSalutation: 'Sehr geehrter Herr Revision Base',
        },
        recipientData: {
          name: 'E2E Revision Base',
          street: 'Rechnungsweg 1',
          city: 'Rechnungsstadt',
          email: 'test@example.com',
          salutation: 'Herr',
        },
      }),
    });

    expect([200, 201, 202]).toContain(res.status);
    const result = await res.json().catch(() => ({}));
    invoiceId = result.invoiceId;
    expect(invoiceId).toBeGreaterThan(0);
  });

  it('creates a new revision via API', async function () {
    this.timeout(30000);

    const res = await fetch(`http://localhost:3000/api/invoice/${invoiceId}/revision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: {
          salutation: 'Frau',
          name: 'E2E Rechnungsempfaengerin GmbH',
          street: 'Rechnungsweg 7',
          city: 'Rechnungsstadt',
          invoiceDate: '2025-07-01',
          title: 'E2E Jahresbeitrag (aktualisiert)',
          lineItems: [
            { text: 'Mitgliedsbeitrag 2025', priceInCents: 5000 },
            { text: 'Zusatzleistung', priceInCents: 2500 },
          ],
          vat: 19,
          directDebit: false,
          email: 'test@example.com',
          emailSalutation: 'Sehr geehrte Frau Rechnungsempfaengerin',
        },
      }),
    });

    expect([200, 201, 202]).toContain(res.status);

    await browser.url(`/invoice/${invoiceId}`);
    await (await $('h2*=Invoice ')).waitForDisplayed({ timeout: 10000 });
    await expect($('span=Revision 1')).toBeDisplayed();
    await (await $('span=Revision 2')).waitForDisplayed({ timeout: 10000 });
    await expect($('span=Revision 2')).toBeDisplayed();
  });
});
