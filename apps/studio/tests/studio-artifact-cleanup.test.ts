import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  truncate,
  utimes,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StudioArtifactCleanup } from '../src/main/studio-artifact-cleanup';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-21T12:00:00.000Z').getTime();

describe('StudioArtifactCleanup', () => {
  let studioRunDir: string;
  let cleanup: StudioArtifactCleanup;

  beforeEach(async () => {
    studioRunDir = await mkdtemp(path.join(os.tmpdir(), 'midscene-studio-'));
    cleanup = new StudioArtifactCleanup(studioRunDir, () => NOW);
  });

  afterEach(async () => {
    await rm(studioRunDir, { recursive: true, force: true });
  });

  async function writeAgedFile(relativePath: string, ageInDays: number) {
    const absolutePath = path.join(studioRunDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, 'content', 'utf8');
    const modifiedAt = new Date(NOW - ageInDays * DAY_MS);
    await utimes(absolutePath, modifiedAt, modifiedAt);
    return absolutePath;
  }

  it('cleans expired Studio logs, reports, and dumps by file mtime', async () => {
    const expiredReport = await writeAgedFile('report/old.html', 31);
    const currentReport = await writeAgedFile('report/current.html', 29);
    const expiredDump = await writeAgedFile('dump/2026-07-01/old.png', 8);
    const currentDump = await writeAgedFile('dump/2026-07-14/current.png', 6);
    const expiredLog = await writeAgedFile('log/2026-06-01/playground.log', 8);
    const currentLog = await writeAgedFile('log/2026-07-14/playground.log', 6);

    await cleanup.cleanup();

    await expect(readFile(expiredReport)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(expiredDump)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(expiredLog)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(currentReport, 'utf8')).resolves.toBe('content');
    await expect(readFile(currentDump, 'utf8')).resolves.toBe('content');
    await expect(readFile(currentLog, 'utf8')).resolves.toBe('content');
  });

  it('removes an expired external-assets report as one directory', async () => {
    const report = await writeAgedFile('report/run/index.html', 31);
    const screenshot = await writeAgedFile(
      'report/run/screenshots/shot.png',
      31,
    );

    await cleanup.cleanup();

    await expect(readFile(report)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(screenshot)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('trims output over the size cap from oldest to newest', async () => {
    const oldestScreenshot = await writeAgedFile(
      'output/recorder-screenshots/oldest.png',
      3,
    );
    await truncate(oldestScreenshot, 600 * 1024 * 1024);
    await utimes(
      oldestScreenshot,
      new Date(NOW - 3 * DAY_MS),
      new Date(NOW - 3 * DAY_MS),
    );
    const newerScreenshot = await writeAgedFile(
      'output/recorder-screenshots/newer.png',
      2,
    );
    await truncate(newerScreenshot, 500 * 1024 * 1024);
    await utimes(
      newerScreenshot,
      new Date(NOW - 2 * DAY_MS),
      new Date(NOW - 2 * DAY_MS),
    );
    const expiredOutput = await writeAgedFile('output/recording.json', 8);
    const currentOutput = await writeAgedFile('output/current.json', 0.5);

    await cleanup.cleanup();

    await expect(readFile(oldestScreenshot)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await stat(newerScreenshot)).isFile()).toBe(true);
    await expect(readFile(expiredOutput)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(currentOutput, 'utf8')).resolves.toBe('content');
  });

  it('protects recent screenshots even when the size cap is exceeded', async () => {
    const activeScreenshot = await writeAgedFile(
      'output/recorder-screenshots/active.png',
      0.5,
    );
    await truncate(activeScreenshot, 1025 * 1024 * 1024);
    await utimes(
      activeScreenshot,
      new Date(NOW - 0.5 * DAY_MS),
      new Date(NOW - 0.5 * DAY_MS),
    );

    await cleanup.cleanup();

    expect((await stat(activeScreenshot)).isFile()).toBe(true);
  });
});
