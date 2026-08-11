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
    const zip = await JSZip.loadAsync(await readFile(targetPath));
    await expect(zip.file('recording.md')?.async('string')).resolves.toBe(
      '# Recording',
    );
    await expect(
      zip.file('screenshots/event-001-click.png')?.async('nodebuffer'),
    ).resolves.toEqual(screenshot);
    expect(onProgress).toHaveBeenLastCalledWith({
      jobId: 'archive-job-1',
      processedBytes: Buffer.byteLength('# Recording') + screenshot.byteLength,
      totalBytes: Buffer.byteLength('# Recording') + screenshot.byteLength,
    });
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
});
