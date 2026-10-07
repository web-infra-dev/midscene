import type { TestRunReportStep } from '@midscene/core';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import {
  ReportValue,
  formatDuration,
  formatTimestamp,
} from './view-primitives';

export type RunnerInspectorTab = 'record' | 'io' | 'logs';

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
  recordContent,
  stabilizeContentHeight = false,
}: {
  step: TestRunReportStep;
  tab: RunnerInspectorTab;
  onChange(tab: RunnerInspectorTab): void;
  recordContent?: ReactNode;
  stabilizeContentHeight?: boolean;
}): JSX.Element {
  const hasRecord = recordContent !== undefined && recordContent !== null;
  const activeTab = tab === 'record' && !hasRecord ? 'io' : tab;
  const tabs = [
    ...(hasRecord ? ([['record', 'Record']] as const) : []),
    ['io', 'Input & output'],
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
        className={`runner-detail-inspector-content${
          stabilizeContentHeight ? ' has-stable-trace-height' : ''
        }`}
      >
        {activeTab === 'record' ? recordContent : null}
        {activeTab === 'io' ? <InputOutput step={step} /> : null}
        {activeTab === 'logs' ? <RuntimeEvents step={step} /> : null}
      </div>
    </>
  );
}
