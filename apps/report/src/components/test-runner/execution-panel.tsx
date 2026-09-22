import {
  CloseCircleOutlined,
  DatabaseOutlined,
  EyeOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import type { TestRunReportStep } from '@midscene/core';
import type { ReactNode } from 'react';
import type { RunnerStepGroup } from './case-workspace-model';
import { getStepDisplayName } from './model';
import { StepStatus, formatDuration } from './view-primitives';

function RunnerStepTypeIcon({
  step,
}: { step: TestRunReportStep }): JSX.Element {
  if (step.status === 'failed') return <CloseCircleOutlined />;
  if (step.agentDetails?.length) return <ThunderboltOutlined />;
  if (step.node.toLocaleLowerCase().includes('assert')) return <EyeOutlined />;
  if (step.phase !== 'steps') return <SettingOutlined />;
  return <DatabaseOutlined />;
}

export function RunnerExecutionPanel({
  groups,
  selectedStepId,
  playingStepId,
  timeline,
  timelineControl,
  onSelect,
}: {
  groups: readonly RunnerStepGroup[];
  selectedStepId?: string;
  playingStepId?: string;
  timeline?: ReactNode;
  timelineControl?: ReactNode;
  onSelect(step: TestRunReportStep): void;
}): JSX.Element {
  return (
    <aside className="runner-detail-step-panel" aria-label="Execution steps">
      <div className="runner-detail-panel-heading">
        <span>
          <UnorderedListOutlined />
          <strong>Execution</strong>
        </span>
      </div>
      {timeline}
      <div className="runner-detail-step-scroll">
        {groups.map((group) => (
          <section className="runner-detail-step-group" key={group.label}>
            <h3>
              <span>{group.label}</span>
              {group.label === 'Case steps' ? timelineControl : null}
            </h3>
            <div className="runner-detail-step-list">
              {group.steps.map((step) => {
                const isSelected = selectedStepId === step.id;
                const isPlaying = playingStepId === step.id;

                return (
                  <button
                    type="button"
                    className={`${isSelected ? 'is-selected' : ''} ${
                      isPlaying ? 'is-playing' : ''
                    }`.trim()}
                    key={step.id}
                    aria-current={isPlaying ? 'step' : undefined}
                    aria-pressed={isSelected}
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
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
