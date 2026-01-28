#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchVersion } from 'gh-release-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YADB_VERSION = 'v1.0.0';

async function main() {
  const binDir = path.resolve(__dirname, '../bin');
  const yadbPath = path.resolve(binDir, 'yadb');

  try {
    await fs.access(yadbPath);
    console.log('[yadb] Binary already exists, skipping download');
    return;
  } catch {
    // file does not exist, continue downloading
  }

  console.log(`[yadb] Downloading yadb ${YADB_VERSION} from GitHub...`);

  await fs.mkdir(binDir, { recursive: true });

  await fetchVersion({
    repository: 'ysbing/YADB',
    version: YADB_VERSION,
    package: 'yadb',
    destination: binDir,
    extract: false,
  });

  console.log('[yadb] Downloaded successfully');
}

main().catch((error) => {
  console.error('[yadb] Failed to download:', error.message);
  process.exit(1);
});
