describe('Einstellungen (Settings)', () => {
  beforeEach(async () => {
    await browser.url('/spenden-quittung/einstellungen');
  });

  it('shows the page heading', async () => {
    const heading = await $('h2=Spenden Quittung Einstellungen');
    await expect(heading).toBeDisplayed();
  });

  it('shows the Vereinsdaten form section', async () => {
    const sectionHeading = await $('h3=Vereinsdaten (Vorausfüllung)');
    await expect(sectionHeading).toBeDisplayed();
  });

  it('shows all association data input fields', async () => {
    const labels = [
      'Kassenwart',
      'Gemeinnütziger Zweck',
      'Finanzamt',
      'Steuernummer',
      'Veranlagungszeitraum',
    ];

    for (const label of labels) {
      const labelEl = await $(`label*=${label}`);
      await expect(labelEl).toBeDisplayed();
    }
  });

  it('shows the Speichern button', async () => {
    const btn = await $('button=Speichern');
    await expect(btn).toBeDisplayed();
    await expect(btn).toBeClickable();
  });

  it('shows the Vorlagen section', async () => {
    const sectionHeading = await $('h3=Vorlagen');
    await expect(sectionHeading).toBeDisplayed();
  });

  it('shows ANSCHREIBEN and QUITTUNG template sections', async () => {
    const anschreiben = await $('p=Anschreiben (.docx)');
    const quittung = await $('p=Spendenquittung (.pdf)');
    await expect(anschreiben).toBeDisplayed();
    await expect(quittung).toBeDisplayed();
  });

  it('shows "Keine Vorlage hinterlegt" for each template type initially', async () => {
    const noTemplateMessages = await $$('p=Keine Vorlage hinterlegt');
    expect(noTemplateMessages.length).toBe(2);
  });

  it('saves settings and shows success message', async () => {
    // Find the Kassenwart input by its label
    const kassenwartLabel = await $('label*=Kassenwart');
    const forAttr = await kassenwartLabel.getAttribute('for');
    const input = forAttr ? await $(`#${forAttr}`) : await $('input[type="text"]');

    await input.clearValue();
    await input.setValue('Max Mustermann');

    const saveBtn = await $('button=Speichern');
    await saveBtn.click();

    // Wait for success message by looking for the green success div
    await browser.waitUntil(async () => {
      try {
        const msg = await $('.bg-green-50');
        return await msg.isDisplayed();
      } catch {
        return false;
      }
    }, { timeout: 10000, timeoutMsg: 'Success message did not appear' });

    const successDiv = await $('.bg-green-50');
    await expect(successDiv).toBeDisplayed();
  });
});
