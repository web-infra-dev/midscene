#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// YADB commit that includes pinch/swipe/longPressDrag support (PR #51)
const YADB_COMMIT = 'fd24374daddb190e8fa559b70039a37d63022cb2';
const YADB_RAW_URL = `https://raw.githubusercontent.com/ysbing/YADB/${YADB_COMMIT}/yadb`;

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const doRequest = (requestUrl) => {
      https
        .get(requestUrl, (res) => {
          // Handle redirects
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            doRequest(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${requestUrl}`));
            return;
          }
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', async () => {
            const buffer = Buffer.concat(chunks);
            await fs.writeFile(destPath, buffer);
            await fs.chmod(destPath, 0o755);
            resolve();
          });
          res.on('error', reject);
        })
        .on('error', reject);
    };
    doRequest(url);
  });
}

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

  console.log(
    `[yadb] Downloading yadb (${YADB_COMMIT.slice(0, 8)}) from GitHub...`,
  );

  await fs.mkdir(binDir, { recursive: true });

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await downloadFile(YADB_RAW_URL, yadbPath);
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
