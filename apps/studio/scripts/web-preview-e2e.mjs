import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { buildStudioRuntimeEnv } from './runtime-env.mjs';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const __filename = fileURLToPath(import.meta.url);
const studioRootDir = path.resolve(path.dirname(__filename), '..');
const studioE2EReadyMarker = 'MIDSCENE_STUDIO_E2E_READY';
const successMarker = 'STUDIO_WEB_PREVIEW_E2E_READY';
const cdpPort = Number(process.env.MIDSCENE_STUDIO_CDP_PORT || 9234);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForChildOutput(child, marker, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
      child.off('error', onError);
    };

    const settle = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const onStdout = (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes(marker)) {
        settle(resolve);
      }
    };
    const onStderr = (chunk) => {
      stderr += chunk.toString();
    };
    const onExit = (code, signal) => {
      settle(() => {
        reject(
          new Error(
            `Studio exited before emitting ${marker}. code=${code} signal=${signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
      });
    };
    const onError = (error) => settle(() => reject(error));

    const timeoutId = setTimeout(() => {
      settle(() => {
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for ${marker}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
      });
    }, timeoutMs);

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.on('exit', onExit);
    child.on('error', onError);
  });
}

function forwardChildOutput(child) {
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
  });
}

async function terminateChildProcess(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      if (child.exitCode === null) {
        try {
          process.kill(child.pid, 'SIGKILL');
        } catch {
          /* process already exited */
        }
      }
    }, timeoutMs);

    child.once('exit', () => {
      clearTimeout(timeoutId);
      resolve();
    });

    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      /* process already exited */
    }
  });
}

async function waitFor(condition, { timeoutMs, intervalMs = 250, label }) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await condition();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${label}${
      lastError ? `: ${lastError.message}` : ''
    }`,
  );
}

async function connectStudioRenderer() {
  console.log('Connecting to Studio renderer via CDP...');
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${cdpPort}`,
    defaultViewport: null,
  });

  const page = await waitFor(
    async () => {
      const pages = await browser.pages();
      for (const candidate of pages) {
        const hasStudioRuntime = await candidate.evaluate(() =>
          Boolean(window.studioRuntime),
        );
        if (hasStudioRuntime) {
          console.log(`Connected to Studio renderer: ${candidate.url()}`);
          return candidate;
        }
      }
      return null;
    },
    { timeoutMs: 30_000, label: 'Studio renderer target' },
  );

  await page.waitForFunction(
    () =>
      Boolean(window.studioRuntime) &&
      document.body.innerText.includes('Overview'),
    { timeout: 30_000 },
  );

  return { browser, page };
}

async function createDefaultWebAgent(page) {
  console.log('Creating default Web agent through the Studio UI...');
  await page.waitForSelector('input[value="web"]', { timeout: 30_000 });
  await page.evaluate(() => {
    const webInput = document.querySelector('input[value="web"]');
    if (webInput instanceof HTMLInputElement && !webInput.checked) {
      webInput.click();
    }
  });

  await page.waitForFunction(
    () =>
      document.body.innerText.includes('Open Web Page') &&
      document.body.innerText.includes('Open Page'),
    { timeout: 30_000 },
  );

  await page.click('button.session-setup-submit');
}

async function assertWebPreview(page) {
  console.log('Waiting for Web preview stream...');
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('Web') &&
      document.body.innerText.includes('Live') &&
      document.body.innerText.includes('Disconnect'),
    { timeout: 60_000 },
  );

  await page.waitForFunction(
    () => {
      const stream = document.querySelector('img[alt="Device Live Stream"]');
      return (
        stream instanceof HTMLImageElement &&
        stream.src.includes('/mjpeg') &&
        stream.naturalWidth > 0 &&
        stream.naturalHeight > 0
      );
    },
    { timeout: 30_000 },
  );

  const streamInfo = await page.evaluate(() => {
    const stream = document.querySelector('img[alt="Device Live Stream"]');
    return {
      src: stream?.getAttribute('src') || '',
      width: stream?.naturalWidth || 0,
      height: stream?.naturalHeight || 0,
    };
  });

  if (!streamInfo.src.includes('/mjpeg')) {
    throw new Error(`Expected MJPEG preview src, got ${streamInfo.src}`);
  }
  console.log(
    `Web preview stream ready: ${streamInfo.width}x${streamInfo.height}`,
  );
}

async function assertPromptApiMenu(page) {
  console.log('Checking prompt API menu...');
  await page.waitForSelector('.minimal-action-trigger', { timeout: 20_000 });
  await page.click('.minimal-action-trigger');

  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.ant-dropdown-menu-item')).some(
        (item) => item.textContent?.trim() === 'Action',
      ),
    { timeout: 10_000 },
  );

  const menuLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ant-dropdown-menu-item'))
      .map((item) => item.textContent?.trim())
      .filter(Boolean),
  );

  if (!menuLabels.includes('Action')) {
    throw new Error(`Expected API menu to contain Action, got ${menuLabels}`);
  }
  console.log(`Prompt API menu labels: ${menuLabels.join(', ')}`);
}

async function main() {
  let launchProcess = null;
  let browser = null;

  try {
    launchProcess = spawn(
      electronBinary,
      [path.join(studioRootDir, 'dist/main/main.cjs')],
      {
        cwd: studioRootDir,
        env: buildStudioRuntimeEnv({
          baseEnv: process.env,
          overrides: {
            CI: process.env.CI ?? '1',
            MIDSCENE_STUDIO_CDP_PORT: String(cdpPort),
            MIDSCENE_STUDIO_E2E_TEST: '1',
          },
          studioRootDir,
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    forwardChildOutput(launchProcess);

    console.log('Waiting for Studio Electron readiness marker...');
    await waitForChildOutput(launchProcess, studioE2EReadyMarker, 60_000);

    const connected = await connectStudioRenderer();
    browser = connected.browser;
    const { page } = connected;

    await createDefaultWebAgent(page);
    await assertWebPreview(page);
    await assertPromptApiMenu(page);

    console.log(successMarker);
  } finally {
    if (browser) {
      await browser.disconnect();
    }
    await terminateChildProcess(launchProcess, 10_000);
  }
}

try {
  await main();
} catch (error) {
  console.error('Studio Web preview e2e failed:', error);
  process.exit(1);
}
