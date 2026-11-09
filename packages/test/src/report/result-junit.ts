import type {
  TestRunReportCase,
  TestRunReportDocument,
  TestRunReportDump,
  TestRunReportError,
  TestRunReportStep,
} from '@midscene/core';

type Outcome = 'failure' | 'error' | 'skipped';
interface JUnitCase {
  name: string;
  className: string;
  file: string;
  durationMs: number;
  outcome?: { type: Outcome; message: string; details?: string };
}

const validXMLChar = (code: number): boolean =>
  code === 9 || code === 10 || code === 13 ||
  (code >= 32 && code <= 0xd7ff) ||
  (code >= 0xe000 && code <= 0xfffd) ||
  (code >= 0x10000 && code <= 0x10ffff);

const escapeXML = (value: string): string =>
  Array.from(value).filter((c) => validXMLChar(c.codePointAt(0)!)).join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const attrs = (entries: Record<string, string | number | undefined>): string =>
  Object.entries(entries).filter(([, value]) => value !== undefined)
    .map(([key, value]) => ' ' + key + '="' + escapeXML(String(value)) + '"').join('');

const seconds = (ms: number): string => (ms / 1000).toFixed(3);

const stepFailures = (steps: readonly TestRunReportStep[]): string[] =>
  steps.filter((step) => step.status === 'failed')
    .map((step) => step.phase + ' / ' + (step.title ?? step.node) + ': ' +
      (step.error?.message ?? 'Step failed'));

const failureMessages = (label: string, errors: readonly TestRunReportError[] = []): string[] =>
  errors.map((error) => label + ': ' + error.message);

const caseResult = (testCase: TestRunReportCase): JUnitCase['outcome'] => {
  if (testCase.status === 'success') return undefined;
  if (testCase.status === 'not-run')
    return { type: 'skipped', message: String(testCase.notRunReason ?? 'Not run') };
  const last = testCase.attempts.at(-1);
  const messages = last
    ? [
        ...stepFailures([...last.beforeEach, ...last.steps, ...last.afterEach]),
        ...failureMessages('teardown', last.teardownErrors),
        ...(last.hostErrors ?? []).map((failure) =>
          failure.phase + ': ' + failure.error.message),
      ]
    : [];
  return {
    type: 'failure',
    message: messages[0] ?? 'Case failed',
    ...(messages.length ? { details: messages.join('\n') } : {}),
  };
};

const documentResults = (document: TestRunReportDocument, className: string): JUnitCase[] => {
  const cases: JUnitCase[] = document.cases.map((testCase) => ({
    name: testCase.name,
    className,
    file: document.sourcePath,
    durationMs: testCase.attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0),
    outcome: caseResult(testCase),
  }));
  const errors = [
    ...stepFailures([...document.beforeAll, ...document.afterAll]),
    ...failureMessages('teardown', document.teardownErrors),
    ...(document.hostErrors ?? []).map((failure) =>
      failure.phase + ': ' + failure.error.message),
  ];
  if (errors.length)
    cases.push({
      name: '(file hooks)',
      className,
      file: document.sourcePath,
      durationMs: 0,
      outcome: { type: 'error', message: errors[0], details: errors.join('\n') },
    });
  return cases;
};

const tally = (cases: readonly JUnitCase[], kind: Outcome): number =>
  cases.filter((item) => item.outcome?.type === kind).length;

function renderSuite(
  name: string, cases: readonly JUnitCase[], timestamp?: string, durationMs?: number,
): string {
  const body = cases.map((item) => {
    const tag = '    <testcase' + attrs({
      name: item.name,
      classname: item.className,
      file: item.file,
      time: seconds(item.durationMs),
    });
    if (!item.outcome) return tag + '/>';
    const { type, message, details } = item.outcome;
    const state = type === 'skipped'
      ? '<skipped' + attrs({ message }) + '/>'
      : '<' + type + attrs({ message }) + '>' +
        escapeXML(details ?? message) + '</' + type + '>';
    return tag + '>\n      ' + state + '\n    </testcase>';
  });
  return [
    '  <testsuite' + attrs({
      name,
      tests: cases.length,
      failures: tally(cases, 'failure'),
      errors: tally(cases, 'error'),
      skipped: tally(cases, 'skipped'),
      time: seconds(durationMs ?? cases.reduce((sum, item) => sum + item.durationMs, 0)),
      timestamp,
    }) + '>',
    ...body,
    '  </testsuite>',
  ].join('\n');
}

/** JUnit XML for a complete native Test run, including failures outside individual Cases. */
export function renderTestResultJUnit(dump: TestRunReportDump): string {
  const suites: string[] = [];
  const all: JUnitCase[] = [];
  const add = (name: string, cases: JUnitCase[], timestamp?: string, durationMs?: number) => {
    suites.push(renderSuite(name, cases, timestamp, durationMs));
    all.push(...cases);
  };

  const infra = (dump.diagnostics ?? []).filter((error) => error.code === 'run-infrastructure-error');
  if (infra.length)
    add('Midscene Test', [{
      name: '(run infrastructure)', className: 'Midscene Test', file: '',
      durationMs: 0,
      outcome: {
        type: 'error',
        message: infra[0].message,
        details: infra.map((error) => error.message).join('\n'),
      },
    }], dump.startedAt);

  for (const project of dump.projects) {
    const prefix = dump.projects.length > 1 ? project.name + ' / ' : '';
    const lifecycleErrors = [
      ...(project.lifecycle?.setupError ? ['setup: ' + project.lifecycle.setupError.message] : []),
      ...failureMessages('teardown', project.lifecycle?.teardownErrors),
    ];
    if (lifecycleErrors.length)
      add(project.name, [{
        name: '(project lifecycle)',
        className: project.name,
        file: '',
        durationMs: project.lifecycle?.durationMs ?? 0,
        outcome: { type: 'error', message: lifecycleErrors[0], details: lifecycleErrors.join('\n') },
      }], project.lifecycle?.startedAt);
    for (const error of project.collectionErrors) {
      const source = error.sourcePath;
      add(prefix + source, [{
        name: '(collection)', className: source, file: source, durationMs: 0,
        outcome: { type: 'error', message: error.error.message },
      }]);
    }
    for (const document of project.documents) {
      const name = prefix + document.sourcePath;
      const className = document.sourcePath.replace(/\\/g, '/').replace(/\.(yaml|yml)$/, '');
      add(name, documentResults(document, className), document.startedAt, document.durationMs);
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites' + attrs({
      name: 'Midscene Test',
      tests: all.length,
      failures: tally(all, 'failure'),
      errors: tally(all, 'error'),
      skipped: tally(all, 'skipped'),
      time: seconds(dump.durationMs),
      timestamp: dump.startedAt,
    }) + '>',
    ...suites,
    '</testsuites>',
    '',
  ].join('\n');
}
