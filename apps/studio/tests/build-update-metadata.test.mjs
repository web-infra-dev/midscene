import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAppUpdateYml,
  buildLatestYmlForPlatform,
  isPrereleaseVersion,
  writeAppUpdateYmlIntoResources,
  writeUpdateMetadataForArtifact,
} from '../scripts/build-update-metadata.mjs';

const makeTempDir = async (prefix = 'midscene-studio-updater-test-') =>
  fs.mkdtemp(path.join(os.tmpdir(), prefix));

describe('isPrereleaseVersion', () => {
  it('detects beta/alpha/rc identifiers', () => {
    expect(isPrereleaseVersion('1.2.3-beta.0')).toBe(true);
    expect(isPrereleaseVersion('1.2.3-alpha.1')).toBe(true);
    expect(isPrereleaseVersion('1.2.3-rc.5')).toBe(true);
    expect(isPrereleaseVersion('1.2.3')).toBe(false);
    expect(isPrereleaseVersion('1.2.3-canary.4')).toBe(false);
  });
});

describe('buildLatestYmlForPlatform', () => {
  it('emits the electron-updater shape with stable keys', () => {
    const yml = buildLatestYmlForPlatform({
      version: '0.30.0',
      platform: 'darwin',
      artifactName: 'midscene-studio-v0.30.0-darwin-arm64.zip',
      sha512: 'AAAA',
      size: 12345,
      releaseDate: '2026-05-12T00:00:00.000Z',
    });
    expect(yml).toBe(
      [
        'version: 0.30.0',
        'files:',
        '  - url: midscene-studio-v0.30.0-darwin-arm64.zip',
        '    sha512: AAAA',
        '    size: 12345',
        'path: midscene-studio-v0.30.0-darwin-arm64.zip',
        'sha512: AAAA',
        "releaseDate: '2026-05-12T00:00:00.000Z'",
        '',
      ].join('\n'),
    );
  });

  it('rejects unknown platforms', () => {
    expect(() =>
      buildLatestYmlForPlatform({
        version: '0.30.0',
        platform: 'aix',
        artifactName: 'irrelevant.zip',
        sha512: 'AAAA',
        size: 1,
      }),
    ).toThrow(/Unsupported platform/);
  });

  it('rejects unsafe characters in scalars so a bad caller cannot inject YAML', () => {
    expect(() =>
      buildLatestYmlForPlatform({
        version: '0.30.0\n# malicious: true',
        platform: 'darwin',
        artifactName: 'midscene.zip',
        sha512: 'AAAA',
        size: 1,
      }),
    ).toThrow(/version contains unsafe YAML characters/);

    expect(() =>
      buildLatestYmlForPlatform({
        version: '0.30.0',
        platform: 'darwin',
        artifactName: 'a: b.zip',
        sha512: 'AAAA',
        size: 1,
      }),
    ).toThrow(/path contains unsafe YAML characters/);
  });

  it('rejects single quotes and newlines in releaseDate (which is single-quoted)', () => {
    expect(() =>
      buildLatestYmlForPlatform({
        version: '0.30.0',
        platform: 'darwin',
        artifactName: 'midscene.zip',
        sha512: 'AAAA',
        size: 1,
        releaseDate: "2026-05-12'injected",
      }),
    ).toThrow(/releaseDate contains unsafe characters/);
  });

  it('rejects non-integer or negative size', () => {
    expect(() =>
      buildLatestYmlForPlatform({
        version: '0.30.0',
        platform: 'darwin',
        artifactName: 'midscene.zip',
        sha512: 'AAAA',
        size: -1,
      }),
    ).toThrow(/files\[0\]\.size must be a non-negative integer/);
  });
});

describe('buildAppUpdateYml', () => {
  it('points electron-updater at the GitHub provider for this repo', () => {
    const yml = buildAppUpdateYml();
    expect(yml).toBe(
      [
        'provider: github',
        'owner: web-infra-dev',
        'repo: midscene',
        'updaterCacheDirName: midscene-studio-beta-updater',
        '',
      ].join('\n'),
    );
  });
});

describe('writeAppUpdateYmlIntoResources', () => {
  it('creates the resources directory and writes app-update.yml', async () => {
    const tmp = await makeTempDir();
    try {
      const resourcesDir = path.join(tmp, 'Resources');
      const written = await writeAppUpdateYmlIntoResources(resourcesDir);
      expect(written).toBe(path.join(resourcesDir, 'app-update.yml'));
      const content = await fs.readFile(written, 'utf8');
      expect(content).toContain('provider: github');
      expect(content).toContain('repo: midscene');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('writeUpdateMetadataForArtifact', () => {
  it('writes latest-mac.yml with the correct sha512 + size for a zip', async () => {
    const tmp = await makeTempDir();
    try {
      const artifactDir = path.join(tmp, 'artifacts');
      await fs.mkdir(artifactDir, { recursive: true });
      const artifactPath = path.join(
        artifactDir,
        'midscene-studio-v0.30.0-darwin-arm64.zip',
      );
      const payload = Buffer.from('fake-zip-payload-0123456789');
      await fs.writeFile(artifactPath, payload);
      const expectedSha = crypto
        .createHash('sha512')
        .update(payload)
        .digest('base64');

      const result = await writeUpdateMetadataForArtifact({
        artifactPath,
        artifactDir,
        platform: 'darwin',
        version: '0.30.0',
      });

      expect(result.sha512).toBe(expectedSha);
      expect(result.size).toBe(payload.length);
      expect(result.writtenPaths).toEqual([
        path.join(artifactDir, 'latest-mac.yml'),
      ]);

      const yml = await fs.readFile(result.writtenPaths[0], 'utf8');
      expect(yml).toContain(`sha512: ${expectedSha}`);
      expect(yml).toContain(`size: ${payload.length}`);
      expect(yml).toContain('path: midscene-studio-v0.30.0-darwin-arm64.zip');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('mirrors the manifest to beta-<platform>.yml for prerelease versions', async () => {
    const tmp = await makeTempDir();
    try {
      const artifactDir = path.join(tmp, 'artifacts');
      await fs.mkdir(artifactDir, { recursive: true });
      const artifactPath = path.join(
        artifactDir,
        'midscene-studio-v0.30.0-beta.1-linux-x64.zip',
      );
      await fs.writeFile(artifactPath, 'noop');

      const result = await writeUpdateMetadataForArtifact({
        artifactPath,
        artifactDir,
        platform: 'linux',
        version: '0.30.0-beta.1',
      });

      expect(result.writtenPaths).toEqual([
        path.join(artifactDir, 'latest-linux.yml'),
        path.join(artifactDir, 'beta-linux.yml'),
      ]);

      const stable = await fs.readFile(result.writtenPaths[0], 'utf8');
      const beta = await fs.readFile(result.writtenPaths[1], 'utf8');
      expect(stable).toBe(beta);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
