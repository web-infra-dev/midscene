import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverCases, globToRegExp, matchesAny } from '../../src/runner/glob';

describe('globToRegExp', () => {
  it('matches **/*.yaml across segments', () => {
    const re = globToRegExp('**/*.yaml');
    expect(re.test('a.yaml')).toBe(true);
    expect(re.test('e2e/a.yaml')).toBe(true);
    expect(re.test('e2e/deep/a.yaml')).toBe(true);
    expect(re.test('a.yml')).toBe(false);
  });

  it('* stays within a segment', () => {
    const re = globToRegExp('*.yaml');
    expect(re.test('a.yaml')).toBe(true);
    expect(re.test('dir/a.yaml')).toBe(false);
  });

  it('matchesAny supports draft exclusion', () => {
    expect(matchesAny('e2e/a.draft.yaml', ['**/*.draft.yaml'])).toBe(true);
    expect(matchesAny('e2e/a.yaml', ['**/*.draft.yaml'])).toBe(false);
  });
});

describe('discoverCases', () => {
  it('includes yaml and excludes drafts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mts-glob-'));
    mkdirSync(join(dir, 'e2e'), { recursive: true });
    writeFileSync(join(dir, 'e2e', 'a.yaml'), 'flow: []');
    writeFileSync(join(dir, 'e2e', 'b.draft.yaml'), 'flow: []');
    writeFileSync(join(dir, 'e2e', 'c.txt'), 'nope');

    const found = discoverCases(dir, ['**/*.yaml'], ['**/*.draft.yaml']);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('a.yaml');
  });
});
