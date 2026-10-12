import { writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type {
  TestRunReportDump,
  TestRunReportSourceIndex,
  TestRunReportStep,
} from '@midscene/core';
import type { TestProjectRunResult } from '../cli/types';
import { buildTestRunReportDump } from './test-run-report';

const text = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('|', '&#124;')
    .replaceAll('[', '&#91;')
    .replaceAll(']', '&#93;')
    .replaceAll('*', '&#42;')
    .replaceAll('_', '&#95;')
    .replaceAll('`', '&#96;')
    .replaceAll('\\', '&#92;')
    .replace(/[\r\n]+/g, ' ');

const duration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};
const href = (from: string, target: string): string =>
  relative(dirname(from), target).split(sep).map(encodeURIComponent).join('/');

export interface TestResultMarkdownOptions {
  /** Relative or hosted URL of the HTML report. */
  reportHref?: string;
}

/** Render the same sanitized execution facts used by the HTML report. */
export function renderTestResultMarkdown(
  dump: TestRunReportDump,
  options: TestResultMarkdownOptions = {},
): string {
  const { summary } = dump;
  const outcome =
    dump.status === 'success'
      ? `✅ **${summary.passed}/${summary.total} passed**`
      : `❌ **${summary.failed} failed** · ${summary.passed} passed · ${summary.notRun} not run`;
  const lines = [
    '## Midscene Test',
    '',
    `${outcome} · ${duration(dump.durationMs)}`,
    '',
  ];
  if (summary.filtered) lines.push(`**Filtered:** ${summary.filtered}`, '');
  const infrastructure = [
    summary.collectionErrors
      ? `${summary.collectionErrors} collection errors`
      : '',
    summary.documentFailures
      ? `${summary.documentFailures} document failures`
      : '',
    summary.projectFailures
      ? `${summary.projectFailures} project failures`
      : '',
  ].filter(Boolean);
  if (infrastructure.length)
    lines.push(`**Infrastructure:** ${infrastructure.join(' · ')}`, '');
  const groups: { name: string; rows: string[] }[] = [];
  const errors: string[] = [];
  const recordSteps = (label: string, steps: readonly TestRunReportStep[]) => {
    for (const step of steps) {
      if (step.status === 'failed')
        errors.push(
          `${label} / ${step.node}: ${step.error?.message ?? 'Step failed'}`,
        );
    }
  };
  for (const project of dump.projects) {
    if (project.lifecycle?.setupError)
      errors.push(`${project.name}: ${project.lifecycle.setupError.message}`);
    for (const error of project.lifecycle?.teardownErrors ?? [])
      errors.push(`${project.name}: ${error.message}`);
    for (const error of project.collectionErrors)
      errors.push(
        `${project.name} / ${error.sourcePath}: ${error.error.message}`,
      );
    for (const document of project.documents) {
      const name = document.sourcePath
        .replace(/\\/g, '/')
        .replace(/\.(?:yaml|yml)$/, '');
      const group = {
        name: dump.projects.length > 1 ? `${project.name} / ${name}` : name,
        rows: [] as string[],
      };
      groups.push(group);
      recordSteps(`${project.name} / ${document.sourcePath}`, [
        ...document.beforeAll,
        ...document.afterAll,
      ]);
      for (const error of document.teardownErrors ?? [])
        errors.push(`${document.sourcePath}: ${error.message}`);
      for (const failure of document.hostErrors ?? [])
        errors.push(
          `${document.sourcePath} / ${failure.phase}: ${failure.error.message}`,
        );
      for (const testCase of document.cases) {
        const attempt = testCase.attempts.at(-1);
        const steps = attempt
          ? [...attempt.beforeEach, ...attempt.steps, ...attempt.afterEach]
          : [];
        const failedSteps = steps.filter((step) => step.status === 'failed');
        const step =
          failedSteps.at(-1) ??
          [...steps].reverse().find((item) => item.agentDetails?.length) ??
          steps.at(-1);
        const route = new URLSearchParams({
          'runner-page': 'case',
          'runner-project': project.projectId,
          'runner-case': testCase.caseId,
          ...(step ? { 'runner-step': step.id } : {}),
        });
        const target = options.reportHref
          ? `${options.reportHref}#${route}`
          : undefined;
        const name = target
          ? `[${text(testCase.name)}](<${target}>)`
          : text(testCase.name);
        group.rows.push(
          `  - ${testCase.status === 'success' ? '✅' : testCase.status === 'not-run' ? '⏭️' : '❌'} ${name}`,
        );
      }
    }
  }
  for (const diagnostic of dump.diagnostics ?? []) {
    if (diagnostic.level === 'error') errors.push(diagnostic.message);
  }
  if (errors.length)
    lines.push(
      '### Execution errors',
      '',
      ...errors.map((error) => `- ${text(error)}`),
      '',
    );
  for (const group of groups) {
    if (group.rows.length) lines.push(`- ${text(group.name)}`, ...group.rows);
  }
  if (!groups.some((group) => group.rows.length))
    lines.push('No cases were reported.');
  if (options.reportHref)
    lines.push(
      '',
      `[Open the Midscene Test report ↗](<${options.reportHref}>)`,
    );
  return `${lines.join('\n')}\n`;
}

const emptyIndex = (): TestRunReportSourceIndex => ({
  sources: [],
  metrics: {
    modelCallCount: 0,
    modelTimeMs: 0,
    promptTokens: 0,
    cachedInputTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
});

/** Write a per-run Markdown artifact even when HTML publication fails or is disabled. */
export async function writeTestResultMarkdown(
  result: TestProjectRunResult,
  index: TestRunReportSourceIndex = emptyIndex(),
): Promise<string> {
  const output = join(dirname(result.summaryPath), 'result.md');
  const dump = buildTestRunReportDump(result, index);
  await writeFile(
    output,
    renderTestResultMarkdown(dump, {
      ...(result.reportPath
        ? { reportHref: href(output, result.reportPath) }
        : {}),
    }),
  );
  return output;
}
