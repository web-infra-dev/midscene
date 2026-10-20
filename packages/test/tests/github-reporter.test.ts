import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  githubFailureAnnotation,
  writeGitHubSummary,
} from '../src/cli/github-reporter';
import type { TestProjectRunResult } from '../src/cli/types';

afterEach(() => vi.unstubAllEnvs());

describe('GitHub reporter', () => {
  it('escapes workflow commands and locates YAML files relative to the workspace', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv('GITHUB_WORKSPACE', '/repo');
    expect(
      githubFailureAnnotation(
        'checkout, web\nstep 3',
        'failed\n::warning::injected%',
        '/repo/tests/case.yaml',
      ),
    ).toBe(
      '::error file=tests/case.yaml,title=checkout%2C web%0Astep 3::failed%0A::warning::injected%25',
    );
    vi.stubEnv('GITHUB_ACTIONS', 'false');
    expect(githubFailureAnnotation('case', 'failed')).toBeUndefined();
  });

  it('appends summaries without counting recovered attempts as failed Cases', () => {
    const dir = mkdtempSync(join(tmpdir(), 'midscene-github-summary-'));
    try {
      vi.stubEnv('GITHUB_ACTIONS', 'true');
      vi.stubEnv('GITHUB_STEP_SUMMARY', join(dir, 'summary.md'));
      const result = {
        durationMs: 1250,
        summary: { passed: 1, failed: 1, notRun: 0, passedAfterRetry: 1 },
        cases: [
          {
            caseId: 'recovered',
            status: 'failed',
            name: 'old attempt',
            projectName: 'web',
            sourcePath: 'a.yaml',
          },
          {
            caseId: 'recovered',
            status: 'success',
            name: 'recovered',
            projectName: 'web',
            sourcePath: 'a.yaml',
          },
          {
            caseId: 'failed',
            status: 'failed',
            name: 'checkout',
            projectName: 'web',
            sourcePath: 'b.yaml',
          },
        ],
        summaryPath: '/repo/summary.json',
        reportPath: '/repo/report/index.html',
      } as TestProjectRunResult;
      writeGitHubSummary(result);
      writeGitHubSummary(result);
      const output = readFileSync(join(dir, 'summary.md'), 'utf8');
      expect(output.match(/## Midscene Test/g)).toHaveLength(2);
      expect(output).toContain('| 1 | 1 | 0 | 1 | 1.3s |');
      expect(output).toContain('Failed: **checkout**');
      expect(output).not.toContain('old attempt');
      expect(output).toContain('/repo/report/index.html');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
