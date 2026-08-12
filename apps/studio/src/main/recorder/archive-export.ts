import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { getDebug } from '@midscene/shared/logger';
import type {
  RecorderArchiveProgress,
  StreamRecorderArchiveRequest,
  StreamRecorderArchiveResult,
} from '@shared/electron-contract';
import archiver from 'archiver';

const debugRecorderArchive = getDebug('studio:recorder-archive', {
  console: true,
});

function recorderArchiveAbortError() {
  const error = new Error('Recorder archive export was cancelled.');
  error.name = 'AbortError';
  return error;
}

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
  signal?: AbortSignal,
): Promise<StreamRecorderArchiveResult> {
  const targetPath = request.path?.trim();
  if (!targetPath) {
    throw new Error('streamRecorderArchive: path is required');
  }
  if (!request.jobId?.trim()) {
    throw new Error('streamRecorderArchive: jobId is required');
  }
  if (signal?.aborted) {
    throw recorderArchiveAbortError();
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
  const archive = archiver('zip', { zlib: { level: 6 } });
  const startedAt = performance.now();
  const rssStartBytes = process.memoryUsage().rss;
  let rssPeakBytes = rssStartBytes;
  const rssSampler = setInterval(() => {
    rssPeakBytes = Math.max(rssPeakBytes, process.memoryUsage().rss);
  }, 50);
  rssSampler.unref?.();
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  eventLoopDelay.enable();
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
      phase: 'write',
      elapsedMs: performance.now() - startedAt,
    });
  });
  const abortArchive = () => {
    const error = recorderArchiveAbortError();
    archive.abort();
    output.destroy(error);
  };
  signal?.addEventListener('abort', abortArchive, { once: true });
  try {
    debugRecorderArchive('recorder archive write started %o', {
      jobId: request.jobId,
      targetPath,
      textEntryCount: textEntries.length,
      assetEntryCount: assetEntries.length,
      inputBytes: totalBytes,
      rssStartBytes,
    });
    onProgress?.({
      jobId: request.jobId,
      processedBytes: 0,
      totalBytes,
      phase: 'write',
      elapsedMs: 0,
    });
    if (signal?.aborted) {
      throw recorderArchiveAbortError();
    }
    archive.pipe(output);

    for (const entry of textEntries) {
      archive.append(entry.content, { name: entry.archivePath });
    }
    for (const entry of assetEntries) {
      const zipEntry: archiver.ZipEntryData = {
        name: entry.archivePath,
        // JPEG and PNG are already compressed. Deflating them again adds CPU
        // and event-loop pressure without materially reducing the archive.
        store: true,
      };
      archive.file(entry.filePath, zipEntry);
    }

    await archive.finalize();
    const bytesWritten = await completion;
    const writeCompletedAt = performance.now();
    onProgress?.({
      jobId: request.jobId,
      processedBytes: totalBytes,
      totalBytes,
      phase: 'commit',
      elapsedMs: writeCompletedAt - startedAt,
    });
    if (signal?.aborted) {
      throw recorderArchiveAbortError();
    }
    await rename(temporaryPath, targetPath);
    const completedAt = performance.now();
    const rssEndBytes = process.memoryUsage().rss;
    rssPeakBytes = Math.max(rssPeakBytes, rssEndBytes);
    const eventLoopDelayP99Ms = Number.isFinite(eventLoopDelay.percentile(99))
      ? eventLoopDelay.percentile(99) / 1_000_000
      : 0;
    const eventLoopDelayMaxMs = Number.isFinite(eventLoopDelay.max)
      ? eventLoopDelay.max / 1_000_000
      : 0;
    const metrics = {
      inputBytes: totalBytes,
      outputBytes: bytesWritten,
      textEntryCount: textEntries.length,
      assetEntryCount: assetEntries.length,
      writeDurationMs: writeCompletedAt - startedAt,
      commitDurationMs: completedAt - writeCompletedAt,
      totalDurationMs: completedAt - startedAt,
      rssStartBytes,
      rssPeakBytes,
      rssEndBytes,
      eventLoopDelayP99Ms,
      eventLoopDelayMaxMs,
    };
    onProgress?.({
      jobId: request.jobId,
      processedBytes: totalBytes,
      totalBytes,
      phase: 'completed',
      elapsedMs: metrics.totalDurationMs,
    });
    debugRecorderArchive('recorder archive write completed %o', {
      jobId: request.jobId,
      targetPath,
      ...metrics,
    });
    return { path: targetPath, bytesWritten, metrics };
  } catch (error) {
    archive.abort();
    output.destroy();
    await completion.catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    const finalError = signal?.aborted ? recorderArchiveAbortError() : error;
    debugRecorderArchive('recorder archive write failed %o', {
      jobId: request.jobId,
      targetPath,
      elapsedMs: performance.now() - startedAt,
      error:
        finalError instanceof Error ? finalError.message : String(finalError),
    });
    throw finalError;
  } finally {
    signal?.removeEventListener('abort', abortArchive);
    clearInterval(rssSampler);
    eventLoopDelay.disable();
  }
}
