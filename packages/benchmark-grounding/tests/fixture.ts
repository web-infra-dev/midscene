import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LoadedTestcase, Testcase } from '../src/schemas';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export function fixture(
  name = 'case-a',
  override: Partial<Testcase> = {},
): LoadedTestcase {
  const testcase: Testcase = {
    schemaVersion: 1,
    name,
    platform: 'web',
    category: { item: 'Basic Element', reason: 'A fixture' },
    instruction: { en: 'Locate the target', zh: '定位目标' },
    instructionLanguage: 'en',
    groundTruth: [0, 1, 1, 0],
    reference: {
      url: 'https://example.com/source',
      dataset: 'fixture',
      recordId: name,
      image: { format: 'png', sha256: sha(png) },
      patch: null,
      collectedAt: 1,
    },
    ...override,
  };
  const json = Buffer.from(`${JSON.stringify(testcase, null, 2)}\n`);
  const testcaseSha256 = sha(json);
  return {
    testcase,
    testcaseSha256,
    files: {
      'index.json': json,
      'index.sha256': Buffer.from(`${testcaseSha256}\n`),
      'image.png': Buffer.from(png),
    },
  };
}

export function rewriteJson(
  record: LoadedTestcase,
  value: unknown = record.testcase,
) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  record.files['index.json'] = bytes;
  record.testcaseSha256 = sha(bytes);
  record.files['index.sha256'] = Buffer.from(`${record.testcaseSha256}\n`);
}

export async function writeFixture(directory: string, record: LoadedTestcase) {
  const target = path.join(directory, record.testcase.name);
  await mkdir(target, { recursive: true });
  await Promise.all(
    Object.entries(record.files).map(([filename, bytes]) =>
      writeFile(path.join(target, filename), bytes),
    ),
  );
}
