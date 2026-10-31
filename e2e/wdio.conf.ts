import { Browser, detectBrowserPlatform, install, resolveBuildId } from '@puppeteer/browsers';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BROWSER_CACHE_DIR = path.join(PROJECT_ROOT, '.browser-cache');

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000';
const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? 'http://localhost:5173';

const IS_HEADLESS = process.env.WDIO_HEADLESS !== 'false'; // true by default

let chromeBinaryPath: string | undefined;
let chromedriverProcess: ChildProcess | undefined;

async function waitForServer(url: string, timeout = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      if (res.ok || res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start within ${timeout}ms`);
}

// ── WDIO config ──────────────────────────────────────────────────────

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./tests/**/*.spec.ts'],
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: [
          ...(IS_HEADLESS ? ['--headless=new'] : []),
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      },
      hostname: 'localhost',
      port: 9515,
      path: '/',
    },
  ],

  logLevel: 'error',
  baseUrl: FRONTEND_URL,
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,

  services: [],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },

  // ── before each spec file: reset backend data ────────────────────

  async before() {
    console.log('\n[E2E] Resetting backend data before spec…');
    try {
      const res = await fetch(BACKEND_URL + '/api/e2e/reset', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(`Reset failed: ${JSON.stringify(body)}`);
      console.log('[E2E] Backend data reset complete\n');
    } catch (err) {
      console.error('[E2E] Data reset failed:', err);
      throw err;
    }
  },

  // ── once before all specs: download browsers, wait for servers ────

  async onPrepare(_config, capabilities) {
    // ── Download Chrome + ChromeDriver ───────────────────────────
    const platform = detectBrowserPlatform()!;
    const chromeBuildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
    console.log(`\n[E2E] Ensuring Chrome ${chromeBuildId} is available…`);

    const [chromeInstall, chromedriverInstall] = await Promise.all([
      install({
        browser: Browser.CHROME,
        buildId: chromeBuildId,
        cacheDir: BROWSER_CACHE_DIR,
      }),
      install({
        browser: Browser.CHROMEDRIVER,
        buildId: chromeBuildId,
        cacheDir: BROWSER_CACHE_DIR,
      }),
    ]);

    chromeBinaryPath = chromeInstall.executablePath;
    console.log(`[E2E] Chrome binary: ${chromeBinaryPath}`);
    console.log(`[E2E] ChromeDriver: ${chromedriverInstall.executablePath}`);

    // ── Start ChromeDriver ───────────────────────────────────────
    chromedriverProcess = spawn(chromedriverInstall.executablePath, ['--port=9515'], {
      stdio: 'pipe',
    });

    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch('http://localhost:9515/status');
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    try {
      const status = await fetch('http://localhost:9515/status');
      if (!status.ok) throw new Error(`ChromeDriver status: ${status.status}`);
    } catch {
      throw new Error('ChromeDriver failed to start');
    }
    console.log('[E2E] ChromeDriver started');

    // ── Configure base URL + Chrome binary for all capabilities ──
    _config.baseUrl = FRONTEND_URL;
    for (const cap of Array.isArray(capabilities) ? capabilities : [capabilities]) {
      const c = cap as Record<string, unknown>;
      c['wdio:baseUrl'] = FRONTEND_URL;
      const opts = (c['goog:chromeOptions'] ?? {}) as Record<string, unknown>;
      const args = (opts['args'] as string[] | undefined) ?? [];
      opts['binary'] = chromeBinaryPath;
      opts['args'] = args;
      c['goog:chromeOptions'] = opts;
    }

    // ── Wait for servers started by run-tests.sh ─────────────────
    console.log(`\n[E2E] Waiting for backend on ${BACKEND_URL}…`);
    await waitForServer(BACKEND_URL + '/api/health', 60_000);
    console.log('[E2E] Backend ready');

    console.log(`[E2E] Waiting for frontend on ${FRONTEND_URL}…`);
    await waitForServer(FRONTEND_URL, 60_000);
    console.log('[E2E] Frontend ready');
    console.log(`[E2E] Tests will run against: ${FRONTEND_URL}\n`);
  },

  // ── cleanup after all specs ─────────────────────────────────────

  async onComplete() {
    if (chromedriverProcess) {
      chromedriverProcess.kill('SIGTERM');
      setTimeout(() => {
        try {
          chromedriverProcess?.kill('SIGKILL');
        } catch {
          /* ok */
        }
      }, 2000);
    }
    console.log('\n[E2E] Done');
  },
};
