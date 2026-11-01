import { describe, expect, it } from '@rstest/core';
import { needsRuntimeChecks } from '../ci-changes.mjs';
import { shardFiles } from '../ci-shard.mjs';

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
  it('partitions all files once, including newly added cases, without input-order dependence', () => {
    const files = [
      'slow.yaml',
      'medium.yaml',
      'fast.yaml',
      'new.yaml',
      'other.yaml',
    ];
    const weights = { 'slow.yaml': 1000, 'medium.yaml': 600, 'fast.yaml': 10 };
    const shards = [1, 2, 3].map((i) => shardFiles(files, `${i}/3`, weights));
    expect(shards.flat().sort()).toEqual([...files].sort());
    expect(shards.every((files) => files.length > 0)).toBe(true);
    expect(shardFiles([...files].reverse(), '1/3', weights)).toEqual(shards[0]);
    expect(shardFiles(files)).toEqual([...files].sort());
  });
  it('rejects invalid or empty shards instead of silently losing coverage', () => {
    for (const shard of ['0/2', '3/2', '1/0', '1/3', 'bad']) {
      expect(() => shardFiles(['a', 'b'], shard)).toThrow();
    }
  });
});

it('publishes each shard with its own relative image assets and a common index', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } =
    await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const root = mkdtempSync(join(tmpdir(), 'midscene-shards-'));
  try {
    for (const index of [0, 1, 2, 3]) {
      const shard = join(root, 'input', `e2e-app-report-output-${index}`);
      const result = join(shard, '.midscene/test-results/run');
      const report = join(shard, 'midscene_run/report/run');
      mkdirSync(result, { recursive: true });
      mkdirSync(report, { recursive: true });
      writeFileSync(
        join(result, 'summary.json'),
        JSON.stringify({
          report: '../../../midscene_run/report/run/index.html',
        }),
      );
      writeFileSync(
        join(report, 'index.html'),
        `<img src="image.png">${index}`,
      );
      writeFileSync(join(report, 'image.png'), `image ${index}`);
    }
    execFileSync(process.execPath, [
      new URL('../prepare-ci-report-shards.mjs', import.meta.url).pathname,
      join(root, 'input'),
      join(root, 'output'),
    ]);
    const html = readFileSync(join(root, 'output/assets/index.html'), 'utf8');
    for (const index of [0, 1, 2, 3]) {
      expect(html).toContain(`e2e-app-report-output-${index}/index.html`);
      expect(
        readFileSync(
          join(root, `output/assets/e2e-app-report-output-${index}/image.png`),
          'utf8',
        ),
      ).toBe(`image ${index}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
