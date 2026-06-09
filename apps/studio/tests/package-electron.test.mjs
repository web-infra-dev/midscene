import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertPortablePackagedNodeModules,
  buildArtifactBaseName,
  buildInstallWorkspaceManifest,
  buildMacDittoArchiveArgs,
  buildPackagedAppManifest,
  buildPackagedResourcesCandidates,
  buildPackagerOptions,
  buildPnpmSupportedArchitectures,
  buildStudioDmgSpecification,
  buildVendoredWorkspaceDirName,
  buildVendoredWorkspaceManifest,
  collectNestedMacCodeSignTargets,
  collectPackagedNodeModuleSymlinkIssues,
  collectWorkspaceDependencyClosure,
  dedupePlaygroundStatic,
  dropAntdEsmBuild,
  dropMidsceneEsmBuilds,
  getStudioElectronVersion,
  loadAppDmg,
  normalizeReleaseVersion,
  packagedAsarOptions,
  parseBooleanLike,
  pathContainsReportTemplatePlaceholder,
  pruneAntdUmdBundles,
  pruneGifwrapTestFixtures,
  pruneSourceMapFiles,
  releaseWorkspaceDir,
  resolveDefaultPackageArch,
  resolveMacCodeSignEntitlementsPath,
  resolveMacPackagedAppBundlePath,
  resolveMacPackagedAppSecurity,
  resolvePackagedAppArchiver,
  resolvePackagerIconPath,
  resolvePnpmPackageEntry,
  shouldUseShellForCommand,
  slimStageNodeModules,
} from '../scripts/package-electron.mjs';

describe('package-electron helpers', () => {
  it('normalizes Git tag versions for archive naming', () => {
    expect(normalizeReleaseVersion('v1.7.4')).toBe('1.7.4');
    expect(normalizeReleaseVersion('1.7.4')).toBe('1.7.4');
  });

  it('lays out the dmg with the .app on the left and /Applications on the right', () => {
    const spec = buildStudioDmgSpecification({
      appBundlePath: '/tmp/Midscene Studio Beta.app',
      iconPath: '/tmp/midscene-icon.icns',
      backgroundPath: '/tmp/dmg-background.png',
    });
    expect(spec.title).toBe('Midscene Studio Beta');
    expect(spec.icon).toBe('/tmp/midscene-icon.icns');
    expect(spec.background).toBe('/tmp/dmg-background.png');
    expect(spec.window).toEqual({ size: { width: 540, height: 380 } });
    expect(spec.format).toBe('ULFO');
    const linkEntry = spec.contents.find((entry) => entry.type === 'link');
    const fileEntry = spec.contents.find((entry) => entry.type === 'file');
    expect(linkEntry?.path).toBe('/Applications');
    expect(linkEntry?.x).toBeGreaterThan(fileEntry?.x);
    // Both icons sit on the same y, vertically centered against
    // the Finder content area so the "Drag to" hint baked into
    // the background image lines up with them.
    expect(linkEntry?.y).toBe(fileEntry?.y);
    expect(linkEntry?.y).toBe(160);
    expect(fileEntry?.path).toBe('/tmp/Midscene Studio Beta.app');
    expect(fileEntry?.name).toBe('Midscene Studio Beta.app');
  });

  it('loads appdmg from the pnpm store when the workspace symlink is missing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-pnpm-'));
    const appdmgDir = path.join(
      root,
      'node_modules',
      '.pnpm',
      'appdmg@0.6.6',
      'node_modules',
      'appdmg',
    );
    try {
      await fs.mkdir(appdmgDir, { recursive: true });
      await fs.writeFile(
        path.join(appdmgDir, 'package.json'),
        JSON.stringify({ main: 'index.mjs', type: 'module' }),
      );
      await fs.writeFile(
        path.join(appdmgDir, 'index.mjs'),
        'export default function appdmg() { return "loaded"; }\n',
      );

      expect(
        resolvePnpmPackageEntry({
          packageName: 'appdmg',
          version: '0.6.6',
          workspaceRoot: root,
        }),
      ).toBe(path.join(appdmgDir, 'index.mjs'));

      const missingDirectImport = Object.assign(new Error('missing appdmg'), {
        code: 'ERR_MODULE_NOT_FOUND',
      });
      const appdmg = await loadAppDmg({
        directImport: async () => {
          throw missingDirectImport;
        },
        workspaceRoot: root,
      });
      expect(appdmg()).toBe('loaded');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('loads appdmg from the staged packaging workspace pnpm store', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-pnpm-'));
    const stageRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-stage-pnpm-'),
    );
    const appdmgDir = path.join(
      stageRoot,
      'node_modules',
      '.pnpm',
      'appdmg@0.6.6',
      'node_modules',
      'appdmg',
    );
    try {
      await fs.mkdir(appdmgDir, { recursive: true });
      await fs.writeFile(
        path.join(appdmgDir, 'package.json'),
        JSON.stringify({ main: 'index.mjs', type: 'module' }),
      );
      await fs.writeFile(
        path.join(appdmgDir, 'index.mjs'),
        'export default function appdmg() { return "loaded from stage"; }\n',
      );

      const missingDirectImport = Object.assign(new Error('missing appdmg'), {
        code: 'ERR_MODULE_NOT_FOUND',
      });
      const appdmg = await loadAppDmg({
        directImport: async () => {
          throw missingDirectImport;
        },
        workspaceRoot: root,
        extraWorkspaceRoots: [stageRoot],
      });
      expect(appdmg()).toBe('loaded from stage');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(stageRoot, { recursive: true, force: true });
    }
  });

  it('builds a deterministic artifact basename', () => {
    expect(
      buildArtifactBaseName({
        version: 'v1.7.4',
        platform: 'darwin',
        arch: 'x64',
      }),
    ).toBe('midscene-studio-beta-v1.7.4-darwin-x64');
  });

  it('defaults Windows packaging to x64 regardless of host arch', () => {
    expect(resolveDefaultPackageArch('win32', 'arm64')).toBe('x64');
    expect(resolveDefaultPackageArch('win32', 'x64')).toBe('x64');
  });

  it('keeps the host arch as the default for non-Windows packaging', () => {
    expect(resolveDefaultPackageArch('darwin', 'arm64')).toBe('arm64');
    expect(resolveDefaultPackageArch('linux', 'x64')).toBe('x64');
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
      name: 'midscene-studio-beta',
      private: true,
      productName: 'Midscene Studio Beta',
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

  it('packages the app payload as asar while preserving portable pnpm links', () => {
    expect(
      buildPackagerOptions({
        arch: 'x64',
        outDir: '/tmp/out',
        platform: 'darwin',
        stageDir: '/tmp/stage',
      }),
    ).toMatchObject({
      arch: 'x64',
      asar: packagedAsarOptions,
      derefSymlinks: false,
      dir: '/tmp/stage',
      electronVersion: getStudioElectronVersion(),
      out: '/tmp/out',
      platform: 'darwin',
      prune: false,
    });
  });

  it('keeps native modules and helper binaries outside app.asar', () => {
    expect(packagedAsarOptions.unpack).toContain('*.{node,dll,dylib,so,exe}');
    expect(packagedAsarOptions.unpackDir).toContain('node_modules/sharp');
    expect(packagedAsarOptions.unpackDir).toContain('node_modules/@img');
    expect(packagedAsarOptions.unpackDir).toContain(
      path.join('node_modules', '@computer-use', 'libnut'),
    );
    expect(packagedAsarOptions.unpackDir).toContain(
      path.join('node_modules', '@ffmpeg-installer'),
    );
    expect(packagedAsarOptions.unpackDir).toContain(
      path.join('node_modules', '@midscene', 'computer', 'bin'),
    );
  });

  it('points packager at the Midscene .icns on macOS', () => {
    const iconPath = resolvePackagerIconPath('darwin');
    expect(iconPath).toBeTruthy();
    expect(iconPath).toMatch(/apps\/studio\/assets\/midscene-icon\.icns$/);
  });

  it('returns no icon for Linux so packager uses its default', () => {
    expect(resolvePackagerIconPath('linux')).toBeUndefined();
  });

  it('points packager at the Midscene .ico on Windows', () => {
    const iconPath = resolvePackagerIconPath('win32');
    expect(iconPath).toBeTruthy();
    expect(iconPath).toMatch(/apps\/studio\/assets\/midscene-icon\.ico$/);
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

  it('threads the Windows .ico into the packager options', () => {
    const opts = buildPackagerOptions({
      arch: 'x64',
      outDir: '/tmp/out',
      platform: 'win32',
      stageDir: '/tmp/stage',
    });
    expect(opts.icon).toMatch(/midscene-icon\.ico$/);
  });

  it('resolves the resources directory when the app payload is packed as asar', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-app-'));
    try {
      const resourcesDir = path.join(
        root,
        'Midscene Studio.app',
        'Contents',
        'Resources',
      );
      await fs.mkdir(resourcesDir, { recursive: true });
      await fs.writeFile(path.join(resourcesDir, 'app.asar'), 'asar payload');

      const candidates = await buildPackagedResourcesCandidates(
        path.join(root, 'Midscene Studio.app'),
      );

      expect(candidates[0]).toBe(resourcesDir);
      await expect(
        fs.stat(path.join(resourcesDir, 'app.asar')),
      ).resolves.toBeTruthy();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('uses a shell for Windows .cmd package manager shims', () => {
    expect(shouldUseShellForCommand('pnpm.cmd', 'win32')).toBe(true);
    expect(shouldUseShellForCommand('pnpm', 'linux')).toBe(false);
  });

  it('parses boolean-like configuration values used by mac packaging flags', () => {
    expect(parseBooleanLike('true')).toBe(true);
    expect(parseBooleanLike('1')).toBe(true);
    expect(parseBooleanLike('false')).toBe(false);
    expect(parseBooleanLike(undefined, true)).toBe(true);
    expect(() => parseBooleanLike('definitely')).toThrow(
      /Expected a boolean-like value/,
    );
  });

  it('resolves default mac packaging security to ad-hoc signing without notarization', () => {
    expect(
      resolveMacPackagedAppSecurity({
        env: {},
        platform: 'darwin',
      }),
    ).toEqual({
      notarizeOptions: undefined,
      requireCodesign: false,
      requireNotarization: false,
      shouldDeveloperIdSign: false,
      shouldNotarize: false,
      signIdentity: undefined,
      signKeychain: undefined,
      teamId: undefined,
    });
  });

  it('resolves Developer ID signing and notarization credentials from env', () => {
    expect(
      resolveMacPackagedAppSecurity({
        env: {
          APPLE_API_KEY_ID: 'ABC123XYZ9',
          APPLE_API_KEY_PATH: '/tmp/AuthKey_ABC123XYZ9.p8',
          APPLE_API_ISSUER_ID: 'issuer-uuid',
          APPLE_CODESIGN_IDENTITY:
            'Developer ID Application: YIBING LIN (62S977T8M3)',
          APPLE_CODESIGN_KEYCHAIN: '/tmp/midscene-signing.keychain-db',
          APPLE_TEAM_ID: '62S977T8M3',
          MIDSCENE_REQUIRE_MAC_CODESIGN: 'true',
          MIDSCENE_REQUIRE_MAC_NOTARIZATION: 'true',
        },
        platform: 'darwin',
      }),
    ).toEqual({
      notarizeOptions: {
        appleApiIssuer: 'issuer-uuid',
        appleApiKey: '/tmp/AuthKey_ABC123XYZ9.p8',
        appleApiKeyId: 'ABC123XYZ9',
      },
      requireCodesign: true,
      requireNotarization: true,
      shouldDeveloperIdSign: true,
      shouldNotarize: true,
      signIdentity: 'Developer ID Application: YIBING LIN (62S977T8M3)',
      signKeychain: '/tmp/midscene-signing.keychain-db',
      teamId: '62S977T8M3',
    });
  });

  it('notarizes prerelease builds whenever Developer ID + notary credentials are present', () => {
    // Prereleases set MIDSCENE_REQUIRE_MAC_NOTARIZATION=false so missing
    // credentials don't fail the build, but when credentials ARE present
    // we must still notarize. Otherwise the .app gets Developer-ID
    // signed but stays unnotarized, and Gatekeeper rejects it on
    // download with "Apple cannot verify...".
    expect(
      resolveMacPackagedAppSecurity({
        env: {
          APPLE_API_KEY_ID: 'ABC123XYZ9',
          APPLE_API_KEY_PATH: '/tmp/AuthKey_ABC123XYZ9.p8',
          APPLE_API_ISSUER_ID: 'issuer-uuid',
          APPLE_CODESIGN_IDENTITY:
            'Developer ID Application: YIBING LIN (62S977T8M3)',
          APPLE_TEAM_ID: '62S977T8M3',
          MIDSCENE_REQUIRE_MAC_CODESIGN: 'false',
          MIDSCENE_REQUIRE_MAC_NOTARIZATION: 'false',
        },
        platform: 'darwin',
      }),
    ).toMatchObject({
      shouldDeveloperIdSign: true,
      shouldNotarize: true,
      requireNotarization: false,
    });
  });

  it('skips notarization when notary credentials are absent even with a Developer ID identity', () => {
    expect(
      resolveMacPackagedAppSecurity({
        env: {
          APPLE_CODESIGN_IDENTITY:
            'Developer ID Application: YIBING LIN (62S977T8M3)',
          APPLE_TEAM_ID: '62S977T8M3',
        },
        platform: 'darwin',
      }),
    ).toMatchObject({
      shouldDeveloperIdSign: true,
      shouldNotarize: false,
    });
  });

  it('rejects release mac packaging when codesign is required but no identity is configured', () => {
    expect(() =>
      resolveMacPackagedAppSecurity({
        env: {
          MIDSCENE_REQUIRE_MAC_CODESIGN: 'true',
        },
        platform: 'darwin',
      }),
    ).toThrow(/requires a Developer ID signing identity/);
  });

  it('rejects notarization when credentials are missing', () => {
    expect(() =>
      resolveMacPackagedAppSecurity({
        env: {
          APPLE_CODESIGN_IDENTITY:
            'Developer ID Application: YIBING LIN (62S977T8M3)',
          MIDSCENE_REQUIRE_MAC_NOTARIZATION: 'true',
        },
        platform: 'darwin',
      }),
    ).toThrow(/notarization credentials are missing/);
  });

  it('rejects team mismatches between the configured identity and team id', () => {
    expect(() =>
      resolveMacPackagedAppSecurity({
        env: {
          APPLE_CODESIGN_IDENTITY:
            'Developer ID Application: YIBING LIN (62S977T8M3)',
          APPLE_TEAM_ID: 'WRONGTEAM1',
        },
        platform: 'darwin',
      }),
    ).toThrow(/does not match APPLE_TEAM_ID/);
  });

  it('resolves the nested .app bundle from the macOS packaged output directory', async () => {
    const tempRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-studio-mac-bundle-'),
    );
    const packagedOutputPath = path.join(
      tempRootDir,
      'Midscene Studio Beta-darwin-arm64',
    );
    const appBundlePath = path.join(
      packagedOutputPath,
      'Midscene Studio Beta.app',
    );

    try {
      await fs.mkdir(appBundlePath, { recursive: true });

      await expect(
        resolveMacPackagedAppBundlePath(packagedOutputPath),
      ).resolves.toBe(appBundlePath);
      await expect(
        resolveMacPackagedAppBundlePath(appBundlePath),
      ).resolves.toBe(appBundlePath);
    } finally {
      await fs.rm(tempRootDir, { force: true, recursive: true });
    }
  });

  it('collects nested macOS code-sign targets deepest-first before signing the root app bundle', async () => {
    const tempRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-studio-codesign-targets-'),
    );
    const appBundlePath = path.join(tempRootDir, 'Midscene Studio.app');
    const libffmpegPath = path.join(
      appBundlePath,
      'Contents',
      'Frameworks',
      'Electron Framework.framework',
      'Versions',
      'A',
      'Libraries',
      'libffmpeg.dylib',
    );
    const crashpadHandlerPath = path.join(
      appBundlePath,
      'Contents',
      'Frameworks',
      'Electron Framework.framework',
      'Versions',
      'A',
      'Helpers',
      'chrome_crashpad_handler',
    );
    const shipItPath = path.join(
      appBundlePath,
      'Contents',
      'Frameworks',
      'Squirrel.framework',
      'Versions',
      'A',
      'Resources',
      'ShipIt',
    );
    const helperAppPath = path.join(
      appBundlePath,
      'Contents',
      'Frameworks',
      'Midscene Studio Helper.app',
    );
    const addonPath = path.join(
      appBundlePath,
      'Contents',
      'Resources',
      'native-addon.node',
    );
    const barePath = path.join(
      appBundlePath,
      'Contents',
      'Resources',
      'app',
      'node_modules',
      'bare-url',
      'prebuilds',
      'darwin-arm64',
      'bare-url.bare',
    );
    const scriptPath = path.join(
      appBundlePath,
      'Contents',
      'Resources',
      'node_modules',
      '.bin',
      'not-mach-o',
    );

    try {
      await fs.mkdir(path.dirname(libffmpegPath), { recursive: true });
      await fs.mkdir(path.dirname(crashpadHandlerPath), { recursive: true });
      await fs.mkdir(path.dirname(shipItPath), { recursive: true });
      await fs.mkdir(helperAppPath, { recursive: true });
      await fs.mkdir(path.dirname(addonPath), { recursive: true });
      await fs.mkdir(path.dirname(barePath), { recursive: true });
      await fs.mkdir(path.dirname(scriptPath), { recursive: true });
      await fs.writeFile(libffmpegPath, '');
      await fs.writeFile(crashpadHandlerPath, Buffer.from('cffaedfe', 'hex'));
      await fs.writeFile(shipItPath, Buffer.from('cffaedfe', 'hex'));
      await fs.writeFile(addonPath, '');
      await fs.writeFile(barePath, '');
      await fs.writeFile(scriptPath, '#!/bin/sh\n');

      await expect(
        collectNestedMacCodeSignTargets(appBundlePath),
      ).resolves.toEqual([
        barePath,
        crashpadHandlerPath,
        libffmpegPath,
        shipItPath,
        addonPath,
        path.join(
          appBundlePath,
          'Contents',
          'Frameworks',
          'Electron Framework.framework',
        ),
        helperAppPath,
        path.join(
          appBundlePath,
          'Contents',
          'Frameworks',
          'Squirrel.framework',
        ),
      ]);
    } finally {
      await fs.rm(tempRootDir, { force: true, recursive: true });
    }
  });

  it('selects Electron helper entitlements that match the osx-sign defaults', () => {
    expect(
      resolveMacCodeSignEntitlementsPath(
        '/tmp/Midscene Studio.app/Contents/Frameworks/Midscene Studio Helper (Plugin).app',
      ),
    ).toMatch(/entitlements\.mac\.plugin\.plist$/);
    expect(
      resolveMacCodeSignEntitlementsPath(
        '/tmp/Midscene Studio.app/Contents/Frameworks/Midscene Studio Helper (GPU).app',
      ),
    ).toMatch(/entitlements\.mac\.gpu\.plist$/);
    expect(
      resolveMacCodeSignEntitlementsPath(
        '/tmp/Midscene Studio.app/Contents/Frameworks/Midscene Studio Helper (Renderer).app',
      ),
    ).toMatch(/entitlements\.mac\.renderer\.plist$/);
    expect(
      resolveMacCodeSignEntitlementsPath(
        '/tmp/Midscene Studio.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib',
      ),
    ).toMatch(/entitlements\.mac\.plist$/);
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
      'Midscene Studio Beta-darwin-x64',
    );
    const packagedAppPath = path.join(
      packagedOutputPath,
      'Midscene Studio Beta.app',
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
      productName: 'Midscene Studio Beta',
      version: '1.7.4',
    });
    expect(installManifest.pnpm).not.toHaveProperty('supportedArchitectures');
  });

  it('writes pnpm.supportedArchitectures into the install manifest when a target platform/arch is provided', () => {
    const installManifest = buildInstallWorkspaceManifest({
      packageJson: {
        dependencies: {
          '@midscene/shared': 'workspace:*',
        },
        type: 'module',
      },
      version: 'v1.7.4',
      vendoredWorkspacePackages: [
        {
          name: '@midscene/shared',
          packageJson: { version: '1.7.4' },
          vendorDirName: 'midscene-shared',
        },
      ],
      targetPlatform: 'win32',
      targetArch: 'x64',
    });

    expect(installManifest.pnpm).toMatchObject({
      overrides: {
        '@midscene/shared': 'file:vendor/midscene-shared',
      },
      supportedArchitectures: {
        os: ['win32'],
        cpu: ['x64'],
      },
    });
  });

  it('omits pnpm.supportedArchitectures when the target platform or arch is missing', () => {
    expect(buildPnpmSupportedArchitectures(undefined, 'x64')).toBeUndefined();
    expect(buildPnpmSupportedArchitectures('win32', undefined)).toBeUndefined();
    expect(buildPnpmSupportedArchitectures('win32', 'x64')).toEqual({
      os: ['win32'],
      cpu: ['x64'],
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

  it('removes gifwrap test fixtures while preserving the runtime entry point', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-nm-'));
    try {
      const gifwrapDir = path.join(root, 'gifwrap');
      await fs.mkdir(path.join(gifwrapDir, 'test', 'fixtures'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(gifwrapDir, 'index.js'),
        'module.exports={}',
      );
      await fs.writeFile(
        path.join(gifwrapDir, 'test', 'fixtures', 'fixture.png'),
        'png',
      );

      await pruneGifwrapTestFixtures(root);

      await expect(
        fs.stat(path.join(gifwrapDir, 'test')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(
        fs.stat(path.join(gifwrapDir, 'index.js')),
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

  it('getBuildStatus treats additional build inputs as source dependencies', async () => {
    const { getBuildStatus, writeBuildMeta } = await import(
      '../scripts/package-electron.mjs'
    );
    const packageDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-build-'),
    );
    const src = path.join(packageDir, 'src');
    const dist = path.join(packageDir, 'dist');
    const injectedTemplate = path.join(
      packageDir,
      '..',
      `${path.basename(packageDir)}-report.html`,
    );

    try {
      await fs.mkdir(src, { recursive: true });
      await fs.mkdir(dist, { recursive: true });
      await fs.writeFile(path.join(src, 'a.ts'), 'x');
      await fs.writeFile(path.join(dist, 'out.js'), 'x');
      await writeBuildMeta(packageDir, { nodeEnv: 'production' });

      await expect(
        getBuildStatus({
          packageDir,
          sourceTargets: ['src'],
        }),
      ).resolves.toEqual({ needsBuild: false, reason: 'up to date' });

      await new Promise((resolve) => setTimeout(resolve, 20));
      await fs.writeFile(injectedTemplate, '<html></html>');

      await expect(
        getBuildStatus({
          packageDir,
          sourceTargets: ['src'],
          additionalSourceTargets: [injectedTemplate],
        }),
      ).resolves.toEqual({
        needsBuild: true,
        reason: 'source files are newer than build output',
      });
    } finally {
      await fs.rm(packageDir, { recursive: true, force: true });
      await fs.rm(injectedTemplate, { force: true });
    }
  });

  it('detects unresolved report template placeholders in runtime output only', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-report-'));
    try {
      await fs.writeFile(
        path.join(root, 'guard.js'),
        "if (html.includes('REPLACE_ME_WITH_REPORT_HTML')) reportHTML = null;",
      );
      await fs.writeFile(
        path.join(root, 'bundle.js.map'),
        '{"sourcesContent":["const reportTpl = \'REPLACE_ME_WITH_REPORT_HTML\';"]}',
      );

      await expect(pathContainsReportTemplatePlaceholder(root)).resolves.toBe(
        false,
      );

      await fs.writeFile(
        path.join(root, 'utils.js'),
        "const reportTpl = 'REPLACE_ME_WITH_REPORT_HTML';",
      );

      await expect(pathContainsReportTemplatePlaceholder(root)).resolves.toBe(
        true,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('slimStageNodeModules chains all five stage-time prunes', async () => {
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
      // gifwrap test fixtures
      const gifwrapTestDir = path.join(root, 'gifwrap', 'test', 'fixtures');
      await fs.mkdir(gifwrapTestDir, { recursive: true });
      await fs.writeFile(path.join(root, 'gifwrap', 'index.js'), 'x');
      await fs.writeFile(path.join(gifwrapTestDir, 'fixture.png'), 'png');
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
      await expect(
        fs.stat(path.join(root, 'gifwrap', 'test')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(
        fs.stat(path.join(root, 'gifwrap', 'index.js')),
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

  // Regression guards for macOS signing/notarization survival. Skipping any of
  // these allows the packaged `.app` to lose its stapler ticket through the
  // GitHub artifact zip round-trip, producing the
  // "Apple cannot verify Midscene Studio.app" Gatekeeper rejection.
  it('keeps `--sequesterRsrc` and `--keepParent` in the macOS ditto archive args', () => {
    const args = buildMacDittoArchiveArgs({
      sourcePath: '/tmp/Midscene Studio.app',
      artifactPath: '/tmp/Midscene Studio.zip',
    });
    expect(args).toContain('--sequesterRsrc');
    expect(args).toContain('--keepParent');
    expect(args).toContain('-c');
    expect(args).toContain('-k');
    expect(args[args.length - 2]).toBe('/tmp/Midscene Studio.app');
    expect(args[args.length - 1]).toBe('/tmp/Midscene Studio.zip');
  });

  it('always routes macOS archiving through ditto', () => {
    expect(resolvePackagedAppArchiver('darwin')).toBe('ditto');
    expect(resolvePackagedAppArchiver('win32')).toBe('powershell');
    expect(resolvePackagedAppArchiver('linux')).toBe('zip');
  });

  it('release workflow always archives the Studio app and never skips it', async () => {
    const workflowPath = path.join(
      releaseWorkspaceDir,
      '..',
      '..',
      '.github',
      'workflows',
      'release.yml',
    );
    const workflow = await fs.readFile(workflowPath, 'utf8');
    // `--skip-archive` would bypass `archivePackagedApp` and let
    // `actions/upload-artifact` re-zip the raw `.app`, dropping xattrs and
    // breaking the notarization stapler ticket on macOS.
    expect(workflow).not.toMatch(/--skip-archive/);
    expect(workflow).toMatch(/Package Midscene Studio Beta/);
    expect(workflow).toMatch(/\.release\/studio\/artifacts\/\*\.zip/);
  });
});
