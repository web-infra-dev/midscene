#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { fetchVersion } = require('gh-release-fetch');

const SCRCPY_VERSION = 'v3.0';

async function main() {
  const args = process.argv.slice(2);
  const targetArgIndex = args.findIndex((arg) => arg.startsWith('--target='));

  let serverBinPath;
  let binDir;

  if (targetArgIndex !== -1) {
    const targetPath = args[targetArgIndex].split('=')[1];
    serverBinPath = path.resolve(process.cwd(), targetPath);
    binDir = path.dirname(serverBinPath);
  } else {
    binDir = path.resolve(__dirname, '../bin');
    serverBinPath = path.resolve(binDir, 'server.bin');
  }

  try {
    await fs.access(serverBinPath);
    console.log('[scrcpy] Server already exists, skipping download');
    return;
  } catch {
    // file does not exist, continue downloading
  }

  try {
    console.log(
      `[scrcpy] Downloading scrcpy server ${SCRCPY_VERSION} from GitHub...`,
    );

    await fs.mkdir(binDir, { recursive: true });

    await fetchVersion({
      repository: 'Genymobile/scrcpy',
      version: SCRCPY_VERSION,
      package: `scrcpy-server-${SCRCPY_VERSION}`,
      destination: binDir,
      extract: false,
    });

    const downloadedFile = path.join(binDir, `scrcpy-server-${SCRCPY_VERSION}`);
    await fs.rename(downloadedFile, serverBinPath);

    console.log('[scrcpy] Server downloaded successfully');
  } catch (error) {
    console.warn('[scrcpy] Warning: Failed to download server');
    console.warn(`[scrcpy] Error: ${error.message}`);
    console.warn('[scrcpy] Scrcpy screenshot will be disabled');
    console.warn(
      '[scrcpy] The package will fallback to standard ADB screenshot mode',
    );
  }
}

main().catch((error) => {
  console.warn('[scrcpy] Unexpected error:', error);
  process.exit(0);
});
