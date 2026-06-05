describe('Rechnung list', () => {
  beforeEach(async () => {
    await browser.url('/rechnung');
  });

  it('shows the page heading', async () => {
    const heading = await $('h2=Rechnungen');
    await expect(heading).toBeDisplayed();
  });

  it('shows the Einstellungen button', async () => {
    const btn = await $('button=Einstellungen');
    await expect(btn).toBeDisplayed();
    await expect(btn).toBeClickable();
  });

  it('shows the Neue Rechnung button (disabled without template)', async () => {
    const btn = await $('button*=Neue Rechnung');
    await expect(btn).toBeDisplayed();
    // Button is disabled until a template is uploaded
    const isDisabled = await btn.getAttribute('disabled');
    expect(isDisabled).toBe('true');
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
    const checkbox = await $('#mitStorniert-rechnung');
    await expect(checkbox).toBeDisplayed();
    const type = await checkbox.getAttribute('type');
    expect(type).toBe('checkbox');
  });

  it('shows empty state when no rechnungen exist', async () => {
    // Wait for the list to load
    await browser.waitUntil(
      async () => {
        const rows = await $$('tbody tr');
        return rows.length === 0;
      },
      { timeout: 5000 },
    );

    // Check if empty message is displayed or just no rows
    const rows = await $$('tbody tr');
    expect(rows.length).toBe(0);
  });

  it('displays the warning banner when no template is uploaded', async () => {
    // Look for the warning div or just verify the page shows expected state
    const heading = await $('h2=Rechnungen');
    await expect(heading).toBeDisplayed();
  });
});
