import { DownOutlined, RightOutlined, WarningFilled } from '@ant-design/icons';
import { Button, Empty, Tooltip } from 'antd';
import { useId } from 'react';
import { VisualTimeline } from './case-preview';
import {
  type RunnerCaseStatus,
  type RunnerCaseView,
  type RunnerProjectBreakdownView,
  type RunnerProjectView,
  type RunnerVisualIndex,
  getAllAttemptVisualFrames,
  getCaseFailure,
} from './model';
import {
  CaseStatus,
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
  const failure = getCaseFailure(item.testCase);
  const attemptCount = item.testCase.attempts.length;
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
      <button
        type="button"
        className="runner-project-tree-case"
        onClick={() => onOpen(item, failure?.id)}
        aria-label={`Open ${item.testCase.name} in project ${item.project.name}${
          failure ? ' at the failed Step' : ''
        }`}
      >
        <span className={`runner-project-tree-branch is-${item.status}`} />
        <div className="runner-project-tree-case-main">
          <div className="runner-project-tree-case-title">
            <CaseStatus status={item.status} quiet />
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
        {displayMode === 'detailed' ? (
          <div className="runner-case-evidence-preview">
            <VisualTimeline
              frames={getAllAttemptVisualFrames(item.finalAttempt, visualIndex)}
              durationMs={item.finalAttempt?.durationMs}
            />
          </div>
        ) : null}
      </button>
    </li>
  );
}

function ProjectBreakdownNode({
  visualIndex,
  view,
  expanded,
  caseDisplayMode,
  onToggle,
  onOpenProject,
  onOpenCase,
}: {
  visualIndex: RunnerVisualIndex;
  view: RunnerProjectBreakdownView;
  expanded: boolean;
  caseDisplayMode: RunnerCaseDisplayMode;
  onToggle(): void;
  onOpenProject(item: RunnerProjectView): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const childGroupId = useId();
  const { cases, item } = view;

  return (
    <li className={`runner-project-tree-node${expanded ? ' is-expanded' : ''}`}>
      <div className="runner-project-tree-root">
        <button
          type="button"
          className="runner-project-tree-toggle"
          onClick={onToggle}
          aria-controls={childGroupId}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} project ${
            item.project.name
          }`}
        >
          <span className="runner-project-tree-chevron">
            {expanded ? <DownOutlined /> : <RightOutlined />}
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
              {item.project.platform} · {item.cases.length}{' '}
              {item.cases.length === 1 ? 'case' : 'cases'}
            </span>
          </span>
        </button>
        <div
          className="runner-project-tree-stats"
          aria-label={`${item.project.name} overview`}
        >
          <span>
            <strong>
              {item.passedCount}/{item.cases.length}
            </strong>
            <small>passed</small>
          </span>
          {item.failedCount ? (
            <span className="is-failed">
              <strong>{item.failedCount}</strong>
              <small>failed</small>
            </span>
          ) : null}
          {item.retryPassedCount ? (
            <span className="is-warning">
              <strong>{item.retryPassedCount}</strong>
              <small>retried</small>
            </span>
          ) : null}
          {item.notRunCount ? (
            <span>
              <strong>{item.notRunCount}</strong>
              <small>not run</small>
            </span>
          ) : null}
          <span>
            <strong>{formatDuration(item.durationMs)}</strong>
            <small>duration</small>
          </span>
        </div>
        <Tooltip title="Open project overview" mouseEnterDelay={0.25}>
          <button
            type="button"
            className="runner-project-tree-overview"
            onClick={() => onOpenProject(item)}
            aria-label={`Open project overview ${item.project.name}`}
          >
            <RightOutlined aria-hidden />
          </button>
        </Tooltip>
      </div>
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
  onOpenProject,
  onOpenCase,
}: {
  visualIndex: RunnerVisualIndex;
  projects: RunnerProjectBreakdownView[];
  caseDisplayMode: RunnerCaseDisplayMode;
  expandedProjectKeys: Set<string>;
  onExpandedProjectKeysChange(keys: Set<string>): void;
  hasActiveFilters: boolean;
  onResetFilters(): void;
  onOpenProject(item: RunnerProjectView): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const visibleCaseCount = projects.reduce(
    (total, item) => total + item.cases.length,
    0,
  );
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
      <div className="runner-project-tree-summary">
        <span>
          <strong>{projects.length}</strong>{' '}
          {projects.length === 1 ? 'project' : 'projects'} ·{' '}
          <strong>{visibleCaseCount}</strong>{' '}
          {visibleCaseCount === 1 ? 'case' : 'cases'}
        </span>
        <div>
          <button
            type="button"
            onClick={() =>
              onExpandedProjectKeysChange(
                new Set(projects.map((item) => item.item.key)),
              )
            }
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => onExpandedProjectKeysChange(new Set())}
          >
            Collapse all
          </button>
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
            onOpenProject={onOpenProject}
            onOpenCase={onOpenCase}
          />
        ))}
      </ul>
    </>
  );
}
