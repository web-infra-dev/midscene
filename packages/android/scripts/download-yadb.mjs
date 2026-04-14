#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchVersion } from 'gh-release-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YADB_VERSION = 'v1.1.1';
const PROXY_URL =
  process.env.HTTPS_PROXY_URL ||
  process.env.HTTP_PROXY_URL ||
  process.env.https_proxy_url ||
  process.env.http_proxy_url;

function createProxyAgent() {
  if (!PROXY_URL) {
    return undefined;
  }

  console.log(
    `[yadb] Using proxy: ${PROXY_URL.replace(/\/\/.*@/, '//***:***@')}`,
  );
  return new HttpsProxyAgent(PROXY_URL);
}

async function main() {
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
  const agent = createProxyAgent();
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fetchVersion(
        {
          repository: 'ysbing/YADB',
          version: YADB_VERSION,
          package: 'yadb',
          destination: binDir,
          extract: false,
        },
        { agent },
      );
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
