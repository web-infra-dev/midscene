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
  dedupePlaygroundStatic,
  dropAntdEsmBuild,
  dropMidsceneEsmBuilds,
  getStudioElectronVersion,
  normalizeReleaseVersion,
  pruneAntdUmdBundles,
  pruneSourceMapFiles,
  releaseWorkspaceDir,
  resolvePackagerIconPath,
  shouldUseShellForCommand,
  slimStageNodeModules,
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

  it('points packager at the Midscene .icns on macOS', () => {
    const iconPath = resolvePackagerIconPath('darwin');
    expect(iconPath).toBeTruthy();
    expect(iconPath).toMatch(/apps\/studio\/assets\/midscene-icon\.icns$/);
  });

  it('returns no icon for platforms without a prebuilt asset so packager uses its default', () => {
    expect(resolvePackagerIconPath('linux')).toBeUndefined();
    expect(resolvePackagerIconPath('win32')).toBeUndefined();
  });

  it('threads the resolved icon into the packager options', () => {
    const opts = buildPackagerOptions({
      arch: 'arm64',
      outDir: '/tmp/out',
      platform: 'darwin',
      stageDir: '/tmp/stage',
    });
    expect(opts.icon).toMatch(/midscene-icon\.icns$/);
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

  it('drops the entire antd/dist UMD bundle tree', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-nm-'));
    const antdDist = path.join(root, 'antd', 'dist');
    try {
      await fs.mkdir(antdDist, { recursive: true });
      await fs.writeFile(path.join(antdDist, 'antd.min.js'), 'x');
      await fs.writeFile(path.join(antdDist, 'antd.min.js.map'), '{}');
      await fs.writeFile(path.join(root, 'antd', 'package.json'), '{}');

      await pruneAntdUmdBundles(root);

      await expect(fs.stat(antdDist)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(
        fs.stat(path.join(root, 'antd', 'package.json')),
      ).resolves.toBeTruthy();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('removes the ESM build from every @midscene/* package, leaving CJS intact', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-nm-'));
    try {
      for (const pkg of ['core', 'android-playground', 'playground']) {
        const dist = path.join(root, '@midscene', pkg, 'dist');
        await fs.mkdir(path.join(dist, 'es'), { recursive: true });
        await fs.mkdir(path.join(dist, 'lib'), { recursive: true });
        await fs.writeFile(path.join(dist, 'es', 'index.mjs'), 'x');
        await fs.writeFile(path.join(dist, 'lib', 'index.js'), 'x');
      }

      await dropMidsceneEsmBuilds(root);

      for (const pkg of ['core', 'android-playground', 'playground']) {
        await expect(
          fs.stat(path.join(root, '@midscene', pkg, 'dist', 'es')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(
          fs.stat(path.join(root, '@midscene', pkg, 'dist', 'lib', 'index.js')),
        ).resolves.toBeTruthy();
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('is a no-op when @midscene/ does not exist in node_modules', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-nm-'));
    try {
      await expect(dropMidsceneEsmBuilds(root)).resolves.toBeUndefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('drops antd/es while preserving antd/lib and antd/package.json', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-nm-'));
    try {
      await fs.mkdir(path.join(root, 'antd', 'es'), { recursive: true });
      await fs.mkdir(path.join(root, 'antd', 'lib'), { recursive: true });
      await fs.writeFile(path.join(root, 'antd', 'es', 'index.js'), 'x');
      await fs.writeFile(path.join(root, 'antd', 'lib', 'index.js'), 'x');
      await fs.writeFile(path.join(root, 'antd', 'package.json'), '{}');

      await dropAntdEsmBuild(root);

      await expect(
        fs.stat(path.join(root, 'antd', 'es')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(
        fs.stat(path.join(root, 'antd', 'lib', 'index.js')),
      ).resolves.toBeTruthy();
      await expect(
        fs.stat(path.join(root, 'antd', 'package.json')),
      ).resolves.toBeTruthy();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('hardlinks the ios/harmony playground static trees onto the canonical copy', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-nm-'));
    try {
      const canonicalStatic = path.join(
        root,
        '@midscene',
        'playground',
        'static',
      );
      await fs.mkdir(path.join(canonicalStatic, 'static', 'js'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(canonicalStatic, 'static', 'js', 'index.js'),
        'canonical',
      );
      await fs.writeFile(path.join(canonicalStatic, 'index.html'), '<html>');

      for (const alias of ['ios', 'harmony']) {
        const aliasStatic = path.join(root, '@midscene', alias, 'static');
        await fs.mkdir(aliasStatic, { recursive: true });
        await fs.writeFile(
          path.join(aliasStatic, 'stale.js'),
          'will be replaced',
        );
      }

      await dedupePlaygroundStatic(root);

      for (const alias of ['ios', 'harmony']) {
        const aliasIndexJs = path.join(
          root,
          '@midscene',
          alias,
          'static',
          'static',
          'js',
          'index.js',
        );
        const aliasHtml = path.join(
          root,
          '@midscene',
          alias,
          'static',
          'index.html',
        );
        const [canonicalStat, aliasJsStat, aliasHtmlStat] = await Promise.all([
          fs.stat(path.join(canonicalStatic, 'static', 'js', 'index.js')),
          fs.stat(aliasIndexJs),
          fs.stat(aliasHtml),
        ]);
        expect(aliasJsStat.ino).toBe(canonicalStat.ino);
        expect(aliasJsStat.nlink).toBeGreaterThanOrEqual(2);
        expect(aliasHtmlStat.size).toBe(6);
        await expect(
          fs.stat(path.join(root, '@midscene', alias, 'static', 'stale.js')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('is a no-op when the canonical playground static tree is missing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-nm-'));
    try {
      await fs.mkdir(path.join(root, '@midscene', 'ios', 'static'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(root, '@midscene', 'ios', 'static', 'kept.js'),
        'untouched',
      );

      await dedupePlaygroundStatic(root);

      await expect(
        fs.readFile(
          path.join(root, '@midscene', 'ios', 'static', 'kept.js'),
          'utf8',
        ),
      ).resolves.toBe('untouched');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('getBuildStatus forces a rebuild when the release marker is missing', async () => {
    const { getBuildStatus, writeBuildMeta } = await import(
      '../scripts/package-electron.mjs'
    );
    const packageDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-build-'),
    );
    const src = path.join(packageDir, 'src');
    const dist = path.join(packageDir, 'dist');
    try {
      await fs.mkdir(src, { recursive: true });
      await fs.mkdir(dist, { recursive: true });
      await fs.writeFile(path.join(src, 'a.ts'), 'x');
      await fs.writeFile(path.join(dist, 'out.js'), 'x');

      const noMarker = await getBuildStatus({
        packageDir,
        sourceTargets: ['src'],
      });
      expect(noMarker).toEqual({
        needsBuild: true,
        reason: 'no production build marker',
      });

      await writeBuildMeta(packageDir, { nodeEnv: 'development' });
      const devMarker = await getBuildStatus({
        packageDir,
        sourceTargets: ['src'],
      });
      expect(devMarker.needsBuild).toBe(true);
      expect(devMarker.reason).toContain('development');

      await writeBuildMeta(packageDir, { nodeEnv: 'production' });
      // Source mtime <= dist mtime because we wrote the marker last.
      const upToDate = await getBuildStatus({
        packageDir,
        sourceTargets: ['src'],
      });
      expect(upToDate).toEqual({ needsBuild: false, reason: 'up to date' });
    } finally {
      await fs.rm(packageDir, { recursive: true, force: true });
    }
  });

  it('slimStageNodeModules chains all four stage-time prunes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-nm-'));
    try {
      // sourcemap
      await fs.mkdir(path.join(root, 'some-pkg'), { recursive: true });
      await fs.writeFile(path.join(root, 'some-pkg', 'index.js.map'), '{}');
      // antd UMD + antd/es
      const antdDist = path.join(root, 'antd', 'dist');
      const antdEs = path.join(root, 'antd', 'es');
      const antdLib = path.join(root, 'antd', 'lib');
      await fs.mkdir(antdDist, { recursive: true });
      await fs.mkdir(antdEs, { recursive: true });
      await fs.mkdir(antdLib, { recursive: true });
      await fs.writeFile(path.join(antdDist, 'antd.js'), 'x');
      await fs.writeFile(path.join(antdEs, 'index.js'), 'x');
      await fs.writeFile(path.join(antdLib, 'index.js'), 'x');
      // @midscene dual build
      const mcDist = path.join(root, '@midscene', 'core', 'dist');
      await fs.mkdir(path.join(mcDist, 'es'), { recursive: true });
      await fs.mkdir(path.join(mcDist, 'lib'), { recursive: true });
      await fs.writeFile(path.join(mcDist, 'es', 'index.mjs'), 'x');
      await fs.writeFile(path.join(mcDist, 'lib', 'index.js'), 'x');

      await slimStageNodeModules(root);

      await expect(
        fs.stat(path.join(root, 'some-pkg', 'index.js.map')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(fs.stat(antdDist)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(fs.stat(antdEs)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(
        fs.stat(path.join(antdLib, 'index.js')),
      ).resolves.toBeTruthy();
      await expect(fs.stat(path.join(mcDist, 'es'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(
        fs.stat(path.join(mcDist, 'lib', 'index.js')),
      ).resolves.toBeTruthy();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
