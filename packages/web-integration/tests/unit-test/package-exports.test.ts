import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from '@rstest/core';

const root = resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const entries = Object.entries(pkg.exports) as [
  string,
  Record<string, string>,
][];

describe('published Web entry points', () => {
  it.each(entries)(
    '%s has a real source for its CJS, ESM and type exports',
    (_name, entry) => {
      for (const [condition, target] of Object.entries(entry)) {
        const stem = target
          .replace(/^\.\/dist\/(lib|es|types)\//, '')
          .replace(/\.(d\.ts|mjs|js)$/, '');
        expect(
          ['ts', 'tsx'].some((extension) =>
            existsSync(resolve(root, `src/${stem}.${extension}`)),
          ),
          `${condition}: ${target} points to missing source`,
        ).toBe(true);
      }
    },
  );
});
