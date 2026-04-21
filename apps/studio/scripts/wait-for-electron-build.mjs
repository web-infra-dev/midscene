import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rendererDevUrl } from './renderer-dev-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const studioRendererDepsReadyFile = path.join(
  rootDir,
  '.studio-dev',
  'renderer-deps.ready',
);
export const defaultRendererDependencyFiles = [studioRendererDepsReadyFile];
export const defaultRequiredFiles = [
  studioRendererDepsReadyFile,
  path.join(rootDir, 'dist/main/main.cjs'),
  path.join(rootDir, 'dist/preload/preload.cjs'),
];

export const defaultRendererUrl = rendererDevUrl;
export const defaultMaxWaitMs = 180000;
export const defaultPollIntervalMs = 500;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const readMtimeMs = (file) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (error) {
    // Missing file is an expected signal ("not built yet"); anything else
    // (permission denied, IO error, ...) should surface instead of being
    // silently swallowed into a stale-build state.
    if (error && error.code === 'ENOENT') return null;
    throw new Error(
      `wait-for-electron-build: failed to stat ${file}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
};

/**
 * Build a "has this dev cycle produced a fresh build?" checker.
 *
 * The checker snapshots each required file's mtime at creation time, then
 * on every call it returns true only when every file exists AND either was
 * absent in the snapshot or now has a strictly newer mtime. This avoids
 * treating stale dist artifacts from a previous `pnpm dev` run as "fresh".
 */
export const createFreshBuildChecker = (files, readMtime = readMtimeMs) => {
  const initialMtimes = new Map(files.map((file) => [file, readMtime(file)]));

  return () =>
    files.every((file) => {
      const current = readMtime(file);
      if (current === null) {
        return false;
      }

      const initial = initialMtimes.get(file);
      return initial === null || current > initial;
    });
};

export const checkRendererReady = (url) =>
  new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });

export const waitForRendererDeps = async ({
  requiredFiles = defaultRendererDependencyFiles,
  maxWaitMs = defaultMaxWaitMs,
  pollIntervalMs = defaultPollIntervalMs,
  readMtime = readMtimeMs,
  now = () => Date.now(),
  delay = sleep,
} = {}) => {
  const hasFreshReadySignal = createFreshBuildChecker(requiredFiles, readMtime);
  const startedAt = now();

  while (now() - startedAt < maxWaitMs) {
    if (hasFreshReadySignal()) {
      return true;
    }

    await delay(pollIntervalMs);
  }

  return false;
};

/**
 * Poll until the required build outputs are fresh AND the renderer dev
 * server is serving a 200, or until `maxWaitMs` elapses. Dependencies are
 * injectable so the loop can be unit-tested with a virtual clock.
 */
export const waitForBuild = async ({
  requiredFiles = defaultRequiredFiles,
  rendererUrl = defaultRendererUrl,
  maxWaitMs = defaultMaxWaitMs,
  pollIntervalMs = defaultPollIntervalMs,
  readMtime = readMtimeMs,
  isRendererReady = () => checkRendererReady(rendererUrl),
  now = () => Date.now(),
  delay = sleep,
} = {}) => {
  const hasFreshBuild = createFreshBuildChecker(requiredFiles, readMtime);
  const startedAt = now();

  while (now() - startedAt < maxWaitMs) {
    if (hasFreshBuild() && (await isRendererReady())) {
      return true;
    }

    await delay(pollIntervalMs);
  }

  return false;
};

const isDirectInvocation =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) {
  const mode = process.argv[2] ?? 'shell-build';

  if (mode === 'renderer-deps') {
    console.log('Waiting for Midscene Studio renderer dependencies...');

    const ready = await waitForRendererDeps();

    if (ready) {
      console.log('Midscene Studio renderer dependencies are ready.');
      process.exit(0);
    }

    console.error(
      'Timed out waiting for the Midscene Studio renderer dependencies to finish building.',
    );
    process.exit(1);
  }

  console.log('Waiting for Midscene Studio shell build output...');

  const ready = await waitForBuild();

  if (ready) {
    console.log('Midscene Studio shell build is ready.');
    process.exit(0);
  }

  console.error(
    'Timed out waiting for the Midscene Studio shell build to finish.',
  );
  process.exit(1);
}
