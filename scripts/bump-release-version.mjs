import fs from 'node:fs/promises';
import path from 'node:path';
import { versionBump } from 'bumpp';
import semver from 'semver';

// The release script owns building, committing, tagging and publishing.
// This step only selects a version and updates the SDK manifests.
export async function bumpReleaseVersion(root, release) {
  // Keep the existing prerelease numbering (beta.0); bumpp starts at beta.1.
  if (semver.RELEASE_TYPES.includes(release)) {
    const manifest = JSON.parse(
      await fs.readFile(path.join(root, 'package.json'), 'utf8'),
    );
    release = semver.inc(manifest.version, release, 'beta');
    if (!release)
      throw new Error('Cannot increment the current release version');
  }
  const result = await versionBump({
    cwd: root,
    files: ['package.json', 'packages/*/package.json'],
    release: release || 'prompt',
    preid: 'beta',
    confirm: false,
    printCommits: false,
    install: false,
    commit: false,
    tag: false,
    push: false,
  });
  return { oldVersion: result.currentVersion, newVersion: result.newVersion };
}
