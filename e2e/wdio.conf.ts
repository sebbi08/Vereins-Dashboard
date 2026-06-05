import { Browser, detectBrowserPlatform, install, resolveBuildId } from '@puppeteer/browsers';
import type { Options } from '@wdio/types';

import path from 'path';
import { GenericContainerBuilder, Wait, type StartedTestContainer } from 'testcontainers';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BROWSER_CACHE_DIR = path.join(PROJECT_ROOT, '.browser-cache');

const WDIO_TARGET = process.env.WDIO_TARGET ?? 'container'; // 'container' or 'local'
const IS_LOCAL_MODE = WDIO_TARGET === 'local';
const IS_HEADLESS = process.env.WDIO_HEADLESS !== 'false'; // true by default

let startedContainer: StartedTestContainer | undefined;
let chromeBinaryPath: string | undefined;

export const config: Options.Testrunner = {
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
    },
  ],

  logLevel: 'error',
  baseUrl: IS_LOCAL_MODE ? 'http://localhost:5173' : 'http://placeholder',
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,

  services: [
    [
      'chromedriver',
      {
        port: 9515,
        args: ['--silent'],
        chromedriverCustomPath: path.resolve(__dirname, '..', 'node_modules', 'chromedriver', 'bin', 'chromedriver'),
      },
    ],
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },

  async onPrepare(_config, capabilities) {
    const platform = detectBrowserPlatform()!;
    const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
    console.log(`\n[E2E] Ensuring Chrome ${buildId} is available…`);
    const installed = await install({
      browser: Browser.CHROME,
      buildId,
      cacheDir: BROWSER_CACHE_DIR,
    });
    chromeBinaryPath = installed.executablePath;
    console.log(`[E2E] Chrome binary: ${chromeBinaryPath}`);

    let baseUrl: string;

    if (IS_LOCAL_MODE) {
      const devServerPort = process.env.WDIO_LOCAL_PORT ?? '5173';
      baseUrl = `http://localhost:${devServerPort}`;
      console.log(`\n[E2E] Using local dev server at ${baseUrl}`);

      // Wait for the dev server to be ready
      console.log(`[E2E] Waiting for dev server to be ready…`);
      let isReady = false;
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds timeout

      while (!isReady && attempts < maxAttempts) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const response = await fetch(baseUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          isReady = response.status < 500; // Any non-500 response means server is up
          if (isReady) {
            console.log(`[E2E] Dev server is ready!`);
          }
        } catch {
          // Server not ready yet
        }

        if (!isReady) {
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!isReady) {
        throw new Error(
          `Dev server at ${baseUrl} did not become ready within ${maxAttempts} seconds. ` +
            `Make sure to run \`npm run dev\` before running local e2e tests. ` +
            `(You can override the port with WDIO_LOCAL_PORT env var if running on a different port.)`,
        );
      }
    } else {
      console.log('\n[E2E] Building Docker image from project root (this may take a few minutes)…');
      const container = await new GenericContainerBuilder(PROJECT_ROOT, 'Dockerfile').build();

      console.log(`[E2E] Starting container…`);
      startedContainer = await container
        .withExposedPorts(3000)
        .withWaitStrategy(
          Wait.forLogMessage(/Server running on http:\/\/localhost:\d+/).withStartupTimeout(
            180_000,
          ),
        )
        .start();

      const host = startedContainer.getHost();
      const port = startedContainer.getMappedPort(3000);
      baseUrl = `http://${host}:${port}`;
      console.log(`[E2E] App is ready at ${baseUrl} — starting tests.`);
    }

    console.log(`[E2E] Tests will run against: ${baseUrl}\n`);

    // Patch baseUrl so all tests use the dynamically assigned port
    _config.baseUrl = baseUrl;
    for (const cap of Array.isArray(capabilities) ? capabilities : [capabilities]) {
      const c = cap as Record<string, unknown>;
      c['wdio:baseUrl'] = baseUrl;
      const opts = (c['goog:chromeOptions'] ?? {}) as Record<string, unknown>;
      const args = (opts['args'] as string[] | undefined) ?? [];
      opts['binary'] = chromeBinaryPath;
      opts['args'] = args;
      c['goog:chromeOptions'] = opts;
    }
  },

  async onComplete() {
    if (startedContainer) {
      console.log('\n[E2E] Stopping container…');
      await startedContainer.stop();
    }
  },
};
