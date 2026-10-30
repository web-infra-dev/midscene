import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  TestRunReportCase,
  TestRunReportDocument,
  TestRunReportDump,
  TestRunReportError,
  TestRunReportSourceIndex,
  TestRunReportStep,
} from '@midscene/core';
import type { TestProjectRunResult } from '../cli/types';
import { buildTestRunReportDump } from './test-run-report';

// XML 1.0 cannot carry most control characters, even escaped.
const isXmlCharacter = (code: number): boolean =>
  code === 0x09 ||
  code === 0x0a ||
  code === 0x0d ||
  (code >= 0x20 && code !== 0xfffe && code !== 0xffff);

const xml = (value: string): string =>
  Array.from(value)
    .filter((character) => isXmlCharacter(character.codePointAt(0) ?? 0))
    .join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const seconds = (ms = 0): string => (ms / 1000).toFixed(3);

const attributes = (values: Record<string, string | number | undefined>) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${xml(String(value))}"`)
    .join('');

const stepErrors = (steps: readonly TestRunReportStep[]): string[] =>
  steps
    .filter((step) => step.status === 'failed')
    .map(
      (step) =>
        `${step.phase} / ${step.title ?? step.node}: ${step.error?.message ?? 'Step failed'}`,
    );

const errorLines = (
  label: string,
  errors: readonly TestRunReportError[] = [],
) => errors.map((error) => `${label}: ${error.message}`);

interface JUnitCase {
  name: string;
  classname: string;
  file: string;
  timeMs: number;
  outcome?: {
    kind: 'failure' | 'error' | 'skipped';
    message: string;
    detail?: string;
  };
}

const caseOutcome = (testCase: TestRunReportCase): JUnitCase['outcome'] => {
  if (testCase.status === 'success') return undefined;
  if (testCase.status === 'not-run')
    return { kind: 'skipped', message: testCase.notRunReason ?? 'Not run' };
  const last = testCase.attempts.at(-1);
  const lines = last
    ? [
        ...stepErrors([...last.beforeEach, ...last.steps, ...last.afterEach]),
        ...errorLines('teardown', last.teardownErrors),
        ...(last.hostErrors ?? []).map(
          (failure) => `${failure.phase}: ${failure.error.message}`,
        ),
      ]
    : [];
  return {
    kind: 'failure',
    message: lines[0] ?? 'Case failed',
    ...(lines.length ? { detail: lines.join('\n') } : {}),
  };
};

const documentCases = (
  document: TestRunReportDocument,
  classname: string,
): JUnitCase[] => {
  const cases: JUnitCase[] = document.cases.map((testCase) => ({
    name: testCase.name,
    classname,
    file: document.sourcePath,
    timeMs: testCase.attempts.reduce(
      (total, attempt) => total + attempt.durationMs,
      0,
    ),
    outcome: caseOutcome(testCase),
  }));
  // Failures outside any Case still fail the run, so they get a test case of
  // their own instead of disappearing from the CI test view.
  const fileErrors = [
    ...stepErrors([...document.beforeAll, ...document.afterAll]),
    ...errorLines('teardown', document.teardownErrors),
    ...(document.hostErrors ?? []).map(
      (failure) => `${failure.phase}: ${failure.error.message}`,
    ),
  ];
  if (fileErrors.length)
    cases.push({
      name: '(file hooks)',
      classname,
      file: document.sourcePath,
      timeMs: 0,
      outcome: {
        kind: 'error',
        message: fileErrors[0],
        detail: fileErrors.join('\n'),
      },
    });
  return cases;
};

const renderSuite = (
  name: string,
  cases: readonly JUnitCase[],
  timestamp?: string,
  timeMs = cases.reduce((total, item) => total + item.timeMs, 0),
): string => {
  const count = (kind: NonNullable<JUnitCase['outcome']>['kind']) =>
    cases.filter((item) => item.outcome?.kind === kind).length;
  const body = cases.map((item) => {
    const open = `    <testcase${attributes({
      name: item.name,
      classname: item.classname,
      file: item.file,
      time: seconds(item.timeMs),
    })}`;
    if (!item.outcome) return `${open}/>`;
    const { kind, message, detail } = item.outcome;
    const outcome =
      kind === 'skipped'
        ? `<skipped${attributes({ message })}/>`
        : `<${kind}${attributes({ message })}>${xml(detail ?? message)}</${kind}>`;
    return `${open}>\n      ${outcome}\n    </testcase>`;
  });
  return [
    `  <testsuite${attributes({
      name,
      tests: cases.length,
      failures: count('failure'),
      errors: count('error'),
      skipped: count('skipped'),
      time: seconds(timeMs),
      timestamp,
    })}>`,
    ...body,
    '  </testsuite>',
  ].join('\n');
};

/** Render the run as JUnit XML: one testsuite per YAML file, one testcase per Case. */
export function renderTestResultJUnit(dump: TestRunReportDump): string {
  const suites: { name: string; cases: JUnitCase[]; xml: string }[] = [];
  const multipleProjects = dump.projects.length > 1;
  for (const project of dump.projects) {
    const prefix = multipleProjects ? `${project.name} / ` : '';
    const projectErrors = [
      ...(project.lifecycle?.setupError
        ? [`setup: ${project.lifecycle.setupError.message}`]
        : []),
      ...errorLines('teardown', project.lifecycle?.teardownErrors),
    ];
    if (projectErrors.length) {
      const cases: JUnitCase[] = [
        {
          name: '(project lifecycle)',
          classname: project.name,
          file: '',
          timeMs: project.lifecycle?.durationMs ?? 0,
          outcome: {
            kind: 'error',
            message: projectErrors[0],
            detail: projectErrors.join('\n'),
          },
        },
      ];
      suites.push({
        name: project.name,
        cases,
        xml: renderSuite(project.name, cases, project.lifecycle?.startedAt),
      });
    }
    for (const error of project.collectionErrors) {
      const cases: JUnitCase[] = [
        {
          name: '(collection)',
          classname: error.sourcePath,
          file: error.sourcePath,
          timeMs: 0,
          outcome: { kind: 'error', message: error.error.message },
        },
      ];
      const name = `${prefix}${error.sourcePath}`;
      suites.push({ name, cases, xml: renderSuite(name, cases) });
    }
    for (const document of project.documents) {
      const name = `${prefix}${document.sourcePath}`;
      const cases = documentCases(
        document,
        document.sourcePath.replace(/\\/g, '/').replace(/\.(?:yaml|yml)$/, ''),
      );
      suites.push({
        name,
        cases,
        xml: renderSuite(name, cases, document.startedAt, document.durationMs),
      });
    }
  }
  const all = suites.flatMap((suite) => suite.cases);
  const count = (kind: NonNullable<JUnitCase['outcome']>['kind']) =>
    all.filter((item) => item.outcome?.kind === kind).length;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites${attributes({
      name: 'Midscene Test',
      tests: all.length,
      failures: count('failure'),
      errors: count('error'),
      skipped: count('skipped'),
      time: seconds(dump.durationMs),
      timestamp: dump.startedAt,
    })}>`,
    ...suites.map((suite) => suite.xml),
    '</testsuites>',
    '',
  ].join('\n');
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

/** Write junit.xml beside summary.json so CI systems can show Case results natively. */
export async function writeTestResultJUnit(
  result: TestProjectRunResult,
  index: TestRunReportSourceIndex = emptyIndex(),
): Promise<string> {
  const output = join(dirname(result.summaryPath), 'junit.xml');
  await writeFile(
    output,
    renderTestResultJUnit(buildTestRunReportDump(result, index)),
  );
  return output;
}
