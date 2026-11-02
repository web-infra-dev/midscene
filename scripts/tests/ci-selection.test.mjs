import { describe, expect, it } from '@rstest/core';
import { needsRuntimeChecks } from '../ci-changes.mjs';

describe('CI selection', () => {
  it('skips documentation while preserving executable examples and configuration', () => {
    expect(
      needsRuntimeChecks([
        'README.md',
        'README.zh.md',
        'apps/site/docs/en/intro.mdx',
      ]),
    ).toBe(false);
    for (const file of [
      'apps/site/package.json',
      'packages/core/src/prompt.md',
      '.github/actions/ai-ci/action.yml',
      'pnpm-lock.yaml',
      'examples/test.ts',
    ]) {
      expect(needsRuntimeChecks(['README.md', file])).toBe(true);
    }
  });
});

it('detects runtime deletions hidden by a rename into documentation', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import(
    'node:fs'
  );
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const root = mkdtempSync(join(tmpdir(), 'midscene-changes-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    git('config', 'user.name', 'CI fixture');
    git('config', 'user.email', 'ci@example.invalid');
    writeFileSync(join(root, 'runtime.ts'), 'export const value = 1;\n');
    git('add', '.');
    git('commit', '-qm', 'baseline');
    const before = git('rev-parse', 'HEAD');
    git('mv', 'runtime.ts', 'README.runtime.md');
    git('commit', '-qm', 'rename runtime');
    const event = join(root, 'event.json');
    const output = join(root, 'output');
    writeFileSync(event, JSON.stringify({ before }));
    execFileSync(
      process.execPath,
      [new URL('../ci-changes.mjs', import.meta.url).pathname],
      {
        cwd: root,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'push',
          GITHUB_EVENT_PATH: event,
          GITHUB_OUTPUT: output,
          GITHUB_SHA: git('rev-parse', 'HEAD'),
        },
      },
    );
    expect(readFileSync(output, 'utf8')).toBe('code=true\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
