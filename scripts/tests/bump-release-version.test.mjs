import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from '@rstest/core';
import { bumpReleaseVersion } from '../bump-release-version.mjs';

const roots = [];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-bump-'));
  roots.push(root);
  for (const dir of ['', 'packages/sdk', 'apps/studio']) {
    await fs.mkdir(path.join(root, dir), { recursive: true });
    await fs.writeFile(
      path.join(root, dir, 'package.json'),
      `${JSON.stringify({ name: dir || 'root', version: '1.2.3' }, null, 2)}\n`,
    );
  }
  return root;
}

async function version(root, dir = '') {
  return JSON.parse(await fs.readFile(path.join(root, dir, 'package.json')))
    .version;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true })),
  );
});

describe('release version selection', () => {
  it.each([
    ['patch', '1.2.4'],
    ['minor', '1.3.0'],
    ['prepatch', '1.2.4-beta.0'],
    ['1.3.0-beta-20261106120000.0', '1.3.0-beta-20261106120000.0'],
  ])(
    'updates root and SDK manifests for %s without requiring git',
    async (release, next) => {
      const root = await fixture();
      const result = await bumpReleaseVersion(root, release);
      expect(result.oldVersion).toBe('1.2.3');
      expect(result.newVersion).toBe(next);
      expect(await version(root)).toBe(next);
      expect(await version(root, 'packages/sdk')).toBe(next);
      expect(await version(root, 'apps/studio')).toBe('1.2.3');
      await expect(fs.stat(path.join(root, '.git'))).rejects.toThrow();
    },
  );

  it('rejects an invalid release before modifying manifests', async () => {
    const root = await fixture();
    await expect(bumpReleaseVersion(root, 'invalid-version')).rejects.toThrow();
    expect(await version(root)).toBe('1.2.3');
    expect(await version(root, 'packages/sdk')).toBe('1.2.3');
  });
});
