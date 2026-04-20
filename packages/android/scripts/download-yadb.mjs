#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLoggedProxyDispatcher } from './proxy-dispatcher.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const __dirname = path.dirname(scriptPath);
export const YADB_VERSION = 'v1.1.1';

export function getYadbDownloadUrl(version = YADB_VERSION) {
  return `https://github.com/ysbing/YADB/releases/download/${version}/yadb`;
}

export async function downloadYadbReleaseAsset({
  destinationPath,
  fetchImpl = fetch,
  fsApi = fs,
  version = YADB_VERSION,
  dispatcher,
}) {
  const response = await fetchImpl(getYadbDownloadUrl(version), {
    ...(dispatcher ? { dispatcher } : {}),
  });

  if (!response.ok) {
    throw new Error(
      `Response code ${response.status} (${response.statusText})`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  await fsApi.writeFile(destinationPath, Buffer.from(arrayBuffer));
}

export async function main() {
  const binDir = path.resolve(__dirname, '../bin');
  const yadbPath = path.resolve(binDir, 'yadb');
  const versionFile = path.resolve(binDir, '.yadb-version');

  // Skip download if binary already exists with the correct version
  try {
    await fs.access(yadbPath);
    const currentVersion = await fs
      .readFile(versionFile, 'utf-8')
      .catch(() => '');
    if (currentVersion.trim() === YADB_VERSION) {
      console.log(
        '[yadb] Binary already exists with correct version, skipping download',
      );
      return;
    }
    console.log(
      `[yadb] Version mismatch (current: ${currentVersion.trim() || 'unknown'}, expected: ${YADB_VERSION}), re-downloading...`,
    );
  } catch {
    // file does not exist, continue downloading
  }

  console.log(`[yadb] Downloading yadb ${YADB_VERSION} from GitHub...`);

  await fs.mkdir(binDir, { recursive: true });

  const maxRetries = 3;
  const dispatcher = createLoggedProxyDispatcher({
    logPrefix: 'yadb',
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await downloadYadbReleaseAsset({
        destinationPath: yadbPath,
        dispatcher,
        version: YADB_VERSION,
      });
      break;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(
        `[yadb] Download attempt ${attempt} failed: ${err.message}, retrying in ${attempt * 2}s...`,
      );
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

  // Write version marker for future upgrade detection
  await fs.writeFile(versionFile, YADB_VERSION);

  console.log('[yadb] Downloaded successfully');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error('[yadb] Failed to download:', error.message);
    process.exit(1);
  });
}
