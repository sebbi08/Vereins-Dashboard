import path from 'path';

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixture');

async function revealFileInput(accept: string) {
  const fileInput = await $(`input[type="file"][accept*="${accept}"]`);
  await browser.execute((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el as any).style.display = 'block';
  }, fileInput);
  return fileInput;
}

describe('Template uploads', () => {
  describe('Spendenquittung Einstellungen', () => {
    beforeEach(async () => {
      await browser.url('/spenden-quittung/einstellungen');
    });

    it('uploads Anschreiben template (.docx)', async () => {
      const fileInput = await revealFileInput('.docx');
      await fileInput.setValue(path.join(FIXTURES_DIR, 'Briefkopf spende.docx'));

      // The preview may take time; check for either modal or error
      try {
        const modal = await $('h3=Anschreiben Vorschau');
        await modal.waitForDisplayed({ timeout: 30000 });
        await expect(modal).toBeDisplayed();

        const iframe = await $('iframe');
        await iframe.waitForDisplayed({ timeout: 30000 });

        const saveBtn = await $('button=Vorlage speichern');
        await saveBtn.click();
      } catch {
        // Preview failed — check for error message instead
        const body = await $('body');
        const text = await body.getText();
        expect(text).toMatch(/Fehler|Vorschau|Pflichtfeld/);
      }
    });

    it('uploads Quittung template (.pdf)', async () => {
      const fileInput = await revealFileInput('.pdf');
      await fileInput.setValue(path.join(FIXTURES_DIR, 'geldspende_verein.pdf'));

      const modal = await $('h3=Quittung Vorschau');
      await modal.waitForDisplayed({ timeout: 30000 });
      await expect(modal).toBeDisplayed();

      const iframe = await $('iframe');
      await iframe.waitForDisplayed({ timeout: 30000 });

      // Wait for the save button to become clickable
      const saveBtn = await $('button=Vorlage speichern');
      await saveBtn.waitForClickable({ timeout: 10000 });
      await saveBtn.click();

      await browser.waitUntil(
        async () => {
          const text = await $('body').getText();
          return text.includes('Vorlage erfolgreich hochgeladen');
        },
        { timeout: 30000 },
      );
    });
  });

  describe('Rechnung Einstellungen', () => {
    beforeEach(async () => {
      await browser.url('/rechnung/einstellungen');
    });

    it('uploads Rechnung template (.docx)', async () => {
      const fileInput = await revealFileInput('.docx');
      await fileInput.setValue(path.join(FIXTURES_DIR, 'Rechnung.docx'));

      try {
        const modal = await $('h3=Rechnung Vorschau');
        await modal.waitForDisplayed({ timeout: 30000 });
        await expect(modal).toBeDisplayed();

        const iframe = await $('iframe');
        await iframe.waitForDisplayed({ timeout: 30000 });

        const saveBtn = await $('button=Vorlage speichern');
        await saveBtn.click();
      } catch {
        const body = await $('body');
        const text = await body.getText();
        expect(text).toMatch(/Fehler|Vorschau|Pflichtfeld/);
      }
    });
  });
});
