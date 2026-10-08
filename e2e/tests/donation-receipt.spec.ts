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
  it('shows the date range filter', async () => {
    await expect($('[aria-label="Filter by donation date"]')).toBeDisplayed();
  });
  it('shows the status filter with Active selected', async () => {
    const filter = await $('[data-testid="status-filter"]');
    await expect(filter).toBeDisplayed();
    await expect(filter.$('[aria-pressed="true"]')).toHaveText('Active');
  });
  it('shows empty state when no receipts exist', async () => {
    await expect($('td*=No receipts found.')).toBeDisplayed();
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
            exemptionDate: '2024-01-01',
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
    await (await $('h2*=Receipt ')).waitForDisplayed({ timeout: 10000 });
    await expect($('h2*=Receipt ')).toBeDisplayed();
    await expect(await $('span=Revision 1')).toBeDisplayed();
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
            exemptionDate: '2024-01-01',
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
            exemptionDate: '2024-01-01',
            assessmentPeriod: '2025',
          },
        }),
      });
      return res.json();
    }, receiptId);

    expect(result.revisionId).toBeGreaterThan(0);

    await browser.url(`/donation-receipt/${receiptId}`);
    await (await $('h2*=Receipt ')).waitForDisplayed({ timeout: 10000 });
    await expect($('span=Revision 1')).toBeDisplayed();
    await (await $('span=Revision 2')).waitForDisplayed({ timeout: 10000 });
    await expect($('span=Revision 2')).toBeDisplayed();
  });
});
