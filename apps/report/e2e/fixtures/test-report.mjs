/**
 * Synthetic hierarchy for report UI tests; replay data comes from a real Agent run.
 * `pnpm --filter @midscene/report e2e` builds the app/CLI, then the existing demo
 * generator calls generateTestReportFixtures before running the YAML tests.
 * Generated reports stay in ignored dist/. Keep AI navigation/visual assertions
 * in YAML; deterministic hierarchy and lifecycle coverage lives in lifecycle.test.tsx.
 */
const at = (seconds) =>
  new Date(Date.UTC(2026, 7, 20, 8, 0, seconds)).toISOString();
const timing = (start, end) => ({
  startedAt: at(start),
  endedAt: at(end),
  durationMs: (end - start) * 1000,
});
const error = (message) => ({
  name: 'NodeExecutionError',
  code: 'NODE_EXECUTION_ERROR',
  message,
});
const step = (id, node, start, end, extra = {}) => ({
  id,
  node,
  phase: 'steps',
  stepIndex: 0,
  status: 'success',
  continuedAfterError: false,
  ...timing(start, end),
  ...extra,
});
const attempt = (id, index, start, end, steps, extra = {}) => ({
  attemptId: id,
  attemptIndex: index,
  status: 'success',
  ...timing(start, end),
  beforeEach: [],
  steps,
  afterEach: [],
  ...extra,
});

export function createTestReportFixture(index) {
  const source = index.sources[0];
  const executionId = source?.executionIds[0];
  if (!executionId)
    throw new Error('Report E2E fixture requires an Agent execution.');
  return {
    schemaVersion: 1,
    kind: 'test-runner',
    runId: 'report-e2e',
    status: 'success',
    ...timing(0, 8),
    summary: {
      total: 2,
      passed: 2,
      failed: 0,
      notRun: 0,
      filtered: 0,
      collectionErrors: 0,
      documentFailures: 0,
      projectFailures: 0,
    },
    metrics: index.metrics,
    projects: [
      {
        projectId: 'web-demo',
        name: 'Web regression',
        status: 'success',
        retry: 1,
        lifecycle: { status: 'success', ...timing(0, 8) },
        collectionErrors: [],
        documents: [
          {
            documentId: 'checkout-document',
            sourcePath: 'checkout.yaml',
            status: 'success',
            ...timing(2, 7),
            beforeAll: [
              step('document-run:beforeAll:0', 'fixture.prepare', 2, 2, {
                phase: 'beforeAll',
                output: { summary: 'Fixture ready' },
              }),
            ],
            afterAll: [],
            cases: [
              {
                caseId: 'checkout-case',
                name: 'Checkout with retry',
                caseIndex: 0,
                status: 'success',
                attempts: [
                  attempt(
                    'attempt-1',
                    0,
                    2,
                    3,
                    [
                      step('attempt-1:steps:0', 'order.create', 2, 3, {
                        status: 'failed',
                        error: error('Inventory was not ready.'),
                        input: {
                          value: { sku: 'demo-item', apiKey: '[REDACTED]' },
                          redactedPaths: ['$.apiKey'],
                        },
                      }),
                    ],
                    { status: 'failed' },
                  ),
                  attempt(
                    'attempt-2',
                    1,
                    3,
                    6,
                    [
                      step('attempt-2:steps:0', 'aiAct', 3, 6, {
                        title: 'Inspect the recorded Agent flow',
                        agentDetails: [
                          { reportId: source.reportId, executionId },
                        ],
                      }),
                    ],
                    {
                      scopeReportIds: [source.reportId],
                      beforeEach: [
                        step('attempt-2:beforeEach:0', 'browser.open', 3, 3, {
                          phase: 'beforeEach',
                          output: { summary: 'Browser opened' },
                        }),
                      ],
                      afterEach: [
                        step('attempt-2:afterEach:0', 'order.cleanup', 6, 6, {
                          phase: 'afterEach',
                          output: { summary: 'Order cleaned up' },
                        }),
                      ],
                    },
                  ),
                ],
              },
              {
                caseId: 'first-pass-case',
                name: 'Verify cart summary',
                caseIndex: 1,
                status: 'success',
                attempts: [
                  attempt('attempt-3', 0, 6, 7, [
                    step('attempt-3:steps:0', 'cart.verify', 6, 7, {
                      output: {
                        summary: 'Cart total and item count are correct',
                      },
                    }),
                  ]),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function createLifecycleReportFixture(index) {
  const dump = createTestReportFixture(index);
  dump.runId = 'report-e2e-lifecycle';
  dump.status = 'failed';
  dump.summary = {
    ...dump.summary,
    passed: 0,
    failed: 1,
    notRun: 1,
    documentFailures: 2,
    projectFailures: 1,
  };
  const project = dump.projects[0];
  project.status = 'failed';
  project.lifecycle.status = 'failed';
  project.lifecycle.teardownErrors = [
    error('Project browser disposal failed.'),
  ];
  const document = project.documents[0];
  document.status = 'failed';
  document.cases = [document.cases[1]];
  document.cases[0].status = 'failed';
  document.cases[0].attempts[0].status = 'failed';
  document.cases[0].attempts[0].teardownErrors = [
    error('Case session disposal failed.'),
  ];
  document.teardownErrors = [error('Document fixture disposal failed.')];
  project.documents.push({
    documentId: 'blocked-document',
    sourcePath: 'blocked.yaml',
    status: 'failed',
    ...timing(2, 3),
    beforeAll: [
      step('blocked:beforeAll:0', 'fixture.connect', 2, 3, {
        phase: 'beforeAll',
        status: 'failed',
        error: error('Database connection refused.'),
        input: { value: { host: 'fixture-database' } },
      }),
    ],
    afterAll: [],
    cases: [
      {
        caseId: 'blocked-case',
        name: 'Blocked by document setup',
        caseIndex: 0,
        status: 'not-run',
        attempts: [],
      },
    ],
  });
  return dump;
}

export function generateTestReportFixtures(Assembler, sourcePath, outputDir) {
  return [
    ['demo-midscene-test', createTestReportFixture],
    ['demo-midscene-test-lifecycle', createLifecycleReportFixture],
  ].map(([reportFileName, buildRunnerDump]) =>
    new Assembler().assemble({
      outputDir,
      reportFileName,
      overwrite: true,
      sources: [{ scopeId: 'attempt-2', sourcePath }],
      buildRunnerDump,
    }),
  );
}
