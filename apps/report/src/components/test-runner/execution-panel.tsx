import {
  CloseCircleOutlined,
  DatabaseOutlined,
  EyeOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  WarningFilled,
} from '@ant-design/icons';
import type {
  TestRunReportDocumentPlan,
  TestRunReportStep,
} from '@midscene/core';
import { Segmented } from 'antd';
import type { ReactNode } from 'react';
import type { RunnerStepGroup } from './case-workspace-model';
import type { ReportIssues } from './issues';
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
  issues,
  selectedStepId,
  timeline,
  children,
  sourcePath,
  sourceYaml,
  view = 'visual',
  onViewChange,
  onSelect,
}: {
  groups: readonly RunnerStepGroup[];
  issues?: ReportIssues['nodes'];
  selectedStepId?: string;
  timeline?: ReactNode;
  children?: ReactNode;
  sourcePath?: string;
  sourceYaml?: TestRunReportDocumentPlan['sourceYaml'];
  view?: 'visual' | 'yaml';
  onViewChange?(view: 'visual' | 'yaml'): void;
  onSelect(step: TestRunReportStep): void;
}): JSX.Element {
  const yaml =
    typeof sourceYaml?.value === 'string' ? sourceYaml.value : undefined;
  const showYaml = view === 'yaml' && yaml !== undefined;
  return (
    <section className="runner-detail-step-panel" aria-label="Execution">
      <div className="runner-detail-panel-heading">
        <span>
          <UnorderedListOutlined />
          <strong>Execution</strong>
        </span>
        <Segmented
          aria-label="Execution view"
          value={showYaml ? 'yaml' : 'visual'}
          options={[
            { label: 'Visual', value: 'visual' },
            {
              label: 'YAML',
              value: 'yaml',
              disabled: yaml === undefined,
              title:
                yaml === undefined
                  ? 'Source YAML is unavailable for this document.'
                  : undefined,
            },
          ]}
          onChange={(value) => onViewChange?.(value as 'visual' | 'yaml')}
        />
      </div>
      {showYaml ? (
        <section className="runner-execution-yaml" aria-label="Source YAML">
          <strong>{sourcePath}</strong>
          {sourceYaml?.redactedPaths?.length ? (
            <p>Sensitive fields are redacted.</p>
          ) : null}
          {sourceYaml?.truncatedPaths?.length ? (
            <p>Source YAML is truncated.</p>
          ) : null}
          <pre>{yaml}</pre>
        </section>
      ) : null}
      {!showYaml ? timeline : null}
      <div className="runner-detail-execution-body" hidden={showYaml}>
        <nav className="runner-detail-step-scroll" aria-label="Execution steps">
          {groups.map((group) => (
            <section className="runner-detail-step-group" key={group.label}>
              <h3>
                <span>{group.label}</span>
              </h3>
              <div className="runner-detail-step-list">
                {group.steps.map((step) => {
                  const isSelected = selectedStepId === step.id;

                  return (
                    <button
                      type="button"
                      className={isSelected ? 'is-selected' : ''}
                      key={step.id}
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
                                : step.node
                                      .toLocaleLowerCase()
                                      .includes('assert')
                                  ? 'is-assert'
                                  : 'is-data'
                        }`}
                      >
                        <RunnerStepTypeIcon step={step} />
                      </span>
                      <span className="runner-detail-step-copy">
                        <strong>
                          {step.node}
                          {issues
                            ?.get(step.id)
                            ?.some((issue) => issue.severity === 'warning') ? (
                            <WarningFilled
                              className="runner-step-warning"
                              aria-label="Step warning"
                              title="Step warning"
                            />
                          ) : null}
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
                        <time>
                          {step.status === 'not-run'
                            ? 'Not run'
                            : formatDuration(step.durationMs)}
                        </time>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        {children}
      </div>
    </section>
  );
}
