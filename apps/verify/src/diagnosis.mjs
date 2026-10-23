// A visual assertion failure is an observation, not a confirmed product defect.
export function diagnose(report) {
  const reasons = report.functionalGate.blockingReasons;
  if (
    reasons.some(({ code }) =>
      ['STALE_REVISION', 'DEPLOYMENT_REVISION_MISMATCH'].includes(code),
    ) ||
    [
      report.execution.observedRevisionBefore,
      report.execution.observedRevisionAfter,
    ].some((sha) => sha && sha !== report.subject.headSha)
  )
    return {
      category: 'revision-mismatch',
      nextAction: 'Verify the current PR deployment and rerun.',
    };
  const assertion = report.criteria.find(
    (item) =>
      item.status === 'failed' && item.errorCode === 'STEP_EXECUTION_FAILED',
  );
  if (assertion)
    return {
      category: 'assertion-failed',
      criterionId: assertion.id,
      nextAction:
        'Inspect the screenshot and trace; a visual model failure does not by itself confirm a product defect.',
    };
  if (report.planning && report.planning.status !== 'ready')
    return {
      category: 'planning-incomplete',
      nextAction:
        'Resolve the plan findings or missing requirements before execution.',
    };
  if (report.execution.errorCode === 'ACTION_EXECUTION_FAILED')
    return {
      category: 'action-incomplete',
      nextAction:
        'Inspect the failed action and browser trace; the expected outcome was not verified.',
    };
  if (report.execution.status !== 'completed')
    return {
      category: 'execution-error',
      nextAction:
        'Check preview availability, model service and runner logs before rerunning.',
    };
  if (report.functionalGate.status !== 'satisfied')
    return {
      category: 'evidence-incomplete',
      nextAction:
        'Inspect missing evidence or incomplete criterion records; do not accept this result.',
    };
  return {
    category: 'passed',
    nextAction: 'Review coverage and other repository merge requirements.',
  };
}
