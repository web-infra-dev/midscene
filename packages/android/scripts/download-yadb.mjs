#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchVersion } from 'gh-release-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YADB_VERSION = 'v1.1.0';

async function main() {
  const binDir = path.resolve(__dirname, '../bin');
  const yadbPath = path.resolve(binDir, 'yadb');
  const versionFile = path.resolve(binDir, '.yadb-version');

  // Check if binary exists AND matches the expected version
  try {
    await fs.access(yadbPath);
    const installedVersion = await fs
      .readFile(versionFile, 'utf-8')
      .catch(() => '');
    if (installedVersion.trim() === YADB_VERSION) {
      console.log(
        `[yadb] Binary already exists (${YADB_VERSION}), skipping download`,
      );
      return;
    }
    console.log(
      `[yadb] Version mismatch (installed: ${installedVersion.trim() || 'unknown'}, expected: ${YADB_VERSION}), re-downloading...`,
    );
    await fs.unlink(yadbPath);
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

  // Write version marker for future upgrade detection
  await fs.writeFile(versionFile, YADB_VERSION);

  console.log('[yadb] Downloaded successfully');
}

main().catch((error) => {
  console.error('[yadb] Failed to download:', error.message);
  process.exit(1);
});
