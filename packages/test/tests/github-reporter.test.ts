import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  githubFailureAnnotation,
  writeGitHubSummary,
} from '../src/cli/github-reporter';
import type { TestProjectRunResult } from '../src/cli/types';

afterEach(() => {
  rs.unstubAllEnvs();
});

describe('GitHub reporter', () => {
  it('escapes workflow commands and locates YAML files relative to the workspace', () => {
    rs.stubEnv('GITHUB_ACTIONS', 'true');
    rs.stubEnv('GITHUB_WORKSPACE', '/repo');
    expect(
      githubFailureAnnotation(
        'checkout, web\nstep 3',
        'failed\n::warning::injected%',
        '/repo/tests/case.yaml',
      ),
    ).toBe(
      '::error file=tests/case.yaml,title=checkout%2C web%0Astep 3::failed%0A::warning::injected%25',
    );
    rs.stubEnv('GITHUB_ACTIONS', 'false');
    expect(githubFailureAnnotation('case', 'failed')).toBeUndefined();
  });

  it.each([
    { notRun: 3, collectionErrors: 0, documentFailures: 1, projectFailures: 0 },
    { notRun: 0, collectionErrors: 1, documentFailures: 0, projectFailures: 0 },
    { notRun: 0, collectionErrors: 0, documentFailures: 0, projectFailures: 1 },
    { notRun: 0, collectionErrors: 0, documentFailures: 0, projectFailures: 0 },
  ])('omits misleading badges for failed runs: %j', (failures) => {
    const dir = mkdtempSync(join(tmpdir(), 'midscene-github-summary-'));
    try {
      const output = join(dir, 'summary.md');
      rs.stubEnv('GITHUB_ACTIONS', 'true');
      rs.stubEnv('GITHUB_STEP_SUMMARY', output);
      writeGitHubSummary({
        schemaVersion: 3,
        runId: 'failed-run',
        startedAt: '2026-10-20T00:00:00.000Z',
        endedAt: '2026-10-20T00:00:01.000Z',
        durationMs: 1000,
        status: 'failed',
        exitCode: 1,
        resultDir: '/repo',
        reportDir: '/repo/report',
        summaryPath: '/repo/summary.json',
        summary: {
          total: 5 + failures.notRun,
          passed: 5,
          failed: 0,
          passedAfterRetry: 0,
          finalPassRate: 5 / (5 + failures.notRun),
          firstPassRate: 5 / (5 + failures.notRun),
          filtered: 0,
          ...failures,
        },
        projects: [],
        documents: [],
        collectionErrors: [],
        cases: [],
      });
      const markdown = readFileSync(output, 'utf8');
      expect(markdown).not.toContain('https://badge.midscenejs.com/');
      expect(markdown).toContain(`| 5 | 0 | ${failures.notRun} | 0 | 1.0s |`);
      if (failures.collectionErrors)
        expect(markdown).toContain('- Collection errors: 1');
      if (failures.documentFailures)
        expect(markdown).toContain('- Failed files: 1');
      if (failures.projectFailures)
        expect(markdown).toContain('- Failed projects: 1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('appends summaries without counting recovered attempts as failed Cases', () => {
    const dir = mkdtempSync(join(tmpdir(), 'midscene-github-summary-'));
    try {
      rs.stubEnv('GITHUB_ACTIONS', 'true');
      rs.stubEnv('GITHUB_STEP_SUMMARY', join(dir, 'summary.md'));
      const result: TestProjectRunResult = {
        schemaVersion: 3,
        runId: 'github-summary',
        startedAt: '2026-10-20T00:00:00.000Z',
        endedAt: '2026-10-20T00:00:01.250Z',
        durationMs: 1250,
        status: 'failed',
        exitCode: 1,
        resultDir: '/repo',
        reportDir: '/repo/report',
        summary: {
          total: 4,
          passed: 1,
          failed: 1,
          notRun: 2,
          passedAfterRetry: 1,
          finalPassRate: 0.5,
          firstPassRate: 0,
          filtered: 0,
          collectionErrors: 0,
          documentFailures: 0,
          projectFailures: 0,
        },
        projects: [],
        documents: [],
        collectionErrors: [],
        cases: [
          {
            caseId: 'recovered',
            caseIndex: 0,
            documentId: 'a.yaml',
            status: 'failed',
            name: 'old attempt',
            projectName: 'web',
            sourcePath: 'a.yaml',
          },
          {
            caseId: 'recovered',
            caseIndex: 0,
            documentId: 'a.yaml',
            status: 'success',
            name: 'recovered',
            projectName: 'web',
            sourcePath: 'a.yaml',
          },
          {
            caseId: 'failed',
            caseIndex: 1,
            documentId: 'b.yaml',
            status: 'failed',
            name: 'checkout',
            projectName: 'web',
            sourcePath: 'b.yaml',
          },
        ],
        summaryPath: '/repo/summary.json',
        reportPath: '/repo/report/index.html',
      };
      writeGitHubSummary(result);
      writeGitHubSummary(result);
      const output = readFileSync(join(dir, 'summary.md'), 'utf8');
      expect(output.match(/## Midscene Test/g)).toHaveLength(2);
      expect(output).toContain('| 1 | 1 | 2 | 1 | 1.3s |');
      expect(output).toContain('Failed: **checkout**');
      expect(output).not.toContain('old attempt');
      expect(
        output.match(
          /!\[Midscene Test: 1 passed, 1 failed\]\(https:\/\/badge\.midscenejs\.com\/e2e\?pass=1&fail=1&style=large\)/g,
        ),
      ).toHaveLength(2);
      expect(output).toContain('/repo/report/index.html');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('shows paths with markdown-sensitive characters literally in code spans', () => {
    const dir = mkdtempSync(join(tmpdir(), 'midscene-github-summary-'));
    try {
      rs.stubEnv('GITHUB_ACTIONS', 'true');
      rs.stubEnv('GITHUB_STEP_SUMMARY', join(dir, 'summary.md'));
      writeGitHubSummary({
        schemaVersion: 3,
        runId: 'github-summary-paths',
        startedAt: '2026-10-20T00:00:00.000Z',
        endedAt: '2026-10-20T00:00:01.000Z',
        durationMs: 1000,
        status: 'failed',
        exitCode: 1,
        resultDir: '/work/R&D',
        reportDir: '/work/R&D/report',
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          notRun: 0,
          passedAfterRetry: 0,
          finalPassRate: 0,
          firstPassRate: 0,
          filtered: 0,
          collectionErrors: 0,
          documentFailures: 0,
          projectFailures: 0,
        },
        projects: [],
        documents: [],
        collectionErrors: [],
        cases: [
          {
            caseId: 'failed',
            caseIndex: 0,
            documentId: 'cases/<draft>/user`s login.yaml',
            status: 'failed',
            name: 'login',
            projectName: 'web',
            sourcePath: 'cases/<draft>/user`s login.yaml',
          },
        ],
        summaryPath: '/work/R&D/summary.json',
        reportPath: '/work/R&D/report/index.html',
      });
      const output = readFileSync(join(dir, 'summary.md'), 'utf8');
      // Entity references are not decoded inside code spans, so the path
      // text must appear as is, with a fence longer than its backticks.
      expect(output).toContain(
        'Failed: **login** — web/``cases/<draft>/user`s login.yaml``',
      );
      expect(output).toContain(
        'Report artifact entry: `/work/R&D/report/index.html`',
      );
      expect(output).toContain('Structured results: `/work/R&D/summary.json`');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
