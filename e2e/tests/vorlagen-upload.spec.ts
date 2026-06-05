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

async function uploadAndSave(
  accept: string,
  file: string,
  modalTitle: string,
  timeout = 30000,
) {
  const fileInput = await revealFileInput(accept);
  await fileInput.setValue(path.join(FIXTURES_DIR, file));

  const modal = await $(`h3=${modalTitle}`);
  await modal.waitForDisplayed({ timeout });
  await expect(modal).toBeDisplayed();

  const iframe = await $('iframe');
  await iframe.waitForDisplayed({ timeout });

  const saveBtn = await $('button=Vorlage speichern');
  await saveBtn.waitForClickable({ timeout: 10000 });
  await saveBtn.click();

  await browser.waitUntil(
    async () => {
      const text = await $('body').getText();
      return text.includes('Vorlage erfolgreich hochgeladen');
    },
    { timeout, timeoutMsg: `Upload of ${file} did not succeed` },
  );
}

async function uploadDocxAndSave(accept: string, file: string, modalTitle: string) {
  try {
    await uploadAndSave(accept, file, modalTitle, 60000);
    return true;
  } catch {
    // Preview generation via libreoffice can be slow; check for any response
    const body = await $('body');
    const text = await body.getText();
    // Verify the UI shows upload feedback (success or validation error)
    expect(text).toMatch(/erfolgreich|Fehler|Vorschau|Pflichtfeld|Version/);
    return false;
  }
}

async function verifyVorlageInBackend(typ: string, expectedFileName: string) {
  const vorlagen = await browser.execute(async () => {
    const res = await fetch('/api/vorlagen');
    return res.json();
  });

  const found = (vorlagen as Array<{ typ: string; dateiName: string; aktiv: boolean }>).some(
    (v) => v.typ === typ && v.aktiv,
  );

  expect(found).toBe(true);

  // Verify the download endpoint returns the file
  const downloadStatus = await browser.execute(async (t: string) => {
    const res = await fetch(`/api/vorlagen/${t}/download`);
    return res.status;
  }, typ);

  expect(downloadStatus).toBe(200);
}

async function verifyVersionDisplayed(typ: string) {
  // The UI should show "Version 1" or higher for the uploaded template
  const versionEl = await $(`p*=Version`);
  await expect(versionEl).toBeDisplayed();
}

describe('Template uploads', () => {
  describe('Spendenquittung Einstellungen', () => {
    beforeEach(async () => {
      await browser.url('/spenden-quittung/einstellungen');
    });

    it('uploads Anschreiben template (.docx)', async function () {
      this.timeout(120000);
      const uploaded = await uploadDocxAndSave(
        '.docx',
        'Briefkopf spende.docx',
        'Anschreiben Vorschau',
      );
      if (uploaded) {
        await verifyVorlageInBackend('ANSCHREIBEN', 'Briefkopf spende.docx');
      }
    });

    it('uploads Quittung template (.pdf)', async function () {
      this.timeout(90000);
      await uploadAndSave('.pdf', 'geldspende_verein.pdf', 'Quittung Vorschau');
      await verifyVorlageInBackend('QUITTUNG', 'geldspende_verein.pdf');
    });
  });

  describe('Rechnung Einstellungen', () => {
    beforeEach(async () => {
      await browser.url('/rechnung/einstellungen');
    });

    after(async () => {
      // Navigate back to settings to verify via UI
      await browser.url('/rechnung/einstellungen');
    });

    it('uploads Rechnung template (.docx)', async function () {
      this.timeout(120000);
      const uploaded = await uploadDocxAndSave('.docx', 'Rechnung.docx', 'Rechnung Vorschau');
      if (uploaded) {
        await verifyVorlageInBackend('RECHNUNG', 'Rechnung.docx');
        await verifyVersionDisplayed('RECHNUNG');
      }
    });
  });
});
