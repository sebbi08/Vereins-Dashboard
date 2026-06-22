import { uploadReceiptTemplate } from './helpers';

describe('Donation Receipts list', () => {
  beforeEach(async () => {
    await browser.url('/donation-receipt');
  });

  it('shows the page heading', async () => {
    await expect($('h2=Donation Receipts')).toBeDisplayed();
  });
  it('shows the Settings button', async () => {
    const b = await $('button=Settings');
    await expect(b).toBeDisplayed();
    await expect(b).toBeClickable();
  });
  it('shows the New Receipt button', async () => {
    await expect($('button*=New Receipt')).toBeDisplayed();
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
    const cb = await $('#withCancelled');
    await expect(cb).toBeDisplayed();
    expect(await cb.getAttribute('type')).toBe('checkbox');
  });
  it('shows empty state when no receipts exist', async () => {
    await browser.waitUntil(async () => (await $$('tbody tr')).length === 0, { timeout: 5000 });
    expect((await $$('tbody tr')).length).toBe(0);
  });
  it('navigates to Settings page when button is clicked', async () => {
    await (await $('button=Settings')).click();
    await browser.waitUntil(async () => (await browser.getUrl()).includes('/settings'), {
      timeout: 5000,
    });
    await expect($('h2=Donation Receipt Settings')).toBeDisplayed();
  });
  it('displays the warning banner when no template is uploaded', async () => {
    await expect($('h2=Donation Receipts')).toBeDisplayed();
  });
});

describe('Create Donation Receipt', () => {
  let receiptId = 0;

  before(async function () {
    this.timeout(30000);
    await uploadReceiptTemplate();
  });

  it('creates a new donation receipt via API', async function () {
    this.timeout(60000);

    const result = await browser.execute(async () => {
      const res = await fetch('/api/donation-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: {
            name: 'E2E Testspender',
            street: 'Teststraße 42',
            city: 'Teststadt',
            letterSalutation: 'Sehr geehrte Damen und Herren',
            addressSalutation: '',
            donationAmountCents: 10000,
            donationDate: '2025-06-15',
            withCoverLetter: false,
            treasurer: 'E2E Kassenwart',
            charitablePurpose: 'Förderung des E2E-Tests',
            taxOfficeName: 'Finanzamt Teststadt',
            taxNumber: '123/456/789',
            exemptionDate: '',
            assessmentPeriod: '2025',
          },
          donorData: {
            name: 'E2E Testspender',
            street: 'Teststraße 42',
            city: 'Teststadt',
            letterSalutation: 'Sehr geehrte Damen und Herren',
            addressSalutation: '',
          },
        }),
      });
      return res.json();
    });

    expect(result.receiptId).toBeGreaterThan(0);

    await browser.url(`/donation-receipt/${result.receiptId}`);
    await (await $('h2=Receipt Details')).waitForDisplayed({ timeout: 10000 });
    await expect($('h2=Receipt Details')).toBeDisplayed();
    await expect(await $('span=R1')).toBeDisplayed();
  });
});

describe('Create Donation Receipt Revision', () => {
  let receiptId = 0;

  before(async function () {
    this.timeout(60000);

    // Ensure a receipt template exists
    await uploadReceiptTemplate();

    // Create a receipt via API
    const result = await browser.execute(async () => {
      const res = await fetch('/api/donation-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: {
            name: 'E2E Revision Base',
            street: 'Teststraße 42',
            city: 'Teststadt',
            letterSalutation: 'Sehr geehrte Damen und Herren',
            addressSalutation: '',
            donationAmountCents: 10000,
            donationDate: '2025-06-15',
            withCoverLetter: false,
            treasurer: 'E2E Kassenwart',
            charitablePurpose: 'Förderung des E2E-Tests',
            taxOfficeName: 'Finanzamt Teststadt',
            taxNumber: '123/456/789',
            exemptionDate: '',
            assessmentPeriod: '2025',
          },
          donorData: {
            name: 'E2E Revision Base',
            street: 'Teststraße 42',
            city: 'Teststadt',
            letterSalutation: 'Sehr geehrte Damen und Herren',
            addressSalutation: '',
          },
        }),
      });
      return res.json();
    });
    receiptId = result.receiptId;
    expect(receiptId).toBeGreaterThan(0);
  });

  it('creates a new revision via API', async function () {
    this.timeout(60000);

    const result = await browser.execute(async (id) => {
      const res = await fetch(`/api/donation-receipt/${id}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: {
            name: 'E2E Testspender',
            street: 'Teststraße 42',
            city: 'Teststadt',
            letterSalutation: 'Sehr geehrte Damen und Herren',
            addressSalutation: '',
            donationAmountCents: 20000,
            donationDate: '2025-07-01',
            withCoverLetter: false,
            treasurer: 'E2E Kassenwart',
            charitablePurpose: 'Förderung des E2E-Tests',
            taxOfficeName: 'Finanzamt Teststadt',
            taxNumber: '123/456/789',
            exemptionDate: '',
            assessmentPeriod: '2025',
          },
        }),
      });
      return res.json();
    }, receiptId);

    expect(result.revisionId).toBeGreaterThan(0);

    await browser.url(`/donation-receipt/${receiptId}`);
    await (await $('h2=Receipt Details')).waitForDisplayed({ timeout: 10000 });
    await expect($('span=R1')).toBeDisplayed();
    await (await $('span=R2')).waitForDisplayed({ timeout: 10000 });
    await expect($('span=R2')).toBeDisplayed();
  });
});
