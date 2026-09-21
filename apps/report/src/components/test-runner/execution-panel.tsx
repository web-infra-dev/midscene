import {
  BugOutlined,
  DatabaseOutlined,
  EyeOutlined,
  SettingOutlined,
  ThunderboltFilled,
  UnorderedListOutlined,
} from '@ant-design/icons';
import type { TestRunReportStep } from '@midscene/core';
import type { RunnerStepGroup } from './case-workspace-model';
import { getStepDisplayName } from './model';
import { StepStatus, formatDuration } from './view-primitives';

function RunnerStepTypeIcon({
  step,
}: { step: TestRunReportStep }): JSX.Element {
  if (step.status === 'failed') return <BugOutlined />;
  if (step.agentDetails?.length) return <ThunderboltFilled />;
  if (step.node.toLocaleLowerCase().includes('assert')) return <EyeOutlined />;
  if (step.phase !== 'steps') return <SettingOutlined />;
  return <DatabaseOutlined />;
}

export function RunnerExecutionPanel({
  groups,
  selectedStepId,
  onSelect,
}: {
  groups: readonly RunnerStepGroup[];
  selectedStepId?: string;
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
        <small>{stepCount} steps</small>
      </div>
      <div className="runner-detail-step-scroll">
        {groups.map((group) => (
          <section className="runner-detail-step-group" key={group.label}>
            <h3>{group.label}</h3>
            {group.steps.map((step) => (
              <button
                type="button"
                className={selectedStepId === step.id ? 'is-selected' : ''}
                key={step.id}
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
                  <strong>{step.node}</strong>
                  <small>{getStepDisplayName(step)}</small>
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
