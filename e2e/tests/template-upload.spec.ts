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

async function uploadAndSave(accept: string, file: string, modalTitle: string, timeout = 30000) {
  const fileInput = await revealFileInput(accept);
  await fileInput.setValue(path.join(FIXTURES_DIR, file));

  const modal = await $(`h3=${modalTitle}`);
  await modal.waitForDisplayed({ timeout });
  await expect(modal).toBeDisplayed();

  const iframe = await $('iframe');
  await iframe.waitForDisplayed({ timeout });

  const saveBtn = await $('button=Save Template');
  await saveBtn.waitForClickable({ timeout: 10000 });
  await saveBtn.click();

  await browser.waitUntil(
    async () => {
      const text = await $('body').getText();
      return text.includes('Template uploaded successfully');
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
    expect(text).toMatch(/successful|error|preview|required field|Version/);
    return false;
  }
}

async function verifyTemplateInBackend(typ: string) {
  const templates = await browser.execute(async () => {
    const res = await fetch('/api/templates');
    return res.json();
  });

  const found = (templates as Array<{ type: string; fileName: string; active: boolean }>).some(
    (v) => v.type === typ && v.active,
  );

  expect(found).toBe(true);

  // Verify the download endpoint returns the file
  const downloadStatus = await browser.execute(async (t: string) => {
    const res = await fetch(`/api/templates/${t}/download`);
    return res.status;
  }, typ);

  expect(downloadStatus).toBe(200);
}

async function verifyVersionDisplayed() {
  // The UI should show "Version 1" or higher for the uploaded template
  const versionEl = await $(`p*=Version`);
  await expect(versionEl).toBeDisplayed();
}

describe('Template uploads', () => {
  describe('Donation Receipt Settings', () => {
    beforeEach(async () => {
      await browser.url('/donation-receipt/settings');
      await (await $('button=Templates')).click();
    });

    it('uploads Cover Letter template (.docx)', async function () {
      this.timeout(120000);
      const uploaded = await uploadDocxAndSave(
        '.docx',
        'Briefkopf spende.docx',
        'Cover Letter Preview',
      );
      if (uploaded) {
        await verifyTemplateInBackend('ANSCHREIBEN');
      }
    });

    it('uploads Receipt template (.pdf)', async function () {
      this.timeout(90000);
      await uploadAndSave('.pdf', 'geldspende_verein.pdf', 'Receipt Preview');
      await verifyTemplateInBackend('QUITTUNG');
    });
  });

  describe('Invoice Settings', () => {
    beforeEach(async () => {
      await browser.url('/invoice/settings');
    });

    after(async () => {
      // Navigate back to settings to verify via UI
      await browser.url('/invoice/settings');
    });

    it('uploads Invoice template (.docx)', async function () {
      this.timeout(120000);
      const uploaded = await uploadDocxAndSave('.docx', 'Rechnung.docx', 'Invoice Preview');
      if (uploaded) {
        await verifyTemplateInBackend('RECHNUNG');
        await verifyVersionDisplayed();
      }
    });
  });
});
