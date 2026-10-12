import type {
  TestRunReportPlannedStep,
  TestRunReportStep,
} from '@midscene/core';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { IssueInformation } from './issue-information';
import type { ReportIssue } from './issues';
import { getStepDisplayName } from './model';
import {
  ReportValue,
  formatDuration,
  formatTimestamp,
} from './view-primitives';

export type RunnerInspectorTab = 'record' | 'io' | 'logs';

function StepInformation({
  step,
  plannedStep,
  issues,
  navigableStepIds,
  context,
}: {
  step: TestRunReportStep;
  plannedStep?: TestRunReportPlannedStep;
  issues: readonly ReportIssue[];
  navigableStepIds?: ReadonlySet<string>;
  context?: Record<string, string>;
}): JSX.Element {
  return (
    <div className="runner-detail-io-grid">
      <IssueInformation
        issues={issues}
        navigableStepIds={navigableStepIds}
        currentStepId={step.id}
      />
      {plannedStep ? (
        <section>
          <h4>Configuration</h4>
          <dl>
            <div>
              <dt>Phase</dt>
              <dd>{step.phase}</dd>
            </div>
            <div>
              <dt>Timeout</dt>
              <dd>{formatDuration(plannedStep.timeoutMs)}</dd>
            </div>
            <div>
              <dt>Continue on error</dt>
              <dd>{plannedStep.continueOnError ? 'yes' : 'no'}</dd>
            </div>
            {step.waitForPreviousOperationMs ? (
              <div>
                <dt>Waited for previous operation</dt>
                <dd>{formatDuration(step.waitForPreviousOperationMs)}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
      <section>
        <h4>Input</h4>
        <div className="runner-detail-io-body">
          <ReportValue value={step.input} />
          {!step.input ? <span className="runner-muted">None</span> : null}
        </div>
      </section>
      {plannedStep &&
      JSON.stringify(plannedStep.input) !== JSON.stringify(step.input) ? (
        <section>
          <h4>Planned input</h4>
          <ReportValue value={plannedStep.input} />
        </section>
      ) : null}
      <section>
        <h4>Output</h4>
        <div className="runner-detail-io-body">
          <ReportValue value={step.output?.data} />
          {!step.output?.data ? (
            <span className="runner-muted">None</span>
          ) : null}
          {step.output?.summary &&
          step.output.summary !== getStepDisplayName(step) ? (
            <p>{step.output.summary}</p>
          ) : null}
        </div>
      </section>
      {step.operations ? (
        <section>
          <h4>Capture boundary</h4>
          <p>
            {step.operations.capturedAt}. Late outcomes are recorded in the
            operation event log; this snapshot does not update.
          </p>
        </section>
      ) : null}
      {context ? (
        <section>
          <h4>Stable IDs</h4>
          <ReportValue value={{ value: context }} />
        </section>
      ) : null}
    </div>
  );
}

function RuntimeEvents({ step }: { step: TestRunReportStep }): JSX.Element {
  if (step.status === 'not-run')
    return <p>No operation events were recorded.</p>;
  return (
    <div className="runner-detail-log-view">
      {step.operations ? (
        <ul>
          {step.operations.events.map((event, index) => (
            <li key={`${event.operationId}:${index}`}>
              {event.at}: {event.operationKind} — {event.kind}
              {event.status ? ` (${event.status})` : ''}
              {event.pending ? '; still running when Runner returned' : ''}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p>
            <time>{formatTimestamp(step.startedAt)}</time>
            <b>START</b>
            <span>Step started: {step.node}</span>
          </p>
          <p>
            <time>{formatTimestamp(step.endedAt)}</time>
            <b>END</b>
            <span>
              Step ended with status {step.status} in{' '}
              {formatDuration(step.durationMs)}
            </span>
          </p>
        </>
      )}
    </div>
  );
}

export function EvidenceTabs({
  step,
  plannedStep,
  issues = [],
  navigableStepIds,
  context,
  tab,
  onChange,
  recordContent,
  stabilizeContentHeight = false,
}: {
  step: TestRunReportStep;
  plannedStep?: TestRunReportPlannedStep;
  issues?: readonly ReportIssue[];
  navigableStepIds?: ReadonlySet<string>;
  context?: Record<string, string>;
  tab: RunnerInspectorTab;
  onChange(tab: RunnerInspectorTab): void;
  recordContent?: ReactNode;
  stabilizeContentHeight?: boolean;
}): JSX.Element {
  const hasRecord = recordContent !== undefined && recordContent !== null;
  const activeTab = tab === 'record' && !hasRecord ? 'io' : tab;
  const tabs = [
    ...(hasRecord ? ([['record', 'Record']] as const) : []),
    ['io', 'Information'],
    ['logs', 'Events'],
  ] as const;
  useEffect(() => {
    if (activeTab !== tab) onChange(activeTab);
  }, [activeTab, onChange, tab]);
  return (
    <>
      <div className="runner-detail-inspector-tabs" role="tablist">
        {tabs.map(([value, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === value}
            className={activeTab === value ? 'is-selected' : ''}
            key={value}
            onClick={() => onChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className={`runner-detail-inspector-content${stabilizeContentHeight ? ' has-stable-trace-height' : ''}`}
      >
        {activeTab === 'record' ? recordContent : null}
        {activeTab === 'io' ? (
          <StepInformation
            step={step}
            plannedStep={plannedStep}
            issues={issues}
            navigableStepIds={navigableStepIds}
            context={context}
          />
        ) : null}
        {activeTab === 'logs' ? <RuntimeEvents step={step} /> : null}
      </div>
    </>
  );
}
