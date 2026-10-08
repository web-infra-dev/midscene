import type {
  TestRunReportDump,
  TestRunReportPlannedStep,
} from '@midscene/core';
import { ReportValue, formatDuration } from './view-primitives';

function PlannedSteps({
  phase,
  steps,
}: {
  phase: string;
  steps: readonly TestRunReportPlannedStep[];
}): JSX.Element | null {
  if (!steps.length) return null;
  return (
    <section>
      <h4>{phase}</h4>
      <ol>
        {steps.map((step) => (
          <li key={step.id}>
            <details>
              <summary>
                {step.node}: {step.title ?? step.node}
              </summary>
              <p>
                Timeout: {formatDuration(step.timeoutMs)} · Continue on error:{' '}
                {step.continueOnError ? 'yes' : 'no'}
              </p>
              {step.inputMode === 'template' ? (
                <p>
                  Variables remain as placeholders in the plan. Runtime values
                  are recorded on executed steps.
                </p>
              ) : null}
              <ReportValue value={step.input} />
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TestPlan({
  dump,
}: { dump: TestRunReportDump }): JSX.Element | null {
  const projects = dump.projects
    .map((project) => ({
      ...project,
      plans:
        project.plans ??
        project.documents.flatMap((document) =>
          document.plan ? [document.plan] : [],
        ),
    }))
    .filter((project) => project.plans.length);
  if (!projects.length) return null;
  return (
    <details className="runner-single-run-diagnostics">
      <summary>Test plan</summary>
      <p>
        The collected plan is independent of execution results. Filtered cases
        are excluded from run outcome counts.
      </p>
      {projects.map((project) => (
        <section key={project.projectId}>
          <h3>{project.name}</h3>
          {project.plans.map((document) => (
            <details key={document.documentId}>
              <summary>
                {document.sourcePath} · {document.cases.length} planned cases
              </summary>
              <p>
                Retry: {document.retry.scope} · {document.retry.count} retries
              </p>
              <PlannedSteps phase="Document setup" steps={document.beforeAll} />
              {document.cases.map((testCase) => (
                <details key={testCase.caseId}>
                  <summary>
                    {testCase.name} ·{' '}
                    {testCase.selected
                      ? 'Selected'
                      : 'Filtered by case selection'}
                  </summary>
                  <PlannedSteps
                    phase="Before each"
                    steps={testCase.beforeEach}
                  />
                  <PlannedSteps phase="Case steps" steps={testCase.steps} />
                  <PlannedSteps phase="After each" steps={testCase.afterEach} />
                </details>
              ))}
              <PlannedSteps
                phase="Document teardown"
                steps={document.afterAll}
              />
            </details>
          ))}
        </section>
      ))}
    </details>
  );
}
