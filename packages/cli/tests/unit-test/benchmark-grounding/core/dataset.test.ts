import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { version } from '../../../../package.json';
import { fixture, writeFixture } from '../fixture';

const mocks = rs.hoisted(() => ({
  cache: '',
  extract: rs.fn(),
}));
rs.mock('env-paths', () => ({ default: () => ({ cache: mocks.cache }) }));
rs.mock('pacote', () => ({ default: { extract: mocks.extract } }));

const temporary: string[] = [];
beforeEach(async () => {
  rs.resetModules();
  rs.resetAllMocks();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'grounding-dataset-'));
  temporary.push(directory);
  mocks.cache = path.join(directory, 'cache');
  mocks.extract.mockImplementation(async (_name, target) =>
    writeDataset(target),
  );
});
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function writeDataset(directory: string, datasetVersion = version) {
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: '@midscene/benchmark-grounding',
        version: datasetVersion,
      }),
    ),
    writeFixture(path.join(directory, 'testcases'), fixture()),
  ]);
}

describe('dataset resolution', () => {
  it('extracts to a temporary directory and reuses the complete cache across module reloads', async () => {
    const { resolveDatasetDirectory } = await import(
      '@/benchmark-grounding/core/dataset'
    );
    const status: string[] = [];
    const testcases = await resolveDatasetDirectory((message) =>
      status.push(message),
    );
    const directory = path.join(mocks.cache, 'benchmark-grounding', version);

    expect(testcases).toBe(path.join(directory, 'testcases'));
    expect(status[0]).toMatch(/download/i);
    expect(status[0]).toContain(`@midscene/benchmark-grounding@${version}`);
    expect(status.at(-1)).toMatch(/downloaded/i);
    expect(mocks.extract.mock.calls[0][0]).toBe(
      `@midscene/benchmark-grounding@${version}`,
    );
    expect(mocks.extract.mock.calls[0][1]).not.toBe(directory);
    expect(await readdir(path.dirname(directory))).toEqual([version]);
    expect(
      JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')),
    ).toEqual({
      name: '@midscene/benchmark-grounding',
      version,
    });
    rs.resetModules();
    const cached = await import('@/benchmark-grounding/core/dataset');
    const cachedStatus: string[] = [];
    expect(
      await cached.resolveDatasetDirectory((message) =>
        cachedStatus.push(message),
      ),
    ).toBe(testcases);
    expect(cachedStatus.join(' ')).toMatch(/cached/i);
    expect(mocks.extract).toHaveBeenCalledTimes(1);
  });

  it('shares one download across concurrent callers and exposes only the completed dataset', async () => {
    const { resolveDatasetDirectory } = await import(
      '@/benchmark-grounding/core/dataset'
    );
    const directories = await Promise.all(
      Array.from({ length: 8 }, () => resolveDatasetDirectory()),
    );

    expect(new Set(directories).size).toBe(1);
    expect(mocks.extract).toHaveBeenCalledTimes(1);
    expect(await readdir(path.dirname(path.dirname(directories[0])))).toEqual([
      version,
    ]);
  });

  it('handles independent resolvers racing to publish the same cache without leaving staging files', async () => {
    const first = await import('@/benchmark-grounding/core/dataset');
    rs.resetModules();
    const second = await import('@/benchmark-grounding/core/dataset');
    const completed: (() => void)[] = [];
    mocks.extract.mockImplementation(async (_name, target) => {
      await writeDataset(target);
      await new Promise<void>((resolve) => {
        completed.push(resolve);
        if (completed.length === 2) for (const release of completed) release();
      });
    });

    const paths = await Promise.all([
      first.resolveDatasetDirectory(),
      second.resolveDatasetDirectory(),
    ]);
    const directory = path.join(mocks.cache, 'benchmark-grounding', version);
    expect(paths).toEqual([
      path.join(directory, 'testcases'),
      path.join(directory, 'testcases'),
    ]);
    expect(mocks.extract).toHaveBeenCalledTimes(2);
    expect(mocks.extract.mock.calls[0][1]).not.toBe(
      mocks.extract.mock.calls[1][1],
    );
    expect(await readdir(path.dirname(directory))).toEqual([version]);
    expect(
      await readFile(path.join(directory, 'testcases', 'case-a', 'index.json')),
    ).toEqual(fixture().files['index.json']);
  });

  it('cleans failed extraction files and permits a later retry', async () => {
    mocks.extract.mockImplementationOnce(async (_name, target) => {
      await writeFile(path.join(target, 'partial.json'), 'unfinished');
      throw new Error('Download interrupted');
    });
    const { resolveDatasetDirectory } = await import(
      '@/benchmark-grounding/core/dataset'
    );

    await expect(resolveDatasetDirectory()).rejects.toThrow(
      /Cannot download dataset/,
    );
    expect(
      await readdir(path.join(mocks.cache, 'benchmark-grounding')),
    ).toEqual([]);
    expect(await resolveDatasetDirectory()).toBe(
      path.join(mocks.cache, 'benchmark-grounding', version, 'testcases'),
    );
    expect(mocks.extract).toHaveBeenCalledTimes(2);
  });

  it('rejects an extracted package with the wrong identity before promoting it into the cache', async () => {
    mocks.extract.mockImplementationOnce(async (_name, target) => {
      await writeDataset(target, '0.0.0');
    });
    const { resolveDatasetDirectory } = await import(
      '@/benchmark-grounding/core/dataset'
    );

    await expect(resolveDatasetDirectory()).rejects.toThrow(
      /Cannot download dataset/,
    );
    expect(
      await readdir(path.join(mocks.cache, 'benchmark-grounding')),
    ).toEqual([]);
    expect(await resolveDatasetDirectory()).toContain(version);
    expect(mocks.extract).toHaveBeenCalledTimes(2);
  });

  it('loads a custom testcase directory without resolving or downloading the default dataset', async () => {
    const directory = path.join(mocks.cache, 'custom');
    await writeFixture(directory, fixture());
    const { loadTestcases } = await import(
      '@/benchmark-grounding/core/testcase'
    );

    expect(await loadTestcases({ directory })).toHaveLength(1);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
});
