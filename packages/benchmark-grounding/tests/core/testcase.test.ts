import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from '@rstest/core';
import { loadTestcases, validateLoadedTestcase } from '../../src/core/testcase';
import { fixture, rewriteJson, writeFixture } from '../fixture';

const temporary: string[] = [];
const root = async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'benchmark-grounding-testcases-'),
  );
  temporary.push(directory);
  return directory;
};
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadTestcases', () => {
  it('loads all 200 built-in cases, sorted with original file bytes', async () => {
    const records = await loadTestcases();
    expect(records).toHaveLength(200);
    expect(records.map((record) => record.testcase.name)).toEqual(
      records.map((record) => record.testcase.name).sort(),
    );
    expect(records[0].files['index.json']).toEqual(
      await readFile(
        new URL(
          `../testcases/${records[0].testcase.name}/index.json`,
          import.meta.url,
        ),
      ),
    );
  });

  it('loads exact names only and ignores invalid unselected cases and root files', async () => {
    const directory = await root();
    await Promise.all([
      writeFixture(directory, fixture('b')),
      writeFixture(directory, fixture('A')),
      writeFixture(directory, fixture('bad')),
    ]);
    await writeFile(path.join(directory, 'bad', 'index.json'), '{broken');
    await writeFile(path.join(directory, 'ignored.txt'), 'ignored');
    expect(
      (await loadTestcases({ directory, names: ['b', 'A'] })).map(
        (record) => record.testcase.name,
      ),
    ).toEqual(['A', 'b']);
    await expect(loadTestcases({ directory })).rejects.toThrow();
    await expect(loadTestcases({ directory, names: ['*'] })).rejects.toThrow(
      'does not exist',
    );
  });

  it('rejects missing directories, empty selections, unknown and duplicate names', async () => {
    const directory = await root();
    await expect(loadTestcases({ directory })).rejects.toThrow('empty');
    await writeFixture(directory, fixture());
    await expect(
      loadTestcases({ directory: path.join(directory, 'missing') }),
    ).rejects.toThrow();
    await expect(loadTestcases({ directory, names: [] })).rejects.toThrow(
      'empty',
    );
    await expect(
      loadTestcases({ directory, names: ['missing'] }),
    ).rejects.toThrow('does not exist');
    await expect(
      loadTestcases({ directory, names: ['case-a', 'case-a'] }),
    ).rejects.toThrow('Duplicate');
  });

  it('rejects unknown versions and mismatched directory names', async () => {
    const directory = await root();
    const record = fixture();
    rewriteJson(record, { ...record.testcase, schemaVersion: 2 });
    await writeFixture(directory, record);
    await expect(loadTestcases({ directory })).rejects.toThrow();
    rewriteJson(record, { ...record.testcase, name: 'other' });
    await writeFixture(directory, record);
    await expect(loadTestcases({ directory })).rejects.toThrow(
      'does not match directory',
    );
  });

  it('validates byte hashes, image formats and bounds even for refusals', async () => {
    const changedJson = fixture();
    changedJson.files['index.json'] = Buffer.concat([
      changedJson.files['index.json'],
      Buffer.from(' '),
    ]);
    await expect(validateLoadedTestcase(changedJson)).rejects.toThrow(
      'SHA-256 mismatch',
    );
    const changedImage = fixture();
    changedImage.files['image.png'][20] ^= 1;
    await expect(validateLoadedTestcase(changedImage)).rejects.toThrow(
      'image SHA-256 mismatch',
    );
    for (const groundTruth of [
      [1, 1, 0, 0],
      [0, 2, 1, 0],
      [0, 1, 1, 1],
    ] as [number, number, number, number][]) {
      await expect(
        validateLoadedTestcase(fixture('bad-gt', { groundTruth })),
      ).rejects.toThrow('groundTruth');
    }
    const refusal = fixture('refusal', { groundTruth: 'REFUSAL' });
    refusal.files = {
      'index.json': refusal.files['index.json'],
      'index.sha256': refusal.files['index.sha256'],
    };
    await expect(validateLoadedTestcase(refusal)).rejects.toThrow(
      'missing image.png',
    );
  });

  it('rejects corrupt image headers even when hashes are valid', async () => {
    const record = fixture();
    const image = record.files['image.png'];
    image.write('JUNK', 12, 'ascii');
    record.testcase.reference.image.sha256 = createHash('sha256')
      .update(image)
      .digest('hex');
    rewriteJson(record);
    await expect(validateLoadedTestcase(record)).rejects.toThrow();
  });

  it('rejects malformed SHA and missing source files without returning partial success', async () => {
    const directory = await root();
    const record = fixture();
    await writeFixture(directory, record);
    await writeFile(
      path.join(directory, record.testcase.name, 'index.sha256'),
      `${record.testcaseSha256.toUpperCase()}\n`,
    );
    await expect(loadTestcases({ directory })).rejects.toThrow();
    await writeFixture(directory, record);
    await rm(path.join(directory, record.testcase.name, 'image.png'));
    await expect(loadTestcases({ directory })).rejects.toThrow();
  });

  it('reports every selected case and aggregates file, data and missing-directory failures', async () => {
    const directory = await root();
    const names = [
      'valid',
      'unknown',
      'missing-sha',
      'missing-json',
      'missing-image',
      'bad-sha',
      'bad-schema',
      'bad-json',
    ];
    await Promise.all(
      names
        .filter((name) => name !== 'unknown')
        .map((name) => writeFixture(directory, fixture(name))),
    );
    await Promise.all([
      rm(path.join(directory, 'missing-sha', 'index.sha256')),
      rm(path.join(directory, 'missing-json', 'index.json')),
      rm(path.join(directory, 'missing-image', 'image.png')),
      writeFile(path.join(directory, 'bad-sha', 'index.sha256'), 'invalid'),
      writeFile(path.join(directory, 'bad-json', 'index.json'), '{broken'),
      writeFile(
        path.join(directory, 'bad-schema', 'index.json'),
        JSON.stringify({
          ...fixture('bad-schema').testcase,
          platform: 'desktop',
        }),
      ),
    ]);
    const progress: {
      name: string;
      error?: Error;
      testcaseSha256?: string;
    }[] = [];
    const error = await loadTestcases({
      directory,
      names,
      onProgress: (result) => progress.push(result),
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(AggregateError);
    const failure = error as AggregateError;
    const errors = failure.errors as Error[];
    expect(errors.map((item) => item.message.split(':')[0])).toEqual(
      names.filter((name) => name !== 'valid').sort(),
    );
    expect(progress.map((item) => item.name)).toEqual([...names].sort());
    expect(progress.filter((item) => item.error)).toHaveLength(7);
    expect(progress.find((item) => item.name === 'valid')).toEqual({
      name: 'valid',
      testcaseSha256: fixture('valid').testcaseSha256,
    });
    for (const item of progress.filter((item) => item.error))
      expect(item).not.toHaveProperty('testcaseSha256');
    for (const [name, filename] of [
      ['missing-sha', 'index.sha256'],
      ['missing-json', 'index.json'],
      ['missing-image', 'image.png'],
    ]) {
      expect(failure.message).toContain(
        `${name}: Missing required file "${filename}"`,
      );
    }
    expect(failure.message).toContain('1 passed, 7 failed (8 total)');
    expect(failure.message).toContain(
      'bad-json: index.json contains invalid JSON',
    );
    expect(failure.message).toContain('bad-schema: platform:');
    expect(failure.message).toContain('bad-sha: index.sha256:');
    expect(failure.message).toContain(
      'unknown: Testcase directory does not exist',
    );
    expect(failure.message).not.toContain('ENOENT');
  });

  it('reports successful checks without changing sorted results or requiring a callback', async () => {
    const directory = await root();
    await Promise.all([
      writeFixture(directory, fixture('case-b')),
      writeFixture(directory, fixture('case-a')),
    ]);
    const progress: {
      name: string;
      error?: Error;
      testcaseSha256?: string;
    }[] = [];
    const records = await loadTestcases({
      directory,
      names: ['case-b', 'case-a'],
      onProgress: (result) => progress.push(result),
    });

    expect(records.map((record) => record.testcase.name)).toEqual([
      'case-a',
      'case-b',
    ]);
    expect(progress).toEqual(
      records.map((record) => ({
        name: record.testcase.name,
        testcaseSha256: createHash('sha256')
          .update(record.files['index.json'])
          .digest('hex'),
      })),
    );
    expect(await loadTestcases({ directory })).toEqual(records);
  });
});
