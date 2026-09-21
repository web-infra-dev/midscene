import type { TestRunReportStep } from '@midscene/core';
import {
  ReportValue,
  formatDuration,
  formatTimestamp,
} from './view-primitives';

export type RunnerInspectorTab = 'io' | 'logs';

function InputOutput({ step }: { step: TestRunReportStep }): JSX.Element {
  return (
    <div className="runner-detail-io-grid">
      <section>
        <h4>Input</h4>
        <div className="runner-detail-io-body">
          <ReportValue value={step.input} />
          {!step.input ? <span className="runner-muted">None</span> : null}
        </div>
      </section>
      <section>
        <h4>Output</h4>
        <div className="runner-detail-io-body">
          <ReportValue value={step.output?.data} />
          {!step.output?.data ? (
            <span className="runner-muted">None</span>
          ) : null}
          {step.output?.summary ? <p>{step.output.summary}</p> : null}
        </div>
      </section>
    </div>
  );
}

function RuntimeEvents({ step }: { step: TestRunReportStep }): JSX.Element {
  return (
    <div className="runner-detail-log-view">
      <p>
        <time>{formatTimestamp(step.startedAt)}</time>
        <b>START</b>
        <span>Step started: {step.node}</span>
      </p>
      {step.error ? (
        <p className="is-error">
          <time>{formatTimestamp(step.endedAt)}</time>
          <b>ERROR</b>
          <span>
            {step.error.code || step.error.name}: {step.error.message}
          </span>
        </p>
      ) : null}
      <p>
        <time>{formatTimestamp(step.endedAt)}</time>
        <b>END</b>
        <span>
          Step ended with status {step.status} in{' '}
          {formatDuration(step.durationMs)}
        </span>
      </p>
    </div>
  );
}

export function EvidenceTabs({
  step,
  tab,
  onChange,
}: {
  step: TestRunReportStep;
  tab: RunnerInspectorTab;
  onChange(tab: RunnerInspectorTab): void;
}): JSX.Element {
  return (
    <>
      <div className="runner-detail-inspector-tabs" role="tablist">
        {(
          [
            ['io', 'Input & output'],
            ['logs', 'Events'],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? 'is-selected' : ''}
            key={value}
            onClick={() => onChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="runner-detail-inspector-content">
        {tab === 'io' ? <InputOutput step={step} /> : null}
        {tab === 'logs' ? <RuntimeEvents step={step} /> : null}
      </div>
    </>
  );
}
