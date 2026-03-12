import { promises as fs } from 'node:fs';

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
