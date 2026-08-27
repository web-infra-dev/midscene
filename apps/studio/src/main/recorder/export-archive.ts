import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type {
  WriteZipArchiveEntry,
  WriteZipArchiveRequest,
  ZipArchiveProgress,
} from '@shared/electron-contract';
import archiver from 'archiver';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', '::1', 'localhost']);

function normalizeArchivePath(value: string) {
  const normalized = path.posix.normalize(value.replace(/\\/g, '/'));
  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/')
  ) {
    throw new Error(`Invalid ZIP entry path: ${value}`);
  }
  return normalized.replace(/^\.\//, '');
}

function resolveRecorderAssetUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('Recorder ZIP assets must use a loopback HTTP URL.');
  }
  return url;
}

async function sourceForEntry(entry: WriteZipArchiveEntry) {
  if ('content' in entry) {
    return Buffer.from(entry.content, entry.encoding || 'utf-8');
  }
  const response = await fetch(resolveRecorderAssetUrl(entry.sourceUrl), {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `Recorder screenshot request failed (${response.status}): ${entry.path}`,
    );
  }
  return Readable.fromWeb(response.body as never);
}

export async function writeStudioZipArchive(
  request: WriteZipArchiveRequest,
  onProgress: (progress: ZipArchiveProgress) => void,
) {
  const targetPath = request.path?.trim();
  if (!targetPath) {
    throw new Error('writeZipArchive: path is required');
  }
  if (!request.exportId?.trim()) {
    throw new Error('writeZipArchive: exportId is required');
  }
  if (!Array.isArray(request.entries)) {
    throw new Error('writeZipArchive: entries must be an array');
  }

  const output = createWriteStream(targetPath);
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(output);
  const outputFinished = finished(output);
  const outputError = new Promise<never>((_resolve, reject) => {
    output.once('error', reject);
  });
  const totalEntries = request.entries.length;
  let completedEntries = 0;

  const report = (phase: ZipArchiveProgress['phase'], currentFile?: string) => {
    onProgress({
      bytesWritten: archive.pointer(),
      completedEntries,
      ...(currentFile ? { currentFile } : {}),
      exportId: request.exportId,
      phase,
      totalEntries,
    });
  };

  try {
    report('writing');
    for (const entry of request.entries) {
      const entryPath = normalizeArchivePath(entry.path);
      const source = await sourceForEntry(entry);
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          const handleEntry = (archiveEntry: { name: string }) => {
            if (archiveEntry.name !== entryPath) {
              return;
            }
            cleanup();
            resolve();
          };
          const handleError = (error: Error) => {
            cleanup();
            reject(error);
          };
          const cleanup = () => {
            archive.off('entry', handleEntry);
            archive.off('error', handleError);
          };
          archive.on('entry', handleEntry);
          archive.on('error', handleError);
          archive.append(source, { name: entryPath });
        }),
        outputError,
      ]);
      completedEntries += 1;
      report('writing', entryPath);
    }

    await archive.finalize();
    await outputFinished;
    report('completed');
  } catch (error) {
    archive.abort();
    output.destroy();
    await outputFinished.catch(() => undefined);
    await rm(targetPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
