describe('Spenden Quittungen list', () => {
  beforeEach(async () => {
    await browser.url('/spenden-quittung');
  });

  it('shows the page heading', async () => {
    const heading = await $('h2=Spenden Quittungen');
    await expect(heading).toBeDisplayed();
  });

  it('shows the Einstellungen button', async () => {
    const btn = await $('button=Einstellungen');
    await expect(btn).toBeDisplayed();
    await expect(btn).toBeClickable();
  });

  it('shows the Neue Quittung button (disabled without template)', async () => {
    const btn = await $('button*=Neue Quittung');
    await expect(btn).toBeDisplayed();
    // Button is disabled until a template is uploaded
    await expect(btn).toHaveAttribute('disabled', '');
  });

  it('shows the search filter input', async () => {
    const input = await $('input[placeholder*="Suche"]');
    await expect(input).toBeDisplayed();
  });

  it('shows the date filter inputs', async () => {
    const dateInputs = await $$('input[type="date"]');
    expect(dateInputs.length).toBe(2);
    for (const input of dateInputs) {
      await expect(input).toBeDisplayed();
    }
  });

  it('shows the "Stornierte anzeigen" checkbox', async () => {
    const checkbox = await $('#mitStorniert');
    await expect(checkbox).toBeDisplayed();
    await expect(checkbox).toHaveAttribute('type', 'checkbox');
  });

  it('shows empty state when no quittungen exist', async () => {
    const emptyMsg = await $('*=Keine Quittungen gefunden');
    await expect(emptyMsg).toBeDisplayed();
  });

  it('navigates to Einstellungen page when button is clicked', async () => {
    const btn = await $('button=Einstellungen');
    await btn.click();

    await browser.waitUntil(async () => (await browser.getUrl()).includes('/einstellungen'), {
      timeout: 5000,
      timeoutMsg: 'URL did not change to einstellungen',
    });

    const heading = await $('h2=Spenden Quittung Einstellungen');
    await expect(heading).toBeDisplayed();
  });

  it('displays the warning banner when no template is uploaded', async () => {
    const banner = await $('*=Keine Spendenquittungs-Vorlage hinterlegt');
    await expect(banner).toBeDisplayed();
  });
});
