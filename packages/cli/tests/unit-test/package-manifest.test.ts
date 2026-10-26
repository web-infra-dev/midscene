import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@rstest/core';

const manifest = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8'),
) as {
  dependencies?: Record<string, string>;
};

describe('published CLI package manifest', () => {
  it.each(['android', 'computer', 'harmony', 'ios', 'web'])(
    'installs the @midscene/%s runtime used by legacy YAML',
    (platform) => {
      expect(manifest.dependencies?.[`@midscene/${platform}`]).toBe(
        'workspace:*',
      );
    },
  );
});
