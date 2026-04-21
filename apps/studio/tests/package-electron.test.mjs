import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildArtifactBaseName,
  buildPackagedAppManifest,
  buildPackagerOptions,
  getStudioElectronVersion,
  normalizeReleaseVersion,
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

  it('ships the app unpacked so pnpm workspace symlinks stay valid', () => {
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
});
