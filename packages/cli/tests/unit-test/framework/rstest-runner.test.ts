import { resolveRstestCoreImportPath } from '@/framework/rstest-runner';
import { describe, expect, test } from 'vitest';

describe('rstest runner', () => {
  test('resolves the bundled Rstest core import path', () => {
    expect(resolveRstestCoreImportPath()).toMatch(
      /@rstest[/\\]core[/\\]dist[/\\]index\.js$/,
    );
  });
});
