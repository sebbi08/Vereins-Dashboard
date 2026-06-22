describe('Settings', () => {
  beforeEach(async () => {
    await browser.url('/donation-receipt/settings');
  });

  it('shows the page heading', async () => {
    const heading = await $('h2=Donation Receipt Settings');
    await expect(heading).toBeDisplayed();
  });

  it('shows the Association Data form section', async () => {
    const sectionHeading = await $('h3=Association Data (Pre-fill)');
    await expect(sectionHeading).toBeDisplayed();
  });

  it('shows all association data input fields', async () => {
    const labels = [
      'Treasurer',
      'Charitable Purpose',
      'Tax Office',
      'Tax Number',
      'Assessment Period',
    ];

    for (const label of labels) {
      const labelEl = await $(`label*=${label}`);
      await expect(labelEl).toBeDisplayed();
    }
  });

  it('shows the Save button', async () => {
    const btn = await $('button=Save');
    await expect(btn).toBeDisplayed();
    await expect(btn).toBeClickable();
  });

  it('shows the Templates section', async () => {
    const sectionHeading = await $('h3=Templates');
    await expect(sectionHeading).toBeDisplayed();
  });

  it('shows ANSCHREIBEN and QUITTUNG template sections', async () => {
    const coverLetter = await $('p=Cover Letter (.docx)');
    const receipt = await $('p=Donation Receipt (.pdf)');
    await expect(coverLetter).toBeDisplayed();
    await expect(receipt).toBeDisplayed();
  });

  it('shows "No template uploaded" for each template type initially', async () => {
    const noTemplateMessages = await $$('p=No template uploaded');
    expect(noTemplateMessages.length).toBe(2);
  });

  it('saves settings and shows success message', async () => {
    // Find the Treasurer input by its label
    const treasurerLabel = await $('label*=Treasurer');
    const forAttr = await treasurerLabel.getAttribute('for');
    const input = forAttr ? await $(`#${forAttr}`) : await $('input[type="text"]');

    await input.clearValue();
    await input.setValue('Max Mustermann');

    const saveBtn = await $('button=Save');
    await saveBtn.click();

    // Wait for success message by looking for the green success div
    await browser.waitUntil(
      async () => {
        try {
          const msg = await $('.bg-green-50');
          return await msg.isDisplayed();
        } catch {
          return false;
        }
      },
      { timeout: 10000, timeoutMsg: 'Success message did not appear' },
    );

    const successDiv = await $('.bg-green-50');
    await expect(successDiv).toBeDisplayed();
  });
});
