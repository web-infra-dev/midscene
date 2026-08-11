import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type {
  RecorderArchiveProgress,
  StreamRecorderArchiveRequest,
  StreamRecorderArchiveResult,
} from '@shared/electron-contract';
import archiver from 'archiver';

function assertArchivePath(value: string): string {
  const normalized = path.posix.normalize(value.replace(/\\/g, '/'));
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/')
  ) {
    throw new Error(`Invalid recorder archive path: ${value}`);
  }
  return normalized;
}

function resolveRecorderAssetPath(
  studioRunDir: string,
  assetId: string,
  mimeType: string,
) {
  if (!/^[a-zA-Z0-9_-]+$/.test(assetId)) {
    throw new Error(`Invalid recorder screenshot asset id: ${assetId}`);
  }
  const extension = mimeType.includes('jpeg') ? 'jpg' : 'png';
  const assetRoot = path.resolve(
    studioRunDir,
    'output',
    'recorder-screenshots',
  );
  const assetPath = path.resolve(assetRoot, `${assetId}.${extension}`);
  if (!assetPath.startsWith(`${assetRoot}${path.sep}`)) {
    throw new Error(`Recorder screenshot escaped its asset root: ${assetId}`);
  }
  if (!existsSync(assetPath)) {
    throw new Error(`Recorder screenshot asset is unavailable: ${assetId}`);
  }
  return assetPath;
}

export async function streamStudioRecorderArchive(
  studioRunDir: string,
  request: StreamRecorderArchiveRequest,
  onProgress?: (progress: RecorderArchiveProgress) => void,
): Promise<StreamRecorderArchiveResult> {
  const targetPath = request.path?.trim();
  if (!targetPath) {
    throw new Error('streamRecorderArchive: path is required');
  }
  if (!request.jobId?.trim()) {
    throw new Error('streamRecorderArchive: jobId is required');
  }

  const names = new Set<string>();
  const textEntries = request.textEntries.map((entry) => {
    const archivePath = assertArchivePath(entry.archivePath);
    if (names.has(archivePath)) {
      throw new Error(`Duplicate recorder archive path: ${archivePath}`);
    }
    names.add(archivePath);
    return { ...entry, archivePath };
  });
  const assetEntries = await Promise.all(
    request.assetEntries.map(async (entry) => {
      const archivePath = assertArchivePath(entry.archivePath);
      if (names.has(archivePath)) {
        throw new Error(`Duplicate recorder archive path: ${archivePath}`);
      }
      names.add(archivePath);
      const filePath = resolveRecorderAssetPath(
        studioRunDir,
        entry.assetId,
        entry.mimeType,
      );
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        throw new Error(
          `Recorder screenshot asset is not a file: ${entry.assetId}`,
        );
      }
      return { ...entry, archivePath, filePath, bytes: fileStat.size };
    }),
  );
  const totalBytes =
    textEntries.reduce(
      (total, entry) => total + Buffer.byteLength(entry.content, 'utf-8'),
      0,
    ) + assetEntries.reduce((total, entry) => total + entry.bytes, 0);

  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const output = createWriteStream(temporaryPath, { flags: 'wx' });
  const archive = archiver('zip', { zlib: { level: 9 } });
  const completion = new Promise<number>((resolve, reject) => {
    output.once('close', () => resolve(archive.pointer()));
    output.once('error', reject);
    archive.once('error', reject);
  });
  archive.on('progress', (progress) => {
    onProgress?.({
      jobId: request.jobId,
      processedBytes: Math.min(progress.fs.processedBytes, totalBytes),
      totalBytes,
    });
  });
  try {
    archive.pipe(output);

    for (const entry of textEntries) {
      archive.append(entry.content, { name: entry.archivePath });
    }
    for (const entry of assetEntries) {
      archive.file(entry.filePath, { name: entry.archivePath });
    }

    await archive.finalize();
    const bytesWritten = await completion;
    await rename(temporaryPath, targetPath);
    onProgress?.({
      jobId: request.jobId,
      processedBytes: totalBytes,
      totalBytes,
    });
    return { path: targetPath, bytesWritten };
  } catch (error) {
    archive.abort();
    output.destroy();
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
