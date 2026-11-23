import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from '@rstest/core';

it('makes an external authoring directory import the SDK without the Playwright test runner', () => {
  const out = mkdtempSync(join(tmpdir(), 'replay-dependencies-'));
  try {
    const hook = `
      export function resolve(name, context, next) {
        if (name === '@playwright/test') throw new Error('Test runner is unavailable');
        return next(name, context);
      }
    `;
    const preload = `import { register } from 'node:module';
      register(${JSON.stringify(`data:text/javascript;base64,${Buffer.from(hook).toString('base64')}`)});`;
    const entry = new URL('../scripts/prepare.mjs', import.meta.url).href;
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import {prepareDependencies} from ${JSON.stringify(entry)};
          console.log(JSON.stringify(prepareDependencies(process.argv[1])));`,
        out,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_OPTIONS: `--import=data:text/javascript;base64,${Buffer.from(preload).toString('base64')}`,
        },
      },
    );
    expect(child.status, child.stderr).toBe(0);
    const versions = JSON.parse(child.stdout);
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
