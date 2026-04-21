import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertPortablePackagedNodeModules,
  buildArtifactBaseName,
  buildInstallWorkspaceManifest,
  buildPackagedAppManifest,
  buildPackagerOptions,
  buildVendoredWorkspaceDirName,
  buildVendoredWorkspaceManifest,
  collectPackagedNodeModuleSymlinkIssues,
  collectWorkspaceDependencyClosure,
  getStudioElectronVersion,
  normalizeReleaseVersion,
  pruneSourceMapFiles,
  releaseWorkspaceDir,
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

  it('ships the app unpacked and preserves the portable pnpm symlink graph', () => {
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
    const packagedOutputPath = path.join(
      tempRootDir,
      'Midscene Studio-darwin-x64',
    );
    const packagedAppPath = path.join(
      packagedOutputPath,
      'Midscene Studio.app',
    );
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
        assertPortablePackagedNodeModules(packagedOutputPath),
      ).rejects.toThrow(/non-portable node_modules symlinks/);
    } finally {
      await fs.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  it('collects the studio runtime workspace dependency closure in dependency-first order', () => {
    const workspacePackages = collectWorkspaceDependencyClosure([
      '@midscene/playground-app',
      '@midscene/ios',
    ]);

    const packageNames = workspacePackages.map(
      (workspacePackage) => workspacePackage.name,
    );
    expect(packageNames).toContain('@midscene/playground');
    expect(packageNames).toContain('@midscene/webdriver');
    expect(packageNames.indexOf('@midscene/shared')).toBeLessThan(
      packageNames.indexOf('@midscene/playground'),
    );
    expect(packageNames.indexOf('@midscene/playground')).toBeLessThan(
      packageNames.indexOf('@midscene/playground-app'),
    );
  });

  it('sanitizes vendored workspace package manifests for staging installs', () => {
    const vendoredManifest = buildVendoredWorkspaceManifest({
      packageJson: {
        name: '@midscene/playground',
        version: '1.7.4',
        dependencies: {
          '@midscene/shared': 'workspace:*',
          react: '18.3.1',
        },
        devDependencies: {
          typescript: '^5.8.3',
        },
        exports: {
          '.': './dist/es/index.mjs',
        },
        scripts: {
          build: 'rslib build',
        },
      },
      workspacePackages: [
        {
          name: '@midscene/shared',
          packageJson: { version: '1.7.4' },
        },
      ],
    });

    expect(vendoredManifest).toEqual({
      dependencies: {
        '@midscene/shared': '1.7.4',
        react: '18.3.1',
      },
      exports: {
        '.': './dist/es/index.mjs',
      },
      name: '@midscene/playground',
      version: '1.7.4',
    });
  });

  it('builds deterministic vendor directory names for workspace packages', () => {
    expect(buildVendoredWorkspaceDirName('@midscene/android-playground')).toBe(
      'midscene-android-playground',
    );
  });

  it('builds an install manifest that pins local workspace directories via overrides', () => {
    const installManifest = buildInstallWorkspaceManifest({
      packageJson: {
        author: 'midscene team',
        dependencies: {
          '@midscene/playground': 'workspace:*',
          '@midscene/shared': 'workspace:*',
          react: '18.3.1',
        },
        description: 'Studio shell',
        license: 'MIT',
        type: 'module',
      },
      version: 'v1.7.4',
      vendoredWorkspacePackages: [
        {
          name: '@midscene/playground',
          packageJson: { version: '1.7.4' },
          vendorDirName: 'midscene-playground',
        },
        {
          name: '@midscene/shared',
          packageJson: { version: '1.7.4' },
          vendorDirName: 'midscene-shared',
        },
      ],
    });

    expect(installManifest).toMatchObject({
      dependencies: {
        '@midscene/playground': '1.7.4',
        '@midscene/shared': '1.7.4',
        react: '18.3.1',
      },
      main: 'dist/main/main.cjs',
      pnpm: {
        overrides: {
          '@midscene/playground': 'file:vendor/midscene-playground',
          '@midscene/shared': 'file:vendor/midscene-shared',
        },
      },
      productName: 'Midscene Studio',
      version: '1.7.4',
    });
  });

  it('prunes vendored source maps before staging the app bundle', async () => {
    const tempRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-studio-vendor-'),
    );
    const sourcemapDir = path.join(tempRootDir, 'static', 'js');

    try {
      await fs.mkdir(sourcemapDir, { recursive: true });
      await fs.writeFile(
        path.join(sourcemapDir, 'index.js'),
        'console.log(1);',
      );
      await fs.writeFile(path.join(sourcemapDir, 'index.js.map'), '{}');
      await fs.writeFile(path.join(tempRootDir, 'types.d.ts.map'), '{}');

      await pruneSourceMapFiles(tempRootDir);

      await expect(
        fs.stat(path.join(sourcemapDir, 'index.js')),
      ).resolves.toBeTruthy();
      await expect(
        fs.stat(path.join(sourcemapDir, 'index.js.map')),
      ).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(
        fs.stat(path.join(tempRootDir, 'types.d.ts.map')),
      ).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await fs.rm(tempRootDir, { recursive: true, force: true });
    }
  });
});
