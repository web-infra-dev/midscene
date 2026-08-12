import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamStudioRecorderArchive } from '../src/main/recorder/archive-export';

function findZipCompressionMethod(bytes: Uint8Array, archivePath: string) {
  const nameBytes = new TextEncoder().encode(archivePath);
  const nameIndex = bytes.findIndex((_, index) =>
    nameBytes.every((value, offset) => bytes[index + offset] === value),
  );
  if (nameIndex < 30) {
    throw new Error(`ZIP entry was not found: ${archivePath}`);
  }
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint16(nameIndex - 22, true);
}

describe('streamStudioRecorderArchive', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('streams text and screenshot files into a ZIP without base64 IPC data', async () => {
    const runDir = await mkdtemp(
      path.join(tmpdir(), 'midscene-recorder-archive-'),
    );
    temporaryDirectories.push(runDir);
    const assetDir = path.join(runDir, 'output', 'recorder-screenshots');
    await mkdir(assetDir, { recursive: true });
    const screenshot = Buffer.from('png screenshot bytes');
    await writeFile(path.join(assetDir, 'asset-1.png'), screenshot);
    const targetPath = path.join(runDir, 'export.zip');
    const onProgress = vi.fn();

    const result = await streamStudioRecorderArchive(
      runDir,
      {
        jobId: 'archive-job-1',
        path: targetPath,
        textEntries: [{ archivePath: 'recording.md', content: '# Recording' }],
        assetEntries: [
          {
            archivePath: 'screenshots/event-001-click.png',
            assetId: 'asset-1',
            mimeType: 'image/png',
            bytes: screenshot.byteLength,
          },
        ],
      },
      onProgress,
    );

    expect(result.path).toBe(targetPath);
    expect(result.bytesWritten).toBeGreaterThan(0);
    expect(result.metrics).toMatchObject({
      inputBytes: Buffer.byteLength('# Recording') + screenshot.byteLength,
      outputBytes: result.bytesWritten,
      textEntryCount: 1,
      assetEntryCount: 1,
    });
    const archiveBytes = await readFile(targetPath);
    const zip = await JSZip.loadAsync(archiveBytes);
    await expect(zip.file('recording.md')?.async('string')).resolves.toBe(
      '# Recording',
    );
    await expect(
      zip.file('screenshots/event-001-click.png')?.async('nodebuffer'),
    ).resolves.toEqual(screenshot);
    expect(
      findZipCompressionMethod(archiveBytes, 'screenshots/event-001-click.png'),
    ).toBe(0);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        jobId: 'archive-job-1',
        phase: 'completed',
        processedBytes:
          Buffer.byteLength('# Recording') + screenshot.byteLength,
        totalBytes: Buffer.byteLength('# Recording') + screenshot.byteLength,
        elapsedMs: expect.any(Number),
      }),
    );
  });

  it('rejects archive traversal paths before opening the target', async () => {
    const runDir = await mkdtemp(
      path.join(tmpdir(), 'midscene-recorder-archive-'),
    );
    temporaryDirectories.push(runDir);

    await expect(
      streamStudioRecorderArchive(runDir, {
        jobId: 'archive-job-2',
        path: path.join(runDir, 'invalid.zip'),
        textEntries: [{ archivePath: '../escape.txt', content: 'nope' }],
        assetEntries: [],
      }),
    ).rejects.toThrow('Invalid recorder archive path');
  });

  it('removes the temporary ZIP and preserves the target on commit failure', async () => {
    const runDir = await mkdtemp(
      path.join(tmpdir(), 'midscene-recorder-archive-'),
    );
    temporaryDirectories.push(runDir);
    const targetPath = path.join(runDir, 'existing-target');
    await mkdir(targetPath);

    await expect(
      streamStudioRecorderArchive(runDir, {
        jobId: 'archive-job-3',
        path: targetPath,
        textEntries: [{ archivePath: 'recording.md', content: '# Recording' }],
        assetEntries: [],
      }),
    ).rejects.toThrow();

    expect(await readdir(targetPath)).toEqual([]);
    expect(
      (await readdir(runDir)).filter((name) => name.endsWith('.tmp')),
    ).toEqual([]);
  });

  it('cancels an active archive and removes its temporary file', async () => {
    const runDir = await mkdtemp(
      path.join(tmpdir(), 'midscene-recorder-archive-'),
    );
    temporaryDirectories.push(runDir);
    const targetPath = path.join(runDir, 'cancelled.zip');
    const controller = new AbortController();

    await expect(
      streamStudioRecorderArchive(
        runDir,
        {
          jobId: 'archive-job-cancel',
          path: targetPath,
          textEntries: [
            { archivePath: 'recording.md', content: '# Recording' },
          ],
          assetEntries: [],
        },
        (progress) => {
          if (progress.phase === 'write' && progress.processedBytes === 0) {
            controller.abort();
          }
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });

    const remaining = await readdir(runDir);
    expect(remaining).not.toContain('cancelled.zip');
    expect(remaining.filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
