import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { type CommandRunner, createDocxToPdf, docxToPdf } from '../../services/pdfGeneration';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, '../../../../e2e/fixture/Rechnung.docx');

function outDirOf(args: string[]): string {
  return args[args.indexOf('--outdir') + 1];
}

/** Pretends to be LibreOffice: writes `input.pdf` into the requested output directory. */
function fakeLibreOffice(
  onRun?: (args: string[]) => Promise<void> | void,
): CommandRunner & { calls: { args: string[]; options: unknown }[] } {
  const calls: { args: string[]; options: unknown }[] = [];
  const run = (async (_file: string, args: string[], options: unknown) => {
    calls.push({ args, options });
    await onRun?.(args);
    await fs.promises.writeFile(path.join(outDirOf(args), 'input.pdf'), '%PDF-fake');
  }) as CommandRunner & { calls: typeof calls };
  run.calls = calls;
  return run;
}

function libreOfficeAvailable(): boolean {
  try {
    execFileSync('libreoffice', ['--version'], { stdio: 'ignore', timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

describe('docxToPdf', () => {
  it('runs conversions one after another, never two at once', async () => {
    let running = 0;
    let maxRunning = 0;
    const run = fakeLibreOffice(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running--;
    });
    const convert = createDocxToPdf(run);

    const [a, b] = await Promise.all([convert(Buffer.from('a')), convert(Buffer.from('b'))]);

    expect(a.toString()).toBe('%PDF-fake');
    expect(b.toString()).toBe('%PDF-fake');
    expect(run.calls).toHaveLength(2);
    expect(maxRunning).toBe(1);
  });

  it('gives every conversion its own profile directory and a kill timeout', async () => {
    const run = fakeLibreOffice();
    const convert = createDocxToPdf(run);

    await convert(Buffer.from('a'));
    await convert(Buffer.from('b'));

    const profiles = run.calls.map(
      ({ args }) => args.find((a) => a.startsWith('-env:UserInstallation=file://'))!,
    );
    expect(profiles[0]).toBeDefined();
    expect(profiles[1]).toBeDefined();
    expect(profiles[0]).not.toBe(profiles[1]);
    expect(run.calls[0].args).toContain('--headless');
    expect(run.calls[0].options).toMatchObject({ killSignal: 'SIGKILL' });
    expect((run.calls[0].options as { timeout: number }).timeout).toBeGreaterThan(0);
  });

  it('removes its temp directory even when the conversion fails', async () => {
    let outDir = '';
    const run = fakeLibreOffice((args) => {
      outDir = outDirOf(args);
      throw new Error('soffice exited with code 1');
    });
    const convert = createDocxToPdf(run);

    await expect(convert(Buffer.from('a'))).rejects.toThrow('soffice exited with code 1');

    expect(outDir).not.toBe('');
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it('keeps converting after a failed conversion', async () => {
    let first = true;
    const run = fakeLibreOffice(() => {
      if (first) {
        first = false;
        throw new Error('boom');
      }
    });
    const convert = createDocxToPdf(run);

    await expect(convert(Buffer.from('a'))).rejects.toThrow('boom');
    expect((await convert(Buffer.from('b'))).toString()).toBe('%PDF-fake');
  });

  it.skipIf(!libreOfficeAvailable())(
    'converts two documents at the same time with the real LibreOffice',
    async () => {
      const docx = fs.readFileSync(templatePath);

      const [a, b] = await Promise.all([docxToPdf(docx), docxToPdf(docx)]);

      expect(a.subarray(0, 4).toString()).toBe('%PDF');
      expect(b.subarray(0, 4).toString()).toBe('%PDF');
    },
    120_000,
  );
});
