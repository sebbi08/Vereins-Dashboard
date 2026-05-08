describe('Home / Dashboard', () => {
  it('shows the dashboard heading', async () => {
    await browser.url('/');

    const heading = await $('h2=Dashboard');
    await expect(heading).toBeDisplayed();
  });

  it('shows the Spenden Quittung navigation card', async () => {
    await browser.url('/');

    const card = await $('a[href="/spenden-quittung"]');
    await expect(card).toBeDisplayed();
    await expect(card).toHaveText(expect.stringContaining('Spenden Quittung'));
  });

  it('shows the Rechnung navigation card', async () => {
    await browser.url('/');

    const card = await $('a[href="/rechnung"]');
    await expect(card).toBeDisplayed();
    await expect(card).toHaveText(expect.stringContaining('Rechnung'));
  });

  it('navigates to Spenden Quittung list on card click', async () => {
    await browser.url('/');

    const card = await $('a[href="/spenden-quittung"]');
    await card.click();

    await browser.waitUntil(async () => (await browser.getUrl()).includes('/spenden-quittung'), {
      timeout: 5000,
      timeoutMsg: 'URL did not change to /spenden-quittung',
    });

    const heading = await $('h2=Spenden Quittungen');
    await expect(heading).toBeDisplayed();
  });
});
