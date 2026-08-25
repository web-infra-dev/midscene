/**
 * Run real Midscene YAML tests to generate reports, then create demo files:
 * - demo.html: single report (passed case)
 * - demo-merged.html: merged report with both passed and failed cases
 * - demo-test-runner.html: unified Runner hierarchy plus Agent details
 *
 * Usage: node scripts/generate-demo-report.mjs
 * Reuse an existing Agent report while iterating on the UI:
 * MIDSCENE_DEMO_SOURCE_REPORT=/absolute/report.html node scripts/generate-demo-report.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const repoRoot = path.join(rootDir, '..', '..');
const distDir = path.join(rootDir, 'dist');

// Resolve report directory the same way the runtime does (respects MIDSCENE_RUN_DIR)
const runDir = process.env.MIDSCENE_RUN_DIR || 'midscene_run';
const reportDir = path.resolve(repoRoot, runDir, 'report');

const cliPath = path.join(repoRoot, 'packages', 'cli', 'bin', 'midscene');

/**
 * Run a YAML file and return the path to the newly generated report.
 * The CLI exits non-zero on any assertion failure or AI timeout, but
 * the report is still generated. We catch and check for the report file.
 */
function runYamlAndFindReport(yamlPath) {
  const before = new Set(listGeneratedReportFiles());

  try {
    execFileSync('node', [cliPath, yamlPath], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch {
    console.log(
      'Test exited with errors, but report may still have been generated.',
    );
  }

  const after = listGeneratedReportFiles();
  const newReports = after.filter((filePath) => !before.has(filePath));

  if (newReports.length === 0) {
    console.error(`No new report generated for ${path.basename(yamlPath)}.`);
    return null;
  }

  const latest = newReports
    .map((filePath) => ({
      filePath,
      mtime: fs.statSync(filePath).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)[0].filePath;

  return latest;
}

function listGeneratedReportFiles() {
  if (!fs.existsSync(reportDir)) {
    return [];
  }

  const entries = fs.readdirSync(reportDir, { withFileTypes: true });
  const reportFiles = [];

  for (const entry of entries) {
    const entryPath = path.join(reportDir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.html')) {
      reportFiles.push(entryPath);
      continue;
    }

    if (entry.isDirectory()) {
      const nestedIndexPath = path.join(entryPath, 'index.html');
      if (fs.existsSync(nestedIndexPath)) {
        reportFiles.push(nestedIndexPath);
      }
    }
  }

  return reportFiles;
}

function copyReportWithUniqueGroupId(sourcePath, targetPath, suffix) {
  let rewrittenGroupCount = 0;
  const sourceHtml = fs.readFileSync(sourcePath, 'utf8');
  const targetHtml = sourceHtml.replace(
    /(<script\b[^>]*\bdata-group-id=")([^"]+)("[^>]*>)/g,
    (_match, prefix, groupId, postfix) => {
      rewrittenGroupCount += 1;
      return `${prefix}${groupId}-${suffix}${postfix}`;
    },
  );

  if (rewrittenGroupCount === 0) {
    throw new Error(`No report group IDs found in ${sourcePath}.`);
  }

  fs.writeFileSync(targetPath, targetHtml);
}

// --- Generate reports ---

console.log('=== Generating passed report ===');
const passedYaml = path.join(rootDir, 'scripts', 'generate-report.yaml');
const requestedSourceReport = process.env.MIDSCENE_DEMO_SOURCE_REPORT;
const passedReport = requestedSourceReport
  ? path.resolve(repoRoot, requestedSourceReport)
  : runYamlAndFindReport(passedYaml);
if (requestedSourceReport && !fs.existsSync(passedReport)) {
  console.error(`Demo source report does not exist: ${passedReport}`);
  process.exit(1);
}
if (requestedSourceReport) {
  console.log(`Reusing Agent report: ${passedReport}`);
}
if (!passedReport) {
  console.error('Failed to generate passed report.');
  process.exit(1);
}

// --- Copy single report as demo.html ---
fs.mkdirSync(distDir, { recursive: true });
const demoPath = path.join(distDir, 'demo.html');
fs.copyFileSync(passedReport, demoPath);
console.log(`Copied ${path.basename(passedReport)} -> dist/demo.html`);

// A merged report identifies cases by each source report's group ID. Create a
// second source with unique group IDs so the same model run can represent the
// failed fixture without being collapsed into the passed case.
const failedReportSource = path.join(distDir, '.failed-report-source.html');
copyReportWithUniqueGroupId(passedReport, failedReportSource, 'failed');

// --- Merge reports into demo-merged.html ---
// Import ReportMergingTool dynamically (it's CJS from @midscene/core dist)
const corePath = path.join(
  repoRoot,
  'packages',
  'core',
  'dist',
  'lib',
  'report.js',
);
const { ReportMergingTool, TestRunReportAssembler } = await import(corePath);

const merger = new ReportMergingTool();
merger.append({
  reportFilePath: passedReport,
  reportAttributes: {
    testDuration: 30000,
    testStatus: 'passed',
    testTitle: 'Login and verify inventory',
    testId: 'test-passed',
    testDescription: 'Login to saucedemo and verify products page',
  },
});
merger.append({
  reportFilePath: failedReportSource,
  reportAttributes: {
    testDuration: 25000,
    testStatus: 'failed',
    testTitle: 'Login with intentional failure',
    testId: 'test-failed',
    testDescription: 'Login to saucedemo with a failing assertion',
  },
});

const mergedPath = merger.mergeReports('demo-merged', { overwrite: true });
fs.unlinkSync(failedReportSource);
if (!mergedPath) {
  console.error('Failed to merge reports.');
  process.exit(1);
}

// Copy merged report to dist
const demoMergedPath = path.join(distDir, 'demo-merged.html');
fs.copyFileSync(mergedPath, demoMergedPath);
console.log('Copied merged report -> dist/demo-merged.html');

// --- Build a deterministic Test Runner report around the same Agent dump ---
const timestamp = '2026-08-20T08:00:00.000Z';
const setupCompletedTimestamp = '2026-08-20T08:00:02.000Z';
const firstAttemptCompletedTimestamp = '2026-08-20T08:00:03.000Z';
const retryCompletedTimestamp = '2026-08-20T08:00:06.000Z';
const testsCompletedTimestamp = '2026-08-20T08:00:07.000Z';
const completedTimestamp = '2026-08-20T08:00:08.000Z';
const baseStep = (id, node, status, stepIndex, extra = {}) => ({
  id,
  phase: 'steps',
  stepIndex,
  node,
  status,
  continuedAfterError: false,
  startedAt: timestamp,
  endedAt: completedTimestamp,
  durationMs: 8000,
  ...extra,
});
const testRunnerPath = new TestRunReportAssembler().assemble({
  outputDir: distDir,
  reportFileName: 'demo-test-runner',
  overwrite: true,
  sources: [{ scopeId: 'attempt-2', sourcePath: passedReport }],
  buildRunnerDump(index) {
    const report = index.sources[0];
    const executionId = report?.executionIds[0];
    if (!executionId) {
      throw new Error(
        'The Test Runner demo source has no stable execution ID.',
      );
    }
    return {
      schemaVersion: 1,
      kind: 'test-runner',
      runId: 'demo-run',
      status: 'success',
      startedAt: timestamp,
      endedAt: completedTimestamp,
      durationMs: 8000,
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
          platform: 'web',
          status: 'success',
          retry: 1,
          lifecycle: {
            status: 'success',
            startedAt: timestamp,
            endedAt: completedTimestamp,
            durationMs: 8000,
          },
          documents: [
            {
              documentId: 'checkout-document',
              sourcePath: 'checkout.yaml',
              status: 'success',
              startedAt: setupCompletedTimestamp,
              endedAt: testsCompletedTimestamp,
              durationMs: 5000,
              beforeAll: [
                baseStep(
                  'document-run:beforeAll:0',
                  'fixture.prepare',
                  'success',
                  0,
                  { phase: 'beforeAll', output: { summary: 'Fixture ready' } },
                ),
              ],
              cases: [
                {
                  caseId: 'checkout-case',
                  name: 'Checkout with retry',
                  caseIndex: 0,
                  status: 'success',
                  attempts: [
                    {
                      attemptId: 'attempt-1',
                      attemptIndex: 0,
                      status: 'failed',
                      startedAt: setupCompletedTimestamp,
                      endedAt: firstAttemptCompletedTimestamp,
                      durationMs: 1000,
                      beforeEach: [],
                      steps: [
                        baseStep(
                          'attempt-1:steps:0',
                          'order.create',
                          'failed',
                          0,
                          {
                            durationMs: 20,
                            input: {
                              value: {
                                sku: 'demo-item',
                                apiKey: '[REDACTED]',
                              },
                              redactedPaths: ['$.apiKey'],
                            },
                            error: {
                              name: 'NodeExecutionError',
                              message: 'Inventory was not ready.',
                              code: 'NODE_EXECUTION_ERROR',
                            },
                          },
                        ),
                      ],
                      afterEach: [],
                    },
                    {
                      attemptId: 'attempt-2',
                      attemptIndex: 1,
                      status: 'success',
                      startedAt: firstAttemptCompletedTimestamp,
                      endedAt: retryCompletedTimestamp,
                      durationMs: 3000,
                      beforeEach: [
                        baseStep(
                          'attempt-2:beforeEach:0',
                          'browser.open',
                          'success',
                          0,
                          {
                            phase: 'beforeEach',
                            durationMs: 10,
                            output: { summary: 'Browser opened' },
                          },
                        ),
                      ],
                      steps: [
                        baseStep('attempt-2:steps:0', 'aiAct', 'success', 0, {
                          title:
                            'Complete the checkout flow by selecting the saved address and submitting the demo order',
                          agentDetails: [
                            { reportId: report.reportId, executionId },
                          ],
                        }),
                      ],
                      afterEach: [
                        baseStep(
                          'attempt-2:afterEach:0',
                          'order.cleanup',
                          'success',
                          0,
                          {
                            phase: 'afterEach',
                            durationMs: 10,
                            output: { summary: 'Order cleaned up' },
                          },
                        ),
                      ],
                      scopeReportIds: [report.reportId],
                    },
                  ],
                },
                {
                  caseId: 'first-pass-case',
                  name: 'Verify cart summary',
                  caseIndex: 1,
                  status: 'success',
                  attempts: [
                    {
                      attemptId: 'attempt-3',
                      attemptIndex: 0,
                      status: 'success',
                      startedAt: retryCompletedTimestamp,
                      endedAt: testsCompletedTimestamp,
                      durationMs: 1000,
                      beforeEach: [],
                      steps: [
                        baseStep(
                          'attempt-3:steps:0',
                          'cart.verify',
                          'success',
                          0,
                          {
                            startedAt: retryCompletedTimestamp,
                            endedAt: testsCompletedTimestamp,
                            durationMs: 1000,
                            output: {
                              summary: 'Cart total and item count are correct',
                            },
                          },
                        ),
                      ],
                      afterEach: [],
                    },
                  ],
                },
              ],
              afterAll: [],
            },
          ],
          collectionErrors: [],
        },
      ],
    };
  },
});
console.log(`Created Test Runner demo -> ${testRunnerPath}`);
