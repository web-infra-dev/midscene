import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { studioRendererDepsReadyFile } from './studio-dev-deps.mjs';
import {
  defaultMaxWaitMs,
  defaultPollIntervalMs,
  readMtimeMs,
  sleep,
} from './wait-for-electron-build.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const defaultRendererDependencyFiles = [studioRendererDepsReadyFile];

export const waitForRendererDeps = async ({
  requiredFiles = defaultRendererDependencyFiles,
  maxWaitMs = defaultMaxWaitMs,
  pollIntervalMs = defaultPollIntervalMs,
  readMtime = readMtimeMs,
  now = () => Date.now(),
  delay = sleep,
} = {}) => {
  const startedAt = now();

  while (now() - startedAt < maxWaitMs) {
    if (requiredFiles.every((file) => readMtime(file) !== null)) {
      return true;
    }

    await delay(pollIntervalMs);
  }

  return false;
};

const isDirectInvocation =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) {
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
