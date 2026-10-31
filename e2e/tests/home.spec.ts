describe('Home / Dashboard', () => {
  it('shows the dashboard heading', async () => {
    await browser.url('/');

    const heading = await $('h2=Dashboard');
    await expect(heading).toBeDisplayed();
  });

  it('shows the Donation Receipt navigation card', async () => {
    await browser.url('/');

    const card = await $('a.tile__link[href="/donation-receipt"]');
    await expect(card).toBeDisplayed();
    await expect(card).toHaveText(expect.stringContaining('Donation Receipt'));
  });

  it('shows the Invoice navigation card', async () => {
    await browser.url('/');

    const card = await $('a.tile__link[href="/invoice"]');
    await expect(card).toBeDisplayed();
    await expect(card).toHaveText(expect.stringContaining('Invoice'));
  });

  it('navigates to Donation Receipt list on card click', async () => {
    await browser.url('/');

    const card = await $('a.tile__link[href="/donation-receipt"]');
    await card.click();

    await browser.waitUntil(async () => (await browser.getUrl()).includes('/donation-receipt'), {
      timeout: 5000,
      timeoutMsg: 'URL did not change to /donation-receipt',
    });

    const heading = await $('h2=Donation Receipts');
    await expect(heading).toBeDisplayed();
  });
});
