#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDownloadMaxRetries, retryDownload } from './download-retry.mjs';
import { downloadGitHubReleaseAssetWithApiFallback } from './github-release-asset.mjs';
import { createLoggedProxyDispatcher } from './proxy-dispatcher.mjs';

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

export function getScrcpyServerDownloadUrl(version = SCRCPY_VERSION) {
  return `https://github.com/Genymobile/scrcpy/releases/download/${version}/scrcpy-server-${version}`;
}

export async function downloadScrcpyServerReleaseAsset({
  destinationPath,
  fetchImpl = fetch,
  fsApi = fs,
  version = SCRCPY_VERSION,
  dispatcher,
}) {
  await downloadGitHubReleaseAssetWithApiFallback({
    assetName: `scrcpy-server-${version}`,
    destinationPath,
    directUrl: getScrcpyServerDownloadUrl(version),
    dispatcher,
    fetchImpl,
    fsApi,
    owner: 'Genymobile',
    repo: 'scrcpy',
    version,
  });
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

  const maxRetries = getDownloadMaxRetries();
  const downloadedFile = path.join(binDir, `scrcpy-server-${SCRCPY_VERSION}`);
  await fs.rm(downloadedFile, { force: true });
  const dispatcher = createLoggedProxyDispatcher({
    logPrefix: 'scrcpy',
  });

  await retryDownload({
    label: 'scrcpy',
    maxRetries,
    download: async () => {
      await downloadScrcpyServerReleaseAsset({
        destinationPath: downloadedFile,
        dispatcher,
        version: SCRCPY_VERSION,
      });
    },
  });

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
