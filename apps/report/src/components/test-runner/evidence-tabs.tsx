import { ClockCircleOutlined } from '@ant-design/icons';
import type {
  TestRunReportOperationEvent,
  TestRunReportPlannedStep,
  TestRunReportStep,
} from '@midscene/core';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { IssueInformation } from './issue-information';
import type { ReportIssue } from './issues';
import { getStepDisplayName } from './model';
import { StatusBadge } from './status-badge';
import { ReportValue, formatDuration } from './view-primitives';

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
          <dl className="runner-step-configuration">
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
          <div className="runner-detail-io-body">
            <ReportValue value={plannedStep.input} />
          </div>
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
          <p className="runner-capture-boundary">
            {step.operations.capturedAt}. Late outcomes are recorded in the
            operation event log; this snapshot does not update.
          </p>
        </section>
      ) : null}
      {context ? (
        <section>
          <h4>Stable IDs</h4>
          <div className="runner-detail-io-body">
            <ReportValue value={{ value: context }} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RuntimeEvents({ step }: { step: TestRunReportStep }): JSX.Element {
  const events: TestRunReportOperationEvent[] =
    step.status === 'not-run'
      ? []
      : (step.operations?.events ?? [
          {
            operationId: step.id,
            operationKind: 'node',
            kind: 'started',
            at: step.startedAt,
          },
          {
            operationId: step.id,
            operationKind: 'node',
            kind: 'settled',
            at: step.endedAt,
            status: step.status,
          },
        ]);
  if (!events.length)
    return (
      <div className="runner-events-empty">
        <ClockCircleOutlined aria-hidden />
        <p>No operation events were recorded.</p>
      </div>
    );
  return (
    <div className="runner-runtime-events">
      <table aria-label="Operation events">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Operation</th>
            <th scope="col">Event</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, index) => (
            <tr key={`${event.operationId}:${index}`}>
              <td>
                <time dateTime={event.at} title={event.at}>
                  {event.at}
                </time>
              </td>
              <td>
                <code title={event.operationId}>{event.operationKind}</code>
              </td>
              <td>
                <span className="runner-runtime-event-kind">{event.kind}</span>
                {event.pending ? (
                  <small>Still running when Runner returned</small>
                ) : null}
                {!step.operations ? (
                  <small>
                    {event.kind === 'started'
                      ? `Step started: ${step.node}`
                      : `Step ended in ${formatDuration(step.status === 'not-run' ? undefined : step.durationMs)}`}
                  </small>
                ) : null}
              </td>
              <td>
                <div className="runner-runtime-event-status">
                  {event.status ? (
                    <StatusBadge
                      label={event.status}
                      tone={
                        event.status === 'success'
                          ? 'success'
                          : event.status === 'failed'
                            ? 'failed'
                            : 'neutral'
                      }
                      quiet
                    />
                  ) : null}
                  {event.pending ? (
                    <StatusBadge label="Pending" tone="warning" quiet />
                  ) : null}
                  {!event.status && !event.pending ? (
                    <span className="runner-muted">—</span>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
