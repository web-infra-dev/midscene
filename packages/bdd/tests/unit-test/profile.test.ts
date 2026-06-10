import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ProfileOverrides, defineProfile } from '../../src/profile';

// cucumber expands `import:` entries as file globs, so the preset injects the
// register module as an absolute file path rather than a bare specifier.
describe('defineProfile', () => {
  it('returns the base profile with an absolute register path by default', () => {
    const { default: profile } = defineProfile();
    const importEntries = profile.import as string[];
    expect(importEntries).toHaveLength(2);
    expect(path.isAbsolute(importEntries[0])).toBe(true);
    expect(importEntries[0]).toMatch(/register\.(ts|js|mjs|cjs)$/);
    expect(importEntries[1]).toBe('features/step_definitions/**/*.js');
    expect(profile.paths).toEqual(['features/**/*.feature']);
    expect(profile.tags).toBe('not @flow');
    expect(profile.format).toEqual(['progress']);
  });

  it('concatenates import with base first and dedupes', () => {
    const { default: profile } = defineProfile({
      import: ['features/support/**/*.js', 'features/support/**/*.js'],
    });
    const importEntries = profile.import as string[];
    expect(importEntries).toHaveLength(3);
    expect(importEntries[1]).toBe('features/step_definitions/**/*.js');
    expect(importEntries[2]).toBe('features/support/**/*.js');
  });

  it('concatenates format with base first and dedupes', () => {
    const { default: profile } = defineProfile({
      format: ['html:report.html', 'progress'],
    });
    expect(profile.format).toEqual(['progress', 'html:report.html']);
  });

  it('replaces paths when provided', () => {
    const { default: profile } = defineProfile({
      paths: ['specs/**/*.feature'],
    });
    expect(profile.paths).toEqual(['specs/**/*.feature']);
  });

  it('combines tags so the base flow exclusion always survives', () => {
    const { default: profile } = defineProfile({ tags: '@smoke' });
    expect(profile.tags).toBe('(not @flow) and (@smoke)');
  });

  it('still combines tags when the override mentions @flow', () => {
    const { default: profile } = defineProfile({ tags: '@smoke or @flow' });
    expect(profile.tags).toBe('(not @flow) and (@smoke or @flow)');
  });

  it('passes unknown extra keys through', () => {
    const { default: profile } = defineProfile({
      parallel: 2,
      retry: 1,
      worldParameters: { appUrl: 'https://example.com' },
    });
    expect(profile.parallel).toBe(2);
    expect(profile.retry).toBe(1);
    expect(profile.worldParameters).toEqual({
      appUrl: 'https://example.com',
    });
  });

  it('throws on invalid override types', () => {
    expect(() =>
      defineProfile({ import: 'not-an-array' } as unknown as ProfileOverrides),
    ).toThrow('[midscene-bdd]');
    expect(() =>
      defineProfile({ import: [42] } as unknown as ProfileOverrides),
    ).toThrow('overrides.import must be an array of strings');
    expect(() =>
      defineProfile({ paths: [null] } as unknown as ProfileOverrides),
    ).toThrow('overrides.paths must be an array of strings');
    expect(() =>
      defineProfile({ format: {} } as unknown as ProfileOverrides),
    ).toThrow('overrides.format must be an array of strings');
    expect(() =>
      defineProfile({ tags: ['@smoke'] } as unknown as ProfileOverrides),
    ).toThrow('overrides.tags must be a string');
    expect(() => defineProfile(null as unknown as ProfileOverrides)).toThrow(
      'overrides must be an object',
    );
  });
});

describe('bin/midscene-bdd', () => {
  const binPath = path.resolve(__dirname, '../../bin/midscene-bdd');

  it('exists, is executable, and starts with a node shebang', () => {
    const stat = statSync(binPath);
    expect(stat.isFile()).toBe(true);
    // Owner-execute bit must be set (file is shipped chmod 755).
    expect(stat.mode & 0o100).toBeTruthy();
    const content = readFileSync(binPath, 'utf8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });
});
