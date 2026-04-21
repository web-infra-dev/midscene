import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertPortablePackagedNodeModules,
  buildArtifactBaseName,
  buildPackagedAppManifest,
  buildPackagerOptions,
  collectPackagedNodeModuleSymlinkIssues,
  getStudioElectronVersion,
  normalizeReleaseVersion,
  releaseWorkspaceDir,
  rewritePackagedNodeModuleSymlinks,
  shouldUseShellForCommand,
} from '../scripts/package-electron.mjs';

describe('package-electron helpers', () => {
  it('normalizes Git tag versions for archive naming', () => {
    expect(normalizeReleaseVersion('v1.7.4')).toBe('1.7.4');
    expect(normalizeReleaseVersion('1.7.4')).toBe('1.7.4');
  });

  it('builds a deterministic artifact basename', () => {
    expect(
      buildArtifactBaseName({
        version: 'v1.7.4',
        platform: 'darwin',
        arch: 'x64',
      }),
    ).toBe('midscene-studio-v1.7.4-darwin-x64');
  });

  it('creates a packaged manifest that points Electron at the built main entry', () => {
    expect(
      buildPackagedAppManifest(
        {
          author: 'midscene team',
          dependencies: { react: '18.3.1' },
          description: 'Studio shell',
          license: 'MIT',
          type: 'module',
        },
        'v1.7.4',
      ),
    ).toEqual({
      author: 'midscene team',
      dependencies: { react: '18.3.1' },
      description: 'Studio shell',
      license: 'MIT',
      main: 'dist/main/main.cjs',
      name: 'midscene-studio',
      private: true,
      productName: 'Midscene Studio',
      type: 'module',
      version: '1.7.4',
    });
  });

  it('rejects unsupported packaging platforms early', () => {
    expect(() =>
      buildArtifactBaseName({
        version: 'v1.7.4',
        platform: 'freebsd',
        arch: 'x64',
      }),
    ).toThrow(/Unsupported Electron platform/);
  });

  it('ships the app unpacked and keeps the pnpm symlink graph intact', () => {
    expect(
      buildPackagerOptions({
        arch: 'x64',
        outDir: '/tmp/out',
        platform: 'darwin',
        stageDir: '/tmp/stage',
      }),
    ).toMatchObject({
      arch: 'x64',
      asar: false,
      derefSymlinks: false,
      dir: '/tmp/stage',
      electronVersion: getStudioElectronVersion(),
      out: '/tmp/out',
      platform: 'darwin',
      prune: false,
    });
  });

  it('uses a shell for Windows .cmd package manager shims', () => {
    expect(shouldUseShellForCommand('pnpm.cmd', 'win32')).toBe(true);
    expect(shouldUseShellForCommand('pnpm', 'linux')).toBe(false);
  });

  it('keeps release staging outside the studio package root', () => {
    expect(path.normalize(releaseWorkspaceDir)).toContain(
      path.normalize(`${path.sep}.release${path.sep}studio`),
    );
    expect(path.normalize(releaseWorkspaceDir)).not.toContain(
      path.normalize(`${path.sep}apps${path.sep}studio${path.sep}.release`),
    );
  });

  it('flags packaged node_modules symlinks that escape the app bundle', async () => {
    const tempRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-studio-packaged-'),
    );
    const packagedAppPath = path.join(tempRootDir, 'Midscene Studio.app');
    const packagedNodeModulesDir = path.join(
      packagedAppPath,
      'Contents',
      'Resources',
      'app',
      'node_modules',
      '@midscene',
    );

    try {
      await fs.mkdir(packagedNodeModulesDir, { recursive: true });
      await fs.symlink(
        '/Users/runner/work/midscene/midscene/.release/studio/deploy/node_modules/.pnpm/@midscene+playground/node_modules/@midscene/playground',
        path.join(packagedNodeModulesDir, 'playground'),
      );

      await expect(
        collectPackagedNodeModuleSymlinkIssues(
          path.join(
            packagedAppPath,
            'Contents',
            'Resources',
            'app',
            'node_modules',
          ),
        ),
      ).resolves.toEqual([
        {
          path: path.join(packagedNodeModulesDir, 'playground'),
          reason: 'absolute',
          target:
            '/Users/runner/work/midscene/midscene/.release/studio/deploy/node_modules/.pnpm/@midscene+playground/node_modules/@midscene/playground',
        },
      ]);

      await expect(
        assertPortablePackagedNodeModules(packagedAppPath),
      ).rejects.toThrow(/non-portable node_modules symlinks/);
    } finally {
      await fs.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  it('rewrites packager absolute symlinks back into portable in-app links', async () => {
    const tempRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-studio-rewrite-'),
    );
    const stageDir = path.join(tempRootDir, 'stage');
    const packagedAppPath = path.join(tempRootDir, 'Midscene Studio.app');
    const stagePlaygroundDir = path.join(
      stageDir,
      'node_modules',
      '.pnpm',
      '@midscene+playground',
      'node_modules',
      '@midscene',
      'playground',
    );
    const packagedPlaygroundDir = path.join(
      packagedAppPath,
      'Contents',
      'Resources',
      'app',
      'node_modules',
      '.pnpm',
      '@midscene+playground',
      'node_modules',
      '@midscene',
      'playground',
    );
    const packagedWorkspaceScopeDir = path.join(
      packagedAppPath,
      'Contents',
      'Resources',
      'app',
      'node_modules',
      '@midscene',
    );
    const packagedWorkspaceLinkPath = path.join(
      packagedWorkspaceScopeDir,
      'playground',
    );

    try {
      await fs.mkdir(stagePlaygroundDir, { recursive: true });
      await fs.mkdir(packagedPlaygroundDir, { recursive: true });
      await fs.mkdir(packagedWorkspaceScopeDir, { recursive: true });
      await fs.writeFile(path.join(packagedPlaygroundDir, 'index.js'), 'ok\n');
      await fs.symlink(stagePlaygroundDir, packagedWorkspaceLinkPath);

      await rewritePackagedNodeModuleSymlinks({
        packagedAppPath,
        stageDir,
      });

      expect(await fs.readlink(packagedWorkspaceLinkPath)).toBe(
        '../.pnpm/@midscene+playground/node_modules/@midscene/playground',
      );

      await expect(
        assertPortablePackagedNodeModules(packagedAppPath),
      ).resolves.toBeUndefined();
    } finally {
      await fs.rm(tempRootDir, { recursive: true, force: true });
    }
  });
});
