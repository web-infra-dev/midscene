#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchVersion } from 'gh-release-fetch';

const scriptPath = fileURLToPath(import.meta.url);
const __dirname = path.dirname(scriptPath);

export const SCRCPY_PROTOCOL_VERSION = '3.3.3';
export const SCRCPY_SERVER_VERSION_TAG = `v${SCRCPY_PROTOCOL_VERSION}`;
export const SCRCPY_SERVER_VERSION_FILENAME = 'scrcpy-server.version';

const SCRCPY_VERSION = SCRCPY_SERVER_VERSION_TAG;

export function shouldDownloadScrcpyServer(
  existingVersion,
  expectedVersion = SCRCPY_SERVER_VERSION_TAG,
) {
  return existingVersion?.trim() !== expectedVersion;
}

export async function installDownloadedScrcpyServer({
  fsApi = fs,
  serverBinPath,
  downloadedFile,
}) {
  const backupFilePath = `${serverBinPath}.bak`;
  let serverExists = false;

  try {
    await fsApi.access(serverBinPath);
    serverExists = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    await fsApi.rm(backupFilePath, { force: true });
  } catch {}

  if (serverExists) {
    await fsApi.rename(serverBinPath, backupFilePath);
  }

  try {
    await fsApi.rename(downloadedFile, serverBinPath);
    if (serverExists) {
      await fsApi.rm(backupFilePath, { force: true });
    }
  } catch (error) {
    if (serverExists) {
      try {
        await fsApi.rm(serverBinPath, { force: true });
        await fsApi.rename(backupFilePath, serverBinPath);
      } catch {}
    }
    throw error;
  }
}

export async function main() {
  const args = process.argv.slice(2);
  const targetArgIndex = args.findIndex((arg) => arg.startsWith('--target='));

  let serverBinPath;
  let binDir;
  let versionFilePath;

  if (targetArgIndex !== -1) {
    const targetPath = args[targetArgIndex].split('=')[1];
    serverBinPath = path.resolve(process.cwd(), targetPath);
    binDir = path.dirname(serverBinPath);
    versionFilePath = path.join(binDir, SCRCPY_SERVER_VERSION_FILENAME);
  } else {
    binDir = path.resolve(__dirname, '../bin');
    serverBinPath = path.resolve(binDir, 'scrcpy-server');
    versionFilePath = path.join(binDir, SCRCPY_SERVER_VERSION_FILENAME);
  }

  let serverExists = false;
  try {
    await fs.access(serverBinPath);
    serverExists = true;
  } catch {
    serverExists = false;
  }

  let existingVersion = null;
  try {
    existingVersion = await fs.readFile(versionFilePath, 'utf8');
  } catch {
    existingVersion = null;
  }

  if (
    serverExists &&
    !shouldDownloadScrcpyServer(existingVersion, SCRCPY_VERSION)
  ) {
    console.log(
      `[scrcpy] Server ${SCRCPY_VERSION} already exists, skipping download`,
    );
    return;
  }

  if (serverExists) {
    console.log(
      `[scrcpy] Existing server version ${existingVersion?.trim() || 'unknown'} does not match ${SCRCPY_VERSION}, refreshing download`,
    );
  }

  console.log(
    `[scrcpy] Downloading scrcpy server ${SCRCPY_VERSION} from GitHub...`,
  );

  await fs.mkdir(binDir, { recursive: true });

  const maxRetries = 3;
  const downloadedFile = path.join(binDir, `scrcpy-server-${SCRCPY_VERSION}`);
  await fs.rm(downloadedFile, { force: true });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fetchVersion({
        repository: 'Genymobile/scrcpy',
        version: SCRCPY_VERSION,
        package: `scrcpy-server-${SCRCPY_VERSION}`,
        destination: binDir,
        extract: false,
      });
      break;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(
        `[scrcpy] Download attempt ${attempt} failed: ${err.message}, retrying in ${attempt * 2}s...`,
      );
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

  await installDownloadedScrcpyServer({
    serverBinPath,
    downloadedFile,
  });
  await fs.writeFile(versionFilePath, `${SCRCPY_VERSION}\n`);

  console.log('[scrcpy] Server downloaded successfully');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error('[scrcpy] Failed to download server:', error.message);
    process.exit(1);
  });
}
