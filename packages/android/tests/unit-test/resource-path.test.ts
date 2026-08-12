import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveExternalResourcePath } from '../../src/resource-path';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('resolveExternalResourcePath', () => {
  it('uses the unpacked sibling when it exists', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'midscene-resource-path-'));
    temporaryDirectories.push(root);
    const archivePath = path.join(root, 'app.asar');
    const unpackedResourcePath = path.join(
      root,
      'app.asar.unpacked',
      'node_modules',
      '@midscene',
      'android',
      'bin',
      'yadb',
    );
    mkdirSync(path.dirname(unpackedResourcePath), { recursive: true });
    writeFileSync(unpackedResourcePath, 'yadb');

    expect(
      resolveExternalResourcePath(
        `${archivePath}/node_modules/@midscene/android/bin/yadb`,
      ),
    ).toBe(unpackedResourcePath);
  });

  it('keeps the original path when no unpacked sibling exists', () => {
    const archivePath = path.join(
      mkdtempSync(path.join(os.tmpdir(), 'midscene-resource-path-')),
      'app.asar',
    );
    temporaryDirectories.push(path.dirname(archivePath));

    expect(resolveExternalResourcePath(`${archivePath}/bin/yadb`)).toBe(
      `${archivePath}/bin/yadb`,
    );
  });

  it('keeps ordinary Node paths unchanged', () => {
    expect(
      resolveExternalResourcePath(
        '/workspace/node_modules/@midscene/android/bin/yadb',
      ),
    ).toBe('/workspace/node_modules/@midscene/android/bin/yadb');
  });
});
