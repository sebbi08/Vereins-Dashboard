import type { Options } from '@wdio/types';
import { execSync } from 'child_process';
import http from 'http';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const IMAGE_NAME = 'mv-dashboard-e2e-test';
const CONTAINER_NAME = 'mv-dashboard-e2e-container';
const E2E_PORT = 3099;

function waitForHealth(url: string, timeoutMs = 90_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function poll() {
      if (Date.now() > deadline) {
        reject(new Error(`Health check timed out after ${timeoutMs}ms: ${url}`));
        return;
      }
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            setTimeout(poll, 1000);
          }
        })
        .on('error', () => setTimeout(poll, 1000));
    }

    poll();
  });
}

export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./tests/**/*.spec.ts'],
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      },
    },
  ],

  logLevel: 'error',
  baseUrl: `http://localhost:${E2E_PORT}`,
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,

  services: [
    [
      'chromedriver',
      {
        port: 9515,
        args: ['--silent'],
      },
    ],
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },

  async onPrepare() {
    console.log('\n[E2E] Building Docker image (this may take a few minutes)…');
    execSync(`docker build -t ${IMAGE_NAME} ${PROJECT_ROOT}`, { stdio: 'inherit' });

    // Clean up any leftover container from a previous run
    try {
      execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'pipe' });
    } catch {}
    try {
      execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'pipe' });
    } catch {}

    console.log(`[E2E] Starting container on port ${E2E_PORT}…`);
    execSync(`docker run -d --name ${CONTAINER_NAME} -p ${E2E_PORT}:3000 ${IMAGE_NAME}`, {
      stdio: 'inherit',
    });

    const healthUrl = `http://localhost:${E2E_PORT}/api/health`;
    console.log(`[E2E] Waiting for app to be ready at ${healthUrl}…`);
    await waitForHealth(healthUrl);
    console.log('[E2E] App is ready — starting tests.\n');
  },

  async onComplete() {
    console.log('\n[E2E] Stopping Docker container…');
    try {
      execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'pipe' });
    } catch {}
    try {
      execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'pipe' });
    } catch {}
  },
};
