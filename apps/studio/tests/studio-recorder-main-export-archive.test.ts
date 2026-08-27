import { readFile, stat } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { writeStudioZipArchive } from '../src/main/recorder/export-archive';
import type { ZipArchiveProgress } from '../src/shared/electron-contract';

const cleanupPaths: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  await Promise.all(
    cleanupPaths
      .splice(0)
      .map((cleanupPath) => rm(cleanupPath, { force: true, recursive: true })),
  );
});

async function createOutputPath() {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'midscene-recorder-export-'),
  );
  cleanupPaths.push(directory);
  return path.join(directory, 'recording.zip');
}

describe('Studio recorder main-process ZIP export', () => {
  it('streams loopback screenshot assets and reports entry progress', async () => {
    const screenshot = Buffer.from('streamed-screenshot');
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        'content-length': screenshot.byteLength,
        'content-type': 'image/png',
      });
      response.end(screenshot);
    });
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not expose a TCP port.');
    }

    const outputPath = await createOutputPath();
    const progress: ZipArchiveProgress[] = [];
    await writeStudioZipArchive(
      {
        entries: [
          { path: 'recording.md', content: '# Recording' },
          {
            path: 'screenshots/event-001.png',
            sourceUrl: `http://127.0.0.1:${address.port}/asset.png`,
          },
        ],
        exportId: 'export-1',
        path: outputPath,
      },
      (update) => progress.push(update),
    );

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    expect(await zip.file('recording.md')?.async('string')).toBe('# Recording');
    expect(
      await zip.file('screenshots/event-001.png')?.async('nodebuffer'),
    ).toEqual(screenshot);
    expect(progress.at(-1)).toMatchObject({
      completedEntries: 2,
      exportId: 'export-1',
      phase: 'completed',
      totalEntries: 2,
    });
    expect(progress.some((update) => update.bytesWritten > 0)).toBe(true);
  });

  it('rejects non-loopback assets and removes the partial archive', async () => {
    const outputPath = await createOutputPath();

    await expect(
      writeStudioZipArchive(
        {
          entries: [
            {
              path: 'screenshots/event-001.png',
              sourceUrl: 'https://example.com/screenshot.png',
            },
          ],
          exportId: 'export-2',
          path: outputPath,
        },
        () => undefined,
      ),
    ).rejects.toThrow('loopback HTTP URL');
    await expect(stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
