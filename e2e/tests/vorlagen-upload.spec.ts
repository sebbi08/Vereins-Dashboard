import path from 'path';

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixture');

describe('Template uploads', () => {
  describe('Spendenquittung Einstellungen', () => {
    beforeEach(async () => {
      await browser.url('/spenden-quittung/einstellungen');
    });

    it('uploads Anschreiben template (.docx)', async () => {
      const filePath = path.join(FIXTURES_DIR, 'Briefkopf spende.docx');
      const fileInput = await $('input[type="file"][accept*=".docx"]');
      await fileInput.setValue(filePath);

      const modal = await $('h3=Anschreiben Vorschau');
      await modal.waitForDisplayed({ timeout: 15000 });
      await expect(modal).toBeDisplayed();

      const saveBtn = await $('button=Vorlage speichern');
      await saveBtn.click();

      await browser.waitUntil(
        async () => {
          const text = await $('body').getText();
          return text.includes('Vorlage erfolgreich hochgeladen');
        },
        { timeout: 15000, timeoutMsg: 'Upload did not succeed' },
      );

      const versionText = await $('p*=Version');
      await expect(versionText).toBeDisplayed();
    });

    it('uploads Quittung template (.pdf)', async () => {
      const filePath = path.join(FIXTURES_DIR, 'geldspende_verein.pdf');
      const fileInput = await $('input[type="file"][accept*=".pdf"]');
      await fileInput.setValue(filePath);

      const modal = await $('h3=Quittung Vorschau');
      await modal.waitForDisplayed({ timeout: 15000 });
      await expect(modal).toBeDisplayed();

      const saveBtn = await $('button=Vorlage speichern');
      await saveBtn.click();

      await browser.waitUntil(
        async () => {
          const text = await $('body').getText();
          return text.includes('Vorlage erfolgreich hochgeladen');
        },
        { timeout: 15000 },
      );
    });
  });

  describe('Rechnung Einstellungen', () => {
    beforeEach(async () => {
      await browser.url('/rechnung/einstellungen');
    });

    it('uploads Rechnung template (.docx)', async () => {
      const filePath = path.join(FIXTURES_DIR, 'Rechnung.docx');
      const fileInput = await $('input[type="file"][accept=".docx"]');
      await fileInput.setValue(filePath);

      const modal = await $('h3=Rechnung Vorschau');
      await modal.waitForDisplayed({ timeout: 15000 });
      await expect(modal).toBeDisplayed();

      const saveBtn = await $('button=Vorlage speichern');
      await saveBtn.click();

      await browser.waitUntil(
        async () => {
          const text = await $('body').getText();
          return text.includes('Vorlage erfolgreich hochgeladen');
        },
        { timeout: 15000 },
      );
    });
  });
});
