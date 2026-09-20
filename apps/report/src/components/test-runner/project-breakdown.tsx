import {
  CaretDownFilled,
  CaretRightFilled,
  WarningFilled,
} from '@ant-design/icons';
import { Button, Empty, Tooltip } from 'antd';
import { useId, useMemo, useState } from 'react';
import { RunnerAttemptTimeline } from './attempt-timeline';
import {
  type RunnerCaseStatus,
  type RunnerCaseView,
  type RunnerProjectBreakdownView,
  type RunnerProjectView,
  type RunnerVisualIndex,
  getAllAttemptVisualFrames,
  getCaseFailure,
  positionAttemptVisualFrames,
} from './model';
import {
  type RunnerCaseDisplayMode,
  caseStatusLabel,
  formatDuration,
} from './view-primitives';

export const projectDisplayStatus = (
  item: RunnerProjectView,
): RunnerCaseStatus => {
  if (item.project.status === 'failed' || item.failedCount > 0) return 'failed';
  if (item.retryPassedCount > 0) return 'retry-passed';
  if (!item.cases.length || item.notRunCount > 0) return 'not-run';
  return 'passed';
};

function ProjectBreakdownCase({
  visualIndex,
  item,
  displayMode,
  onOpen,
}: {
  visualIndex: RunnerVisualIndex;
  item: RunnerCaseView;
  displayMode: RunnerCaseDisplayMode;
  onOpen(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const [previewFrameKey, setPreviewFrameKey] = useState<string>();
  const failure = getCaseFailure(item.testCase);
  const attemptCount = item.testCase.attempts.length;
  const positionedFrames = useMemo(() => {
    if (!item.finalAttempt) return [];
    return positionAttemptVisualFrames(
      item.finalAttempt,
      getAllAttemptVisualFrames(item.finalAttempt, visualIndex),
    );
  }, [item.finalAttempt, visualIndex]);
  const issue = failure
    ? {
        label: `Step ${failure.node}`,
        detail: `${failure.node}: ${failure.error?.message || 'Step failed'}`,
      }
    : item.status === 'not-run'
      ? {
          label: item.testCase.notRunReason || 'Not run',
          detail: item.testCase.notRunReason || 'This case did not run',
        }
      : undefined;
  return (
    <li
      className={`runner-project-tree-case-item${
        displayMode === 'detailed' ? ' is-detailed' : ''
      }`}
      data-case-key={item.key}
    >
      <div className="runner-project-tree-case">
        <button
          type="button"
          className="runner-project-tree-case-open"
          onClick={() => onOpen(item, failure?.id)}
          aria-label={`Open ${item.testCase.name} in project ${item.project.name}${
            failure ? ' at the failed Step' : ''
          } · ${caseStatusLabel(item.status)}`}
        >
          <div className="runner-project-tree-case-main">
            <div className="runner-project-tree-case-title">
              <span
                className={`runner-project-tree-branch is-${item.status}`}
                aria-hidden="true"
              />
              <Tooltip title={item.testCase.name} mouseEnterDelay={0.25}>
                <h3>{item.testCase.name}</h3>
              </Tooltip>
            </div>
            <div className="runner-project-tree-case-meta-row">
              <Tooltip title={item.document.sourcePath} mouseEnterDelay={0.25}>
                <span>{item.document.sourcePath}</span>
              </Tooltip>
              <span>
                {attemptCount} {attemptCount === 1 ? 'attempt' : 'attempts'}
              </span>
              <time>{formatDuration(item.durationMs)}</time>
            </div>
            <div
              className={`runner-project-tree-case-issue${issue ? '' : ' is-empty'}`}
            >
              {issue ? (
                <Tooltip title={issue.detail} mouseEnterDelay={0.25}>
                  <span>
                    <WarningFilled />
                    {issue.label}
                  </span>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </button>
        {displayMode === 'detailed' ? (
          <div className="runner-case-evidence-preview">
            <RunnerAttemptTimeline
              attempt={item.finalAttempt}
              frames={positionedFrames}
              previewFrameKey={previewFrameKey}
              variant="overview"
              onPreview={setPreviewFrameKey}
              onSelectFrame={(frame) => onOpen(item, frame.stepId)}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ProjectBreakdownNode({
  visualIndex,
  view,
  expanded,
  caseDisplayMode,
  onToggle,
  onOpenCase,
}: {
  visualIndex: RunnerVisualIndex;
  view: RunnerProjectBreakdownView;
  expanded: boolean;
  caseDisplayMode: RunnerCaseDisplayMode;
  onToggle(): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const childGroupId = useId();
  const { cases, item } = view;

  return (
    <li className={`runner-project-tree-node${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="runner-project-tree-root"
        onClick={onToggle}
        aria-controls={childGroupId}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} project ${
          item.project.name
        }`}
      >
        <span className="runner-project-tree-toggle">
          <span className="runner-project-tree-chevron">
            {expanded ? <CaretDownFilled /> : <CaretRightFilled />}
          </span>
          <span className="runner-project-tree-identity">
            <span
              className={`runner-project-status-dot is-${projectDisplayStatus(
                item,
              )}`}
              role="img"
              aria-label={caseStatusLabel(projectDisplayStatus(item))}
            />
            <Tooltip title={item.project.name} mouseEnterDelay={0.25}>
              <span className="runner-project-tree-name">
                {item.project.name}
              </span>
            </Tooltip>
            <span className="runner-project-tree-meta">
              {item.project.platform}
            </span>
          </span>
        </span>
        <span
          className="runner-project-tree-stats"
          aria-label={`${item.project.name} overview`}
        >
          <span>
            <strong>{item.cases.length}</strong>
          </span>
          <span>
            <strong>{item.passedCount}</strong>
          </span>
          <span className="runner-project-tree-result">
            {item.failedCount ? (
              <b className="is-failed">{item.failedCount} failed</b>
            ) : item.retryPassedCount ? (
              <b className="is-warning">{item.retryPassedCount} retried</b>
            ) : item.notRunCount ? (
              <b>{item.notRunCount} not run</b>
            ) : (
              <b className="is-passed">Passed</b>
            )}
          </span>
          <span>
            <strong>{formatDuration(item.durationMs)}</strong>
          </span>
        </span>
      </button>
      {expanded ? (
        <ul
          className={`runner-project-tree-children is-${caseDisplayMode}`}
          id={childGroupId}
        >
          {cases.length ? (
            cases.map((caseItem) => (
              <ProjectBreakdownCase
                visualIndex={visualIndex}
                item={caseItem}
                key={caseItem.key}
                displayMode={caseDisplayMode}
                onOpen={onOpenCase}
              />
            ))
          ) : (
            <li className="runner-project-tree-empty">
              No cases were collected for this project
            </li>
          )}
        </ul>
      ) : null}
    </li>
  );
}

export function ProjectBreakdownTree({
  visualIndex,
  projects,
  caseDisplayMode,
  expandedProjectKeys,
  onExpandedProjectKeysChange,
  hasActiveFilters,
  onResetFilters,
  onOpenCase,
}: {
  visualIndex: RunnerVisualIndex;
  projects: RunnerProjectBreakdownView[];
  caseDisplayMode: RunnerCaseDisplayMode;
  expandedProjectKeys: Set<string>;
  onExpandedProjectKeysChange(keys: Set<string>): void;
  hasActiveFilters: boolean;
  onResetFilters(): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const toggleProject = (key: string) => {
    const next = new Set(expandedProjectKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onExpandedProjectKeysChange(next);
  };

  if (!projects.length) {
    return (
      <div className="runner-empty-results">
        <Empty
          description={
            hasActiveFilters
              ? 'No projects or cases match these filters'
              : 'No projects were collected for this run'
          }
        >
          {hasActiveFilters ? (
            <Button onClick={onResetFilters}>Clear filters</Button>
          ) : null}
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="runner-project-tree-header" aria-hidden="true">
        <span>Project name</span>
        <div className="runner-project-tree-columns">
          <span>Case</span>
          <span>Passed</span>
          <span>Result</span>
          <span>Duration</span>
        </div>
      </div>
      <ul
        className="runner-project-tree"
        aria-label="Project and case breakdown"
      >
        {projects.map((view) => (
          <ProjectBreakdownNode
            visualIndex={visualIndex}
            view={view}
            key={view.item.key}
            expanded={expandedProjectKeys.has(view.item.key)}
            caseDisplayMode={caseDisplayMode}
            onToggle={() => toggleProject(view.item.key)}
            onOpenCase={onOpenCase}
          />
        ))}
      </ul>
    </>
  );
}
