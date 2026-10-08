import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { type CommandRunner, createDocxToPdf } from '../../services/pdfGeneration';

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

  function profileOf(args: string[]): string {
    return args.find((a) => a.startsWith('-env:UserInstallation=file://'))!;
  }

  it('reuses its own profile across conversions, with a kill timeout', async () => {
    // A fresh profile costs several seconds of LibreOffice start-up on every conversion
    const run = fakeLibreOffice();
    const convert = createDocxToPdf(run);

    await convert(Buffer.from('a'));
    await convert(Buffer.from('b'));

    const [first, second] = run.calls.map(({ args }) => profileOf(args));
    expect(first).toBeDefined();
    expect(first).not.toContain(process.env.HOME ?? '/root');
    expect(second).toBe(first);
    expect(run.calls[0].args).toContain('--headless');
    expect(run.calls[0].options).toMatchObject({ killSignal: 'SIGKILL' });
    expect((run.calls[0].options as { timeout: number }).timeout).toBeGreaterThan(0);
  });

  it('starts over with a fresh profile after a failed or killed conversion', async () => {
    // A killed LibreOffice leaves its profile locked, which would block every later run
    let first = true;
    const run = fakeLibreOffice(() => {
      if (first) {
        first = false;
        throw new Error('killed after timeout');
      }
    });
    const convert = createDocxToPdf(run);

    await expect(convert(Buffer.from('a'))).rejects.toThrow();
    await convert(Buffer.from('b'));

    const [failed, next] = run.calls.map(({ args }) => profileOf(args));
    expect(next).not.toBe(failed);
    expect(fs.existsSync(failed.replace('-env:UserInstallation=file://', ''))).toBe(false);
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
});
