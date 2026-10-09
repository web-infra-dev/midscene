import type { TestRunReportDump } from '@midscene/core';
import { ErrorDetails } from './error-details';
import { buildRunnerStepIndex, flattenRunnerCases } from './model';
import { getRunDiagnostics } from './run-diagnostics-model';
import { ReportValue } from './view-primitives';

export function RunDiagnostics({
  dump,
}: { dump: TestRunReportDump }): JSX.Element | null {
  const { groups, summary } = getRunDiagnostics(dump);
  const navigableSteps = new Set(
    buildRunnerStepIndex(dump, flattenRunnerCases(dump)).map(
      ({ step }) => step.id,
    ),
  );
  if (!groups.length && !summary) return null;
  return (
    <section
      className="runner-panel runner-diagnostics"
      aria-label="Run diagnostics"
    >
      <h2>Run diagnostics</h2>
      {summary ? <p>Across recorded attempts: {summary}.</p> : null}
      <p>
        Records are grouped by their recorded cause or scope. A diagnostic
        record is not a separate test failure.
      </p>
      {groups.map((group) => (
        <details
          key={group.key}
          open={
            dump.status === 'failed' &&
            (group.category === 'execution' ||
              group.category === 'infrastructure')
          }
        >
          <summary>
            {group.label}
            {group.entries.length > 1
              ? ` (${group.entries.length} records)`
              : ''}
          </summary>
          <ul>
            {group.entries.map((entry, index) => (
              <li key={index}>
                {entry.stepId && navigableSteps.has(entry.stepId) ? (
                  <a href={`#runner-step=${encodeURIComponent(entry.stepId)}`}>
                    {entry.label}
                  </a>
                ) : (
                  <strong>{entry.label}</strong>
                )}
                <p>{entry.message}</p>
                <details>
                  <summary>Diagnostic record</summary>
                  {entry.error ? <ErrorDetails error={entry.error} /> : null}
                  {entry.ids ? (
                    <ReportValue value={{ value: entry.ids }} />
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
