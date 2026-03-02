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

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fetchVersion({
        repository: 'ysbing/YADB',
        version: YADB_VERSION,
        package: 'yadb',
        destination: binDir,
        extract: false,
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

  console.log('[yadb] Downloaded successfully');
}

main().catch((error) => {
  console.error('[yadb] Failed to download:', error.message);
  process.exit(1);
});
