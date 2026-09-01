import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertPackagedExternalResourcesUnpacked,
  packagedAsarOptions,
} from '../scripts/packaged-asar-resources.mjs';

describe('packaged ASAR resources', () => {
  it('uses portable globs for native modules and external helpers', () => {
    expect(packagedAsarOptions.unpack).toContain('*.{node,dll,dylib,so,exe}');
    expect(packagedAsarOptions.unpackDir).toContain('node_modules/sharp');
    expect(packagedAsarOptions.unpackDir).toContain('node_modules/@img');
    expect(packagedAsarOptions.unpackDir).toContain(
      'node_modules/@computer-use/libnut',
    );
    expect(packagedAsarOptions.unpackDir).toContain(
      'node_modules/@ffmpeg-installer',
    );
    expect(packagedAsarOptions.unpackDir).toContain(
      'node_modules/@midscene/android/bin',
    );
    expect(packagedAsarOptions.unpackDir).toContain(
      'node_modules/@midscene/computer/bin',
    );
    expect(packagedAsarOptions.unpackDir).not.toContain('\\');
  });

  it('accepts Android helpers that are materialized outside app.asar', async () => {
    const resourcesDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-resources-'),
    );
    try {
      const unpackedAndroidBinDir = path.join(
        resourcesDir,
        'app.asar.unpacked',
        'node_modules',
        '@midscene',
        'android',
        'bin',
      );
      await fs.mkdir(unpackedAndroidBinDir, { recursive: true });
      await Promise.all([
        fs.writeFile(path.join(unpackedAndroidBinDir, 'scrcpy-server'), ''),
        fs.writeFile(path.join(unpackedAndroidBinDir, 'yadb'), ''),
      ]);

      await expect(
        assertPackagedExternalResourcesUnpacked(resourcesDir),
      ).resolves.toBeUndefined();
    } finally {
      await fs.rm(resourcesDir, { recursive: true, force: true });
    }
  });

  it('rejects Android helpers that remain trapped in app.asar', async () => {
    const resourcesDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-resources-'),
    );
    try {
      await fs.writeFile(path.join(resourcesDir, 'app.asar'), 'asar payload');

      await expect(
        assertPackagedExternalResourcesUnpacked(resourcesDir),
      ).rejects.toThrow(/scrcpy-server.*yadb.*External processes cannot read/);
    } finally {
      await fs.rm(resourcesDir, { recursive: true, force: true });
    }
  });
});
