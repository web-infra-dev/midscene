import { WarningFilled } from '@ant-design/icons';
import type {
  TestRunReportDocumentPlan,
  TestRunReportStep,
} from '@midscene/core';
import { Segmented } from 'antd';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import type { RunnerStepGroup } from './case-workspace-model';
import { revealExecutionStep } from './execution-panel-scroll';
import { ExecutionYaml } from './execution-yaml';
import type { ReportIssues } from './issues';
import { getStepDisplayName } from './model';
import { useExecutionSidebar } from './use-execution-sidebar';
import { StepStatus, formatDuration } from './view-primitives';

export function RunnerExecutionPanel({
  renderToolbar,
  groups,
  issues,
  selectedStepId,
  timeline,
  children,
  sourcePath,
  sourceYaml,
  caseIndex = 0,
  view = 'visual',
  onViewChange,
  onSelect,
}: {
  renderToolbar?(viewSwitch: ReactNode): ReactNode;
  groups: readonly RunnerStepGroup[];
  issues?: ReportIssues['nodes'];
  selectedStepId?: string;
  timeline?: ReactNode;
  children?: ReactNode;
  sourcePath?: string;
  sourceYaml?: TestRunReportDocumentPlan['sourceYaml'];
  caseIndex?: number;
  view?: 'visual' | 'yaml';
  onViewChange?(view: 'visual' | 'yaml'): void;
  onSelect(step: TestRunReportStep): void;
}): JSX.Element {
  const yaml =
    typeof sourceYaml?.value === 'string' ? sourceYaml.value : undefined;
  const showYaml = view === 'yaml' && yaml !== undefined;
  const steps = useMemo(() => groups.flatMap((group) => group.steps), [groups]);
  const selectedButton = useRef<HTMLButtonElement>(null);
  const executionBody = useRef<HTMLDivElement>(null);
  const sidebar = useExecutionSidebar(executionBody);
  const openingYamlStep = useRef(false);
  const selectedStepFailed = steps.some(
    (step) => step.id === selectedStepId && step.status === 'failed',
  );
  useEffect(() => {
    if (showYaml || !selectedStepId) return;
    let revealFrame: number | undefined;
    // Case navigation restores the main scroll position over two frames.
    // Reveal the selection after that restoration, including on initial entry.
    const frame = window.requestAnimationFrame(() => {
      revealFrame = window.requestAnimationFrame(() => {
        if (executionBody.current && selectedButton.current) {
          revealExecutionStep(
            executionBody.current,
            selectedButton.current,
            selectedStepFailed,
          );
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (revealFrame !== undefined) window.cancelAnimationFrame(revealFrame);
    };
  }, [showYaml, selectedStepId, selectedStepFailed]);
  useEffect(() => {
    if (showYaml || !openingYamlStep.current) return;
    openingYamlStep.current = false;
    selectedButton.current?.focus({ preventScroll: true });
    selectedButton.current?.scrollIntoView({ block: 'nearest' });
    executionBody.current
      ?.querySelector('.runner-detail-evidence-heading')
      ?.scrollIntoView({ block: 'nearest' });
  }, [showYaml, selectedStepId]);
  const viewSwitch = (
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
  );
  return (
    <section className="runner-detail-step-panel" aria-label="Execution">
      <div className="runner-detail-panel-heading">
        {renderToolbar ? renderToolbar(viewSwitch) : viewSwitch}
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
          <ExecutionYaml
            source={yaml!}
            steps={steps}
            caseIndex={caseIndex}
            issues={issues}
            onSelect={(step) => {
              openingYamlStep.current = true;
              onSelect(step);
              onViewChange?.('visual');
            }}
          />
        </section>
      ) : null}
      {!showYaml ? timeline : null}
      <div
        className="runner-detail-execution-body"
        hidden={showYaml}
        ref={executionBody}
        style={sidebar.style}
      >
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
                      ref={isSelected ? selectedButton : undefined}
                      aria-pressed={isSelected}
                      onClick={() => onSelect(step)}
                    >
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
        <div
          className="runner-execution-resize-handle"
          {...sidebar.handleProps}
        />
        {children}
      </div>
    </section>
  );
}
