import { EyeOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { TestRunReportStep } from '@midscene/core';
import type { ReactNode } from 'react';
import agentIcon from './assets/step-agent.svg';
import dataIcon from './assets/step-data.svg';
import errorIcon from './assets/step-error.svg';
import hookIcon from './assets/step-hook.svg';
import type { RunnerStepGroup } from './case-workspace-model';
import { getStepDisplayName } from './model';
import { StepStatus, formatDuration } from './view-primitives';

function RunnerStepTypeIcon({
  step,
}: { step: TestRunReportStep }): JSX.Element {
  if (step.status === 'failed')
    return <img src={errorIcon} width={16} height={16} alt="" />;
  if (step.agentDetails?.length)
    return <img src={agentIcon} width={16} height={16} alt="" />;
  if (step.node.toLocaleLowerCase().includes('assert')) return <EyeOutlined />;
  if (step.phase !== 'steps')
    return <img src={hookIcon} width={16} height={16} alt="" />;
  return <img src={dataIcon} width={16} height={16} alt="" />;
}

export function RunnerExecutionPanel({
  groups,
  selectedStepId,
  timeline,
  timelineControl,
  onSelect,
}: {
  groups: readonly RunnerStepGroup[];
  selectedStepId?: string;
  timeline?: ReactNode;
  timelineControl?: ReactNode;
  onSelect(step: TestRunReportStep): void;
}): JSX.Element {
  const stepCount = groups.reduce(
    (total, group) => total + group.steps.length,
    0,
  );
  return (
    <aside className="runner-detail-step-panel" aria-label="Execution steps">
      <div className="runner-detail-panel-heading">
        <span>
          <UnorderedListOutlined />
          <strong>Execution</strong>
        </span>
        <span className="runner-detail-panel-meta">
          {timelineControl}
          <small>{stepCount} steps</small>
        </span>
      </div>
      {timeline}
      <div className="runner-detail-step-scroll">
        {groups.map((group) => (
          <section className="runner-detail-step-group" key={group.label}>
            <h3>{group.label}</h3>
            {group.steps.map((step) => (
              <button
                type="button"
                className={selectedStepId === step.id ? 'is-selected' : ''}
                key={step.id}
                aria-pressed={selectedStepId === step.id}
                onClick={() => onSelect(step)}
              >
                <span
                  className={`runner-detail-step-type ${
                    step.status === 'failed'
                      ? 'is-error'
                      : step.agentDetails?.length
                        ? 'is-agent'
                        : step.phase !== 'steps'
                          ? 'is-hook'
                          : step.node.toLocaleLowerCase().includes('assert')
                            ? 'is-assert'
                            : 'is-data'
                  }`}
                >
                  <RunnerStepTypeIcon step={step} />
                </span>
                <span className="runner-detail-step-copy">
                  <strong>
                    {step.node}
                    {step.agentDetails?.length ? (
                      <span
                        className="runner-detail-recording-icon"
                        role="img"
                        aria-label="Has recording"
                      />
                    ) : null}
                  </strong>
                  <small title={getStepDisplayName(step)}>
                    {getStepDisplayName(step)}
                  </small>
                </span>
                <span className="runner-detail-step-tail">
                  <StepStatus status={step.status} />
                  <time>{formatDuration(step.durationMs)}</time>
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
