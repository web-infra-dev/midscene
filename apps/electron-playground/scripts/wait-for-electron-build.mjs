import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const requiredFiles = [
  path.join(rootDir, 'dist/main/main.cjs'),
  path.join(rootDir, 'dist/preload/preload.cjs'),
];
const rendererUrl = 'http://127.0.0.1:3210';
const maxWaitMs = 180000;
const pollIntervalMs = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRendererReady = () =>
  new Promise((resolve) => {
    const request = http.get(rendererUrl, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });

const hasInitialBuild = () =>
  requiredFiles.every((file) => fs.existsSync(file));

console.log('Waiting for Electron shell build output...');

const startedAt = Date.now();

while (Date.now() - startedAt < maxWaitMs) {
  if (hasInitialBuild() && (await isRendererReady())) {
    console.log('Electron shell build is ready.');
    process.exit(0);
  }

  await sleep(pollIntervalMs);
}

console.error('Timed out waiting for the Electron shell build to finish.');
process.exit(1);
