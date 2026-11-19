import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from '@rstest/core';
import { prepareDependencies } from '../scripts/prepare.mjs';

it('makes an external authoring directory import the host SDK and replay runtime', () => {
  const out = mkdtempSync(join(tmpdir(), 'replay-dependencies-'));
  try {
    const versions = prepareDependencies(out);
    expect(Object.keys(versions).sort()).toEqual([
      '@midscene/replay',
      '@midscene/web',
      'playwright',
    ]);
    expect(
      JSON.parse(readFileSync(join(out, 'package.json'), 'utf8')).private,
    ).toBe(true);
    expect(realpathSync(join(out, 'node_modules/@midscene/replay'))).toContain(
      'packages/replay',
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
