import { appendFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { formatDuration } from './terminal-reporter';
import type { TestProjectRunResult } from './types';

const escapeData = (text: string) =>
  text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = (text: string) =>
  escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
const markdown = (text: string) =>
  text.replace(
    /[&<>`\r\n]/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '`': '&#96;',
        '\r': ' ',
        '\n': ' ',
      })[char]!,
  );

/** Annotations use real source files. Step positions remain in the title when no source line is available. */
export function githubFailureAnnotation(
  source: string,
  message: string,
  file?: string,
): string | undefined {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const path = file
    ? relative(workspace, resolve(file)).split(sep).join('/')
    : undefined;
  return `::error ${path ? `file=${escapeProperty(path)},` : ''}title=${escapeProperty(source)}::${escapeData(message)}`;
}

export function writeGitHubSummary(result: TestProjectRunResult): void {
  const output = process.env.GITHUB_STEP_SUMMARY;
  if (process.env.GITHUB_ACTIONS !== 'true' || !output) return;
  const failedCases = [
    ...new Map(result.cases.map((item) => [item.caseId, item])).values(),
  ].filter((item) => item.status === 'failed');
  const summary = [
    '## Midscene Test',
    '',
    '| Passed | Failed | Not run | Passed after retry | Duration |',
    '| ---: | ---: | ---: | ---: | ---: |',
    `| ${result.summary.passed} | ${result.summary.failed} | ${result.summary.notRun} | ${result.summary.passedAfterRetry} | ${formatDuration(result.durationMs)} |`,
    '',
    'Passed after retry is included in Passed.',
    '',
    ...failedCases.map(
      (item) =>
        `- Failed: **${markdown(item.name)}** — ${markdown(item.projectName)}/\`${markdown(item.sourcePath)}\``,
    ),
    ...(result.summary.collectionErrors
      ? [`- Collection errors: ${result.summary.collectionErrors}`]
      : []),
    ...(result.summary.documentFailures
      ? [`- Failed files: ${result.summary.documentFailures}`]
      : []),
    ...(result.summary.projectFailures
      ? [`- Failed projects: ${result.summary.projectFailures}`]
      : []),
    '',
    ...(result.reportPath
      ? [`Report artifact entry: \`${markdown(result.reportPath)}\``]
      : []),
    `Structured results: \`${markdown(result.summaryPath)}\``,
    '',
  ].join('\n');
  appendFileSync(output, `${summary}\n`);
}
