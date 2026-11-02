import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from '@rstest/core';

const workflow = readFileSync(
  new URL('../../.github/workflows/ai.yml', import.meta.url),
  'utf8',
);
const job = (name) =>
  workflow.match(
    new RegExp(`^  ${name}:\\n[\\s\\S]*?(?=^  [\\w-]+:|$(?![\\s\\S]))`, 'm'),
  )?.[0];

it('keeps report consumers on the prepared commit after the selected branch advances', () => {
  const prepare = job('report-prepare');
  expect(prepare).toContain(
    "ref: ${{ github.event_name == 'workflow_dispatch' && inputs.branch || github.sha }}",
  );
  expect(prepare).toContain('sha: ${{ steps.source.outputs.sha }}');
  const recordSource = prepare.match(
    /id: source\n\s+shell: bash\n\s+run: (.+)/,
  )?.[1];
  expect(recordSource).toBeDefined();
  for (const consumer of ['report-shard', 'e2e-report']) {
    const config = job(consumer);
    expect(config).toMatch(/needs: \[[^\n]*report-prepare[^\n]*\]/);
    expect(config).toContain('ref: ${{ needs.report-prepare.outputs.sha }}');
  }

  const root = mkdtempSync(join(tmpdir(), 'report-ci-source-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '-q', '-b', 'selected-branch');
    git('config', 'user.name', 'CI fixture');
    git('config', 'user.email', 'ci@example.invalid');
    writeFileSync(join(root, 'test.txt'), 'commit A');
    git('add', '.');
    git('commit', '-qm', 'commit A');
    const preparedSha = git('rev-parse', 'HEAD');
    const output = join(root, 'source-output');
    execFileSync('bash', ['-e', '-c', recordSource], {
      cwd: root,
      env: { ...process.env, GITHUB_OUTPUT: output },
    });
    const recordedSha = readFileSync(output, 'utf8').trim().split('=')[1];
    expect(recordedSha).toBe(preparedSha);

    writeFileSync(join(root, 'test.txt'), 'commit B');
    git('add', 'test.txt');
    git('commit', '-qm', 'branch advances before a shard starts');
    expect(git('rev-parse', 'selected-branch')).not.toBe(preparedSha);
    // Both a delayed shard and a later failed-job rerun reuse this output.
    git('checkout', '--detach', '-q', recordedSha);
    expect(git('rev-parse', 'HEAD')).toBe(preparedSha);
    expect(readFileSync(join(root, 'test.txt'), 'utf8')).toBe('commit A');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('retains the shared runtime for the documented seven-day retry window', () => {
  expect(job('report-prepare')).toMatch(
    /name: report-runtime\n[\s\S]*?retention-days: 7\n/,
  );
});
