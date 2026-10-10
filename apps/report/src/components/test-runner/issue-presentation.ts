import type { TestRunReportError, TestRunReportStep } from '@midscene/core';
import type { ReportIssue } from './issues';

const titles: Record<string, string> = {
  STEP_TIMEOUT: 'The step exceeded its time limit',
  NODE_EXECUTION_ERROR: 'The step failed',
  RESOURCE_CLEANUP_FAILED: 'Resource cleanup failed',
  RESOURCE_CLEANUP_PENDING:
    'Resource cleanup is waiting for an operation to finish',
  OPERATION_PENDING:
    'An operation was still running when the report was captured',
  PARTIAL_MODEL_METRICS:
    'Model usage totals are incomplete and may be higher than shown',
  MODEL_METRICS_UNKNOWN: 'Model usage totals are unavailable',
  PARTIAL_EVIDENCE: 'Some execution evidence is missing from this report',
  EVIDENCE_COLLECTION_FAILED: 'Execution evidence could not be collected',
  REPORT_SNAPSHOT_FAILED: 'Execution evidence could not be saved',
  AGENT_DETAIL_UNAVAILABLE: 'Agent execution details are unavailable',
  AGENT_REPORT_MISSING:
    'The recording cannot be shown because its Agent report is missing',
  OPERATION_ERROR: 'An operation reported an additional error',
  CASE_NOT_STARTED: 'The case could not start',
  STEP_NOT_FOUND: 'The requested step could not be found',
  'agent-detail-unresolved': 'Agent execution details could not be found',
  'agent-detail-unavailable': 'Agent execution details are unavailable',
  'agent-source-unavailable': 'An Agent report source could not be read',
  'run-infrastructure-error': 'The test environment failed',
};
const metricLabels: Record<string, string> = {
  modelCallCount: 'model call count',
  modelTimeMs: 'model time',
  totalTokens: 'token total',
};

const hasAssertionFailure = (error: TestRunReportError): boolean =>
  error.name === 'AssertionError' ||
  /\bAssertion failed\b/i.test(error.message) ||
  Boolean(error.cause && hasAssertionFailure(error.cause)) ||
  Boolean(error.errors?.some(hasAssertionFailure));

export function getStepIssueTitle(
  step: TestRunReportStep,
  blockedStepCount = 0,
): string {
  const subject = {
    beforeAll: 'Document setup',
    beforeEach: 'Case setup',
    steps: 'Step',
    afterEach: 'Case teardown',
    afterAll: 'Document teardown',
  }[step.phase];
  const failure =
    step.error?.code === 'STEP_TIMEOUT'
      ? 'timed out'
      : step.error && hasAssertionFailure(step.error)
        ? 'assertion failed'
        : 'failed';
  const title = `${subject} ${failure}`;
  if (step.phase === 'beforeAll') return `${title}; cases could not start`;
  return blockedStepCount > 0
    ? `${title}; ${blockedStepCount} later ${blockedStepCount === 1 ? 'step' : 'steps'} not run`
    : title;
}

export function getIssuePresentation(issue: ReportIssue) {
  const title = issue.title ?? titles[issue.code] ?? issue.message;
  const usage = issue.context?.modelUsage as
    | { collection?: { fields?: Record<string, string> } }
    | undefined;
  const fields = usage?.collection?.fields ?? issue.context?.fields;
  const missingFields =
    fields && typeof fields === 'object'
      ? Object.entries(fields)
          .filter(([, status]) => status !== 'complete')
          .map(([field]) => metricLabels[field])
          .filter(Boolean)
      : [];
  const usageImpact = missingFields.length
    ? `The ${missingFields.join(', ')} could not be fully collected; displayed values may undercount usage.`
    : 'Some model usage data is missing. The reported call count, model time or token total may undercount actual usage.';
  const message = usage
    ? `${issue.error?.cause?.message ?? issue.error?.message ?? issue.message} ${usageImpact}`
    : issue.code === 'PARTIAL_MODEL_METRICS'
      ? usageImpact
      : issue.code === 'MODEL_METRICS_UNKNOWN'
        ? 'The report could not collect reliable model usage totals. Unavailable values are shown as —.'
        : [
              'REPORT_SNAPSHOT_FAILED',
              'NODE_EXECUTION_ERROR',
              'RESOURCE_CLEANUP_FAILED',
            ].includes(issue.code)
          ? (issue.error?.cause?.message ?? issue.message)
          : issue.message;
  const reasons = Array.isArray(issue.context?.reasons)
    ? issue.context.reasons.filter(
        (reason): reason is string => typeof reason === 'string',
      )
    : [];
  return {
    title,
    message: message === title ? undefined : message,
    reasons: [...new Set(reasons)],
  };
}
