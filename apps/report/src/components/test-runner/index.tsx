import './index.less';

import {
  ArrowLeftOutlined,
  BugOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  CodeOutlined,
  CopyOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DownOutlined,
  ExportOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  MoonOutlined,
  PauseCircleOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  SettingOutlined,
  SunOutlined,
  ThunderboltFilled,
  UnorderedListOutlined,
  WarningFilled,
} from '@ant-design/icons';
import type {
  TestRunReportAttempt,
  TestRunReportDump,
  TestRunReportStep,
  TestRunReportValue,
} from '@midscene/core';
import { GroupedActionDump } from '@midscene/core';
import {
  Logo,
  globalThemeConfig,
  useGlobalPreference,
} from '@midscene/visualizer';
import {
  Alert,
  App as AntdApp,
  Button,
  ConfigProvider,
  Drawer,
  Empty,
  Input,
  Segmented,
  Select,
  Tag,
  Tooltip,
  theme,
} from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PlaywrightTasks } from '../../types';
import {
  type RunnerRoute,
  clearRunnerStepHash,
  runnerHashForRoute,
  runnerRouteFromHash,
  runnerStepIdFromHash,
  updateRunnerStepHash,
} from '../../utils/test-run-report';
import {
  DEFAULT_TIMELINE_MAX_TIME_MS,
  formatTimelineTime,
  pickNiceStep,
} from '../timeline/timeline-scale';
import {
  type RunnerBreakdownSort,
  type RunnerBreakdownStatus,
  type RunnerCaseStatus,
  type RunnerCaseView,
  type RunnerHealthStats,
  type RunnerPositionedVisualFrame,
  type RunnerProjectBreakdownView,
  type RunnerProjectView,
  type RunnerVisualFrame,
  type RunnerVisualIndex,
  buildRunnerVisualIndex,
  filterAndSortRunnerProjectBreakdown,
  flattenAttemptSteps,
  flattenRunnerCases,
  getAllAttemptVisualFrames,
  getCaseFailure,
  getCaseStory,
  getDefaultExpandedProjectKeys,
  getDefaultVisualFrameForStep,
  getRunnerHealth,
  getStepDisplayName,
  getStepForVisualFrame,
  groupRunnerProjects,
  positionAttemptVisualFrames,
  statusSortWeight,
} from './model';

interface TestRunnerReportProps {
  dump: TestRunReportDump;
  reports: PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
}

type RunnerPage = RunnerRoute['page'];
type RunnerCaseParent = 'overview' | 'project';
type RunnerCaseDisplayMode = 'compact' | 'detailed';

const formatDuration = (durationMs: number | undefined): string => {
  if (durationMs === undefined) return '—';
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(2)} s`;
  return `${Math.floor(durationMs / 60_000)}m ${Math.round(
    (durationMs % 60_000) / 1_000,
  )}s`;
};

const formatPercent = (value: number): string =>
  `${Math.round(value * 1000) / 10}%`;

const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));

const statusMeta: Record<
  RunnerCaseStatus,
  { label: string; className: string; icon: ReactNode }
> = {
  passed: {
    label: 'Passed',
    className: 'is-success',
    icon: <CheckCircleFilled />,
  },
  'retry-passed': {
    label: 'Passed after retry',
    className: 'is-warning',
    icon: <ReloadOutlined />,
  },
  failed: {
    label: 'Failed',
    className: 'is-failed',
    icon: <CloseCircleFilled />,
  },
  'not-run': {
    label: 'Not run',
    className: 'is-neutral',
    icon: <ClockCircleOutlined />,
  },
};

function CaseStatus({ status }: { status: RunnerCaseStatus }): JSX.Element {
  const meta = statusMeta[status];
  return (
    <span className={`runner-status-pill ${meta.className}`}>
      {meta.icon}
      <span>{meta.label}</span>
    </span>
  );
}

function StepStatus({
  status,
}: {
  status: TestRunReportStep['status'];
}): JSX.Element {
  return status === 'success' ? (
    <CheckCircleFilled className="runner-step-status is-success" />
  ) : (
    <CloseCircleFilled className="runner-step-status is-failed" />
  );
}

const reportValue = (value: TestRunReportValue | undefined): ReactNode => {
  if (!value) return null;
  return (
    <div className="runner-json-block">
      <pre>{JSON.stringify(value.value, null, 2)}</pre>
      {value.redactedPaths?.length ? (
        <div className="runner-data-note">
          Redacted: {value.redactedPaths.join(', ')}
        </div>
      ) : null}
      {value.truncatedPaths?.length ? (
        <div className="runner-data-note">
          Truncated: {value.truncatedPaths.join(', ')}
        </div>
      ) : null}
    </div>
  );
};

function StorySteps({ steps }: { steps: readonly string[] }): JSX.Element {
  if (!steps.length) {
    return <span className="runner-muted">No executed steps</span>;
  }
  return (
    <div className="runner-story-steps" aria-label="Case execution summary">
      {steps.map((step, index) => (
        <span className="runner-story-fragment" key={`${step}-${index}`}>
          <Tooltip title={step} mouseEnterDelay={0.25}>
            <span>{step}</span>
          </Tooltip>
          {index < steps.length - 1 ? <RightOutlined /> : null}
        </span>
      ))}
    </div>
  );
}

function VisualTimeline({
  frames,
  durationMs,
}: {
  frames: readonly RunnerVisualFrame[];
  durationMs?: number;
}): JSX.Element {
  if (!frames.length) {
    return (
      <div className="runner-no-visual is-compact">
        <PictureOutlined />
        <span>No visual evidence for this attempt</span>
      </div>
    );
  }

  const capturedTimes = frames.flatMap((frame) =>
    frame.capturedAt === undefined ? [] : [frame.capturedAt],
  );
  const firstCapturedAt = capturedTimes.length
    ? Math.min(...capturedTimes)
    : undefined;
  const lastCapturedAt = capturedTimes.length
    ? Math.max(...capturedTimes)
    : undefined;
  const capturedSpanMs =
    firstCapturedAt !== undefined && lastCapturedAt !== undefined
      ? Math.max(0, lastCapturedAt - firstCapturedAt)
      : 0;
  const timelineDurationMs =
    capturedSpanMs || durationMs || DEFAULT_TIMELINE_MAX_TIME_MS;
  const frameOffset = (frame: RunnerVisualFrame, index: number): number => {
    if (firstCapturedAt !== undefined && frame.capturedAt !== undefined) {
      return Math.max(0, frame.capturedAt - firstCapturedAt);
    }
    if (frames.length <= 1) return 0;
    return (timelineDurationMs * index) / (frames.length - 1);
  };
  const positionedFrames = frames
    .map((frame, sourceIndex) => ({
      frame,
      offsetMs: frameOffset(frame, sourceIndex),
      sourceIndex,
    }))
    .sort((a, b) => a.offsetMs - b.offsetMs || a.sourceIndex - b.sourceIndex);
  const scaleMaxTimeMs = Math.max(
    timelineDurationMs,
    positionedFrames.at(-1)?.offsetMs ?? 0,
    DEFAULT_TIMELINE_MAX_TIME_MS,
  );
  const timeStepMs = pickNiceStep(scaleMaxTimeMs / 4);
  const visibleMaxTimeMs = Math.max(
    timeStepMs,
    Math.ceil(scaleMaxTimeMs / timeStepMs) * timeStepMs,
  );
  const ticks: number[] = [];
  for (
    let tickMs = timeStepMs;
    tickMs < visibleMaxTimeMs;
    tickMs += timeStepMs
  ) {
    ticks.push(tickMs);
  }
  return (
    <div
      className="runner-visual-timeline"
      aria-label={`Visual evidence timeline with ${frames.length} frames from 0 to ${formatDuration(
        timelineDurationMs,
      )}`}
    >
      <div className="runner-visual-timeline-grid" aria-hidden="true">
        {ticks.map((tickMs) => (
          <span
            key={tickMs}
            style={{ left: `${(tickMs / visibleMaxTimeMs) * 100}%` }}
          >
            <small>{formatTimelineTime(tickMs)}</small>
          </span>
        ))}
      </div>
      <ol className="runner-visual-timeline-track">
        {positionedFrames.map(({ frame, offsetMs, sourceIndex }, index) => {
          return (
            <li
              key={`${frame.key}-${sourceIndex}`}
              style={{ left: `${(offsetMs / visibleMaxTimeMs) * 100}%` }}
            >
              <Tooltip
                mouseEnterDelay={0.08}
                placement="top"
                overlayClassName="runner-frame-preview-tooltip"
                title={
                  <figure className="runner-frame-preview">
                    <img
                      alt={`${frame.label}, enlarged frame ${index + 1}`}
                      src={frame.screenshot.base64}
                    />
                    <figcaption>
                      <span>
                        {formatTimelineTime(offsetMs)} · {index + 1} /{' '}
                        {positionedFrames.length}
                      </span>
                      <strong>{frame.label}</strong>
                    </figcaption>
                  </figure>
                }
              >
                <figure className="runner-visual-timeline-frame runner-visual-frame">
                  <img
                    alt={`${frame.label}, frame ${index + 1}`}
                    loading="lazy"
                    src={frame.screenshot.base64}
                  />
                  <span className="runner-visual-frame-index">{index + 1}</span>
                </figure>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: 'success' | 'warning' | 'danger';
}): JSX.Element {
  return (
    <div className={`runner-metric-card${tone ? ` is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function CasePreview({
  item,
  visualIndex,
  frames: providedFrames,
  onOpen,
}: {
  item: RunnerCaseView;
  visualIndex: RunnerVisualIndex;
  frames?: RunnerVisualFrame[];
  onOpen(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const story = getCaseStory(item.testCase);
  const frames =
    providedFrames ?? getAllAttemptVisualFrames(item.finalAttempt, visualIndex);
  const failure = getCaseFailure(item.testCase);
  return (
    <article className="runner-case-row" data-case-key={item.key}>
      <div className="runner-case-main">
        <div className="runner-case-title-row">
          <CaseStatus status={item.status} />
          <button
            type="button"
            className="runner-case-title-button"
            aria-label={`Open ${item.testCase.name} in project ${item.project.name}`}
            onClick={() => onOpen(item)}
          >
            <h3>{item.testCase.name}</h3>
          </button>
        </div>
        <div className="runner-case-meta">
          <span>{item.project.name}</span>
          <span>{item.project.platform}</span>
          <span>{item.document.sourcePath}</span>
          <span>{formatDuration(item.durationMs)}</span>
          <span>
            {item.testCase.attempts.length}{' '}
            {item.testCase.attempts.length === 1 ? 'attempt' : 'attempts'}
          </span>
        </div>
        {failure ? (
          <div className="runner-case-failure">
            <WarningFilled />
            <Tooltip
              title={`${failure.node}: ${
                failure.error?.message || 'Step failed'
              }`}
            >
              <span>
                {failure.node}: {failure.error?.message || 'Step failed'}
              </span>
            </Tooltip>
            <button
              type="button"
              aria-label={`Inspect failure in ${item.testCase.name}, project ${item.project.name}`}
              onClick={() => onOpen(item, failure.id)}
            >
              Inspect failure
            </button>
          </div>
        ) : null}
        <StorySteps steps={story} />
      </div>
      <VisualTimeline
        frames={frames}
        durationMs={item.finalAttempt?.durationMs ?? item.durationMs}
      />
      <button
        type="button"
        className="runner-case-open-button"
        onClick={() => onOpen(item)}
        aria-label={`Open ${item.testCase.name} in project ${item.project.name}`}
      >
        <RightOutlined className="runner-case-chevron" />
      </button>
    </article>
  );
}

const projectDisplayStatus = (item: RunnerProjectView): RunnerCaseStatus => {
  if (item.project.status === 'failed' || item.failedCount > 0) return 'failed';
  if (item.retryPassedCount > 0) return 'retry-passed';
  if (!item.cases.length || item.notRunCount > 0) return 'not-run';
  return 'passed';
};

function ProjectBreakdownCase({
  item,
  displayMode,
  visualIndex,
  onOpen,
}: {
  item: RunnerCaseView;
  displayMode: RunnerCaseDisplayMode;
  visualIndex: RunnerVisualIndex;
  onOpen(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  if (displayMode === 'detailed') {
    return (
      <li className="runner-project-tree-case-item is-detailed">
        <CasePreview item={item} visualIndex={visualIndex} onOpen={onOpen} />
      </li>
    );
  }

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
    <li className="runner-project-tree-case-item" data-case-key={item.key}>
      <button
        type="button"
        className="runner-project-tree-case"
        onClick={() => onOpen(item, failure?.id)}
        aria-label={`Open ${item.testCase.name} in project ${item.project.name}${
          failure ? ' at the failed Step' : ''
        }`}
      >
        <span className={`runner-project-tree-branch is-${item.status}`} />
        <CaseStatus status={item.status} />
        <div className="runner-project-tree-case-main">
          <Tooltip title={item.testCase.name} mouseEnterDelay={0.25}>
            <h3>{item.testCase.name}</h3>
          </Tooltip>
          <Tooltip title={item.document.sourcePath} mouseEnterDelay={0.25}>
            <span>{item.document.sourcePath}</span>
          </Tooltip>
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
        <span className="runner-project-tree-case-attempts">
          {attemptCount} {attemptCount === 1 ? 'attempt' : 'attempts'}
        </span>
        <time>{formatDuration(item.durationMs)}</time>
        <RightOutlined className="runner-project-tree-case-chevron" />
      </button>
    </li>
  );
}

function ProjectBreakdownNode({
  view,
  expanded,
  caseDisplayMode,
  visualIndex,
  onToggle,
  onOpenProject,
  onOpenCase,
}: {
  view: RunnerProjectBreakdownView;
  expanded: boolean;
  caseDisplayMode: RunnerCaseDisplayMode;
  visualIndex: RunnerVisualIndex;
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
            <CaseStatus status={projectDisplayStatus(item)} />
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
            <DashboardOutlined />
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
                item={caseItem}
                key={caseItem.key}
                displayMode={caseDisplayMode}
                visualIndex={visualIndex}
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

function ProjectBreakdownTree({
  projects,
  caseDisplayMode,
  visualIndex,
  expandedProjectKeys,
  onExpandedProjectKeysChange,
  hasActiveFilters,
  onResetFilters,
  onOpenProject,
  onOpenCase,
}: {
  projects: RunnerProjectBreakdownView[];
  caseDisplayMode: RunnerCaseDisplayMode;
  visualIndex: RunnerVisualIndex;
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
            view={view}
            key={view.item.key}
            expanded={expandedProjectKeys.has(view.item.key)}
            caseDisplayMode={caseDisplayMode}
            visualIndex={visualIndex}
            onToggle={() => toggleProject(view.item.key)}
            onOpenProject={onOpenProject}
            onOpenCase={onOpenCase}
          />
        ))}
      </ul>
    </>
  );
}

function ProjectWorkspace({
  item,
  visualIndex,
  onBack,
  onOpenCase,
}: {
  item: RunnerProjectView;
  visualIndex: RunnerVisualIndex;
  onBack(): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const [visibleLimit, setVisibleLimit] = useState(25);
  const cases = useMemo(
    () =>
      [...item.cases].sort(
        (a, b) =>
          statusSortWeight[a.status] - statusSortWeight[b.status] ||
          b.durationMs - a.durationMs,
      ),
    [item.cases],
  );
  const visibleCases = cases.slice(0, visibleLimit);

  return (
    <div className="runner-page runner-project-workspace">
      <button type="button" className="runner-back-button" onClick={onBack}>
        <ArrowLeftOutlined />
        Overview
      </button>
      <div className="runner-case-workspace-heading">
        <div>
          <CaseStatus status={projectDisplayStatus(item)} />
          <h1>{item.project.name}</h1>
          <div className="runner-case-meta">
            <span>{item.project.platform}</span>
            <span>
              {item.project.documents.length}{' '}
              {item.project.documents.length === 1 ? 'document' : 'documents'}
            </span>
            <span>Retry limit {item.project.retry}</span>
          </div>
        </div>
      </div>

      <section
        className="runner-primary-metrics runner-project-metrics"
        aria-label="Project health"
      >
        <MetricCard
          label="Final pass rate"
          value={formatPercent(item.health.finalPassRate)}
          note={`${item.passedCount} of ${item.health.executed} executed cases`}
          tone={item.failedCount ? 'danger' : 'success'}
        />
        <MetricCard
          label="First-pass rate"
          value={formatPercent(item.health.firstPassRate)}
          note={`${item.health.firstPassCount} passed without retry`}
          tone={item.retryPassedCount ? 'warning' : 'success'}
        />
        <MetricCard
          label="Failed"
          value={item.failedCount}
          note="Final failures"
          tone={item.failedCount ? 'danger' : undefined}
        />
        <MetricCard
          label="Passed after retry"
          value={item.retryPassedCount}
          note="Potentially flaky"
          tone={item.retryPassedCount ? 'warning' : undefined}
        />
        <MetricCard
          label="Not run"
          value={item.notRunCount}
          note="Blocked or skipped"
        />
        <MetricCard
          label="Project time"
          value={formatDuration(item.durationMs)}
          note="Setup through teardown"
        />
      </section>

      {item.project.lifecycle?.setupError ? (
        <Alert
          className="runner-project-alert"
          type="error"
          showIcon
          message="Project setup failed"
          description={item.project.lifecycle.setupError.message}
        />
      ) : null}
      {item.project.collectionErrors.map((collectionError) => (
        <Alert
          className="runner-project-alert"
          key={collectionError.sourcePath}
          type="error"
          showIcon
          message={`Could not collect ${collectionError.sourcePath}`}
          description={collectionError.error.message}
        />
      ))}

      <section className="runner-panel runner-project-cases">
        <div className="runner-section-heading">
          <div>
            <div className="runner-eyebrow">Project cases</div>
            <h2>What happened in {item.project.name}</h2>
          </div>
          <span className="runner-result-count">{cases.length} cases</span>
        </div>
        {visibleCases.length ? (
          <div className="runner-case-list">
            {visibleCases.map((caseItem) => (
              <CasePreview
                item={caseItem}
                key={caseItem.key}
                visualIndex={visualIndex}
                onOpen={onOpenCase}
              />
            ))}
            {visibleLimit < cases.length ? (
              <div className="runner-load-more">
                <Button
                  onClick={() => setVisibleLimit((current) => current + 25)}
                >
                  Load 25 more
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="runner-empty-results">
            <Empty description="No cases were collected for this project" />
          </div>
        )}
      </section>
    </div>
  );
}

function RunOverview({
  dump,
  cases,
  health,
  projects,
  visualIndex,
  caseDisplayMode,
  onCaseDisplayModeChange,
  expandedProjectKeys,
  onExpandedProjectKeysChange,
  onOpenCase,
  onOpenProject,
}: {
  dump: TestRunReportDump;
  cases: RunnerCaseView[];
  health: RunnerHealthStats;
  projects: RunnerProjectView[];
  visualIndex: RunnerVisualIndex;
  caseDisplayMode: RunnerCaseDisplayMode;
  onCaseDisplayModeChange(mode: RunnerCaseDisplayMode): void;
  expandedProjectKeys: Set<string>;
  onExpandedProjectKeysChange(keys: Set<string>): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
  onOpenProject(item: RunnerProjectView): void;
}): JSX.Element {
  const [breakdownQuery, setBreakdownQuery] = useState('');
  const [breakdownStatus, setBreakdownStatus] =
    useState<RunnerBreakdownStatus>('all');
  const [breakdownSort, setBreakdownSort] =
    useState<RunnerBreakdownSort>('attention');
  const breakdownStatusCounts = useMemo(
    () => ({
      all: cases.length,
      attention: cases.filter((item) => item.status !== 'passed').length,
      failed: cases.filter((item) => item.status === 'failed').length,
      'retry-passed': cases.filter((item) => item.status === 'retry-passed')
        .length,
      passed: cases.filter((item) => item.status === 'passed').length,
      'not-run': cases.filter((item) => item.status === 'not-run').length,
    }),
    [cases],
  );
  const breakdownProjects = useMemo(
    () =>
      filterAndSortRunnerProjectBreakdown(projects, {
        query: breakdownQuery,
        status: breakdownStatus,
        sort: breakdownSort,
      }),
    [breakdownQuery, breakdownSort, breakdownStatus, projects],
  );
  const resetBreakdownFilters = () => {
    setBreakdownQuery('');
    setBreakdownStatus('all');
    setBreakdownSort('attention');
  };
  const hasActiveBreakdownFilters =
    Boolean(breakdownQuery.trim()) ||
    breakdownStatus !== 'all' ||
    breakdownSort !== 'attention';
  const successfulWithRetries =
    dump.summary.failed === 0 &&
    dump.summary.notRun === 0 &&
    health.retryPassedCount > 0;
  const healthLabel =
    dump.status === 'failed'
      ? 'Action required'
      : successfulWithRetries
        ? 'Passed with retries'
        : 'All checks passed';

  return (
    <div className="runner-page runner-overview">
      <section className="runner-overview-hero">
        <div>
          <div className="runner-eyebrow">Test run</div>
          <h1>{healthLabel}</h1>
          <p>
            {dump.runId} · {formatTimestamp(dump.startedAt)}
          </p>
        </div>
        <div
          className={`runner-health-mark ${
            dump.status === 'failed'
              ? 'is-failed'
              : successfulWithRetries
                ? 'is-warning'
                : 'is-success'
          }`}
        >
          {dump.status === 'failed' ? (
            <CloseCircleFilled />
          ) : successfulWithRetries ? (
            <ReloadOutlined />
          ) : (
            <CheckCircleFilled />
          )}
        </div>
      </section>

      <section className="runner-primary-metrics" aria-label="Run health">
        <MetricCard
          label="Final pass rate"
          value={formatPercent(health.finalPassRate)}
          note={`${dump.summary.passed} of ${health.executed} executed cases`}
          tone={dump.summary.failed ? 'danger' : 'success'}
        />
        <MetricCard
          label="First-pass rate"
          value={formatPercent(health.firstPassRate)}
          note={`${health.firstPassCount} passed without retry`}
          tone={health.retryPassedCount ? 'warning' : 'success'}
        />
        <MetricCard
          label="Failed"
          value={dump.summary.failed}
          note="Final failures"
          tone={dump.summary.failed ? 'danger' : undefined}
        />
        <MetricCard
          label="Passed after retry"
          value={health.retryPassedCount}
          note="Potentially flaky"
          tone={health.retryPassedCount ? 'warning' : undefined}
        />
        <MetricCard
          label="Not run"
          value={dump.summary.notRun}
          note="Blocked or skipped"
        />
        <MetricCard
          label="Total runner time"
          value={formatDuration(dump.durationMs)}
          note="Wall-clock time from run start to final summary"
        />
      </section>

      <section className="runner-secondary-metrics">
        <span>
          <strong>{dump.projects.length}</strong> projects
        </span>
        <span>
          <strong>{formatDuration(dump.metrics.modelTimeMs)}</strong> model time
        </span>
        <span>
          <strong>{dump.metrics.modelCallCount}</strong> model calls
        </span>
        <span>
          <strong>{dump.metrics.totalTokens.toLocaleString()}</strong> tokens
        </span>
        <small>
          Runner time is wall-clock; model time is cumulative across calls and
          may overlap when projects run in parallel.
        </small>
      </section>

      <section className="runner-panel">
        <div className="runner-section-heading">
          <div>
            <div className="runner-eyebrow">Breakdown</div>
            <h2>Projects and cases</h2>
            <p className="runner-section-description">
              Scan Project health, then choose how much Case evidence to show.
            </p>
          </div>
          <div className="runner-breakdown-view-switch">
            <span>Case rows</span>
            <Segmented
              aria-label="Case row detail"
              size="small"
              value={caseDisplayMode}
              options={[
                { label: 'Compact', value: 'compact' },
                { label: 'Detailed', value: 'detailed' },
              ]}
              onChange={(value) =>
                onCaseDisplayModeChange(value as RunnerCaseDisplayMode)
              }
            />
          </div>
        </div>
        <div
          className="runner-breakdown-toolbar"
          aria-label="Filter and sort Project breakdown"
        >
          <Input
            prefix={<SearchOutlined />}
            suffix={
              <button
                type="button"
                className={`runner-search-clear${
                  breakdownQuery ? '' : ' is-hidden'
                }`}
                aria-label="Clear breakdown search"
                aria-hidden={!breakdownQuery}
                disabled={!breakdownQuery}
                onClick={() => setBreakdownQuery('')}
              >
                <CloseCircleFilled />
              </button>
            }
            placeholder="Search projects, cases, errors, IDs, or steps"
            value={breakdownQuery}
            onChange={(event) => setBreakdownQuery(event.target.value)}
          />
          <Select
            aria-label="Filter breakdown by status"
            value={breakdownStatus}
            onChange={(value: RunnerBreakdownStatus) =>
              setBreakdownStatus(value)
            }
            options={[
              {
                label: `All cases (${breakdownStatusCounts.all})`,
                value: 'all',
              },
              {
                label: `Needs attention (${breakdownStatusCounts.attention})`,
                value: 'attention',
              },
              {
                label: `Failed (${breakdownStatusCounts.failed})`,
                value: 'failed',
              },
              {
                label: `Passed after retry (${breakdownStatusCounts['retry-passed']})`,
                value: 'retry-passed',
              },
              {
                label: `Passed (${breakdownStatusCounts.passed})`,
                value: 'passed',
              },
              {
                label: `Not run (${breakdownStatusCounts['not-run']})`,
                value: 'not-run',
              },
            ]}
          />
          <Select
            aria-label="Sort Project breakdown"
            value={breakdownSort}
            onChange={(value: RunnerBreakdownSort) => setBreakdownSort(value)}
            options={[
              { label: 'Attention first', value: 'attention' },
              { label: 'Most issues', value: 'issues' },
              { label: 'Longest duration', value: 'duration' },
              { label: 'Project / case name', value: 'name' },
            ]}
          />
        </div>
        <ProjectBreakdownTree
          projects={breakdownProjects}
          caseDisplayMode={caseDisplayMode}
          visualIndex={visualIndex}
          expandedProjectKeys={expandedProjectKeys}
          onExpandedProjectKeysChange={onExpandedProjectKeysChange}
          hasActiveFilters={hasActiveBreakdownFilters}
          onResetFilters={resetBreakdownFilters}
          onOpenProject={onOpenProject}
          onOpenCase={onOpenCase}
        />
      </section>

      {dump.diagnostics?.length ? (
        <section className="runner-panel runner-diagnostics">
          <div className="runner-section-heading">
            <div>
              <div className="runner-eyebrow">Report assembly</div>
              <h2>Diagnostics</h2>
            </div>
          </div>
          {dump.diagnostics.map((diagnostic, index) => (
            <Alert
              key={`${diagnostic.code}-${diagnostic.scopeId ?? index}`}
              type={diagnostic.level === 'error' ? 'error' : 'warning'}
              showIcon
              message={diagnostic.message}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

const buildAgentReports = (
  step: TestRunReportStep | undefined,
  reports: readonly PlaywrightTasks[],
): PlaywrightTasks[] => {
  if (!step?.agentDetails?.length) return [];
  const idsByReport = new Map<string, Set<string>>();
  for (const detail of step.agentDetails) {
    const ids = idsByReport.get(detail.reportId) ?? new Set<string>();
    ids.add(detail.executionId);
    idsByReport.set(detail.reportId, ids);
  }

  const selectedReports: PlaywrightTasks[] = [];
  for (const [reportId, executionIds] of idsByReport) {
    const source = reports.find((report) => report.reportId === reportId);
    if (!source) continue;
    let cached: GroupedActionDump | undefined;
    selectedReports.push({
      reportId,
      runnerScopeId: source.runnerScopeId,
      attributes: {
        playwright_test_description: step.title ?? '',
        playwright_test_id: step.id,
        playwright_test_title: step.node,
        playwright_test_status: step.status === 'success' ? 'passed' : 'failed',
        playwright_test_duration: step.durationMs,
        is_merged: idsByReport.size > 1,
      },
      get: () => {
        if (!cached) {
          const sourceDump = source.get();
          cached = new GroupedActionDump({
            sdkVersion: sourceDump.sdkVersion,
            groupName: sourceDump.groupName,
            groupDescription: sourceDump.groupDescription,
            modelBriefs: sourceDump.modelBriefs,
            deviceType: sourceDump.deviceType,
            executions: sourceDump.executions.filter(
              (execution) => execution.id && executionIds.has(execution.id),
            ),
          });
        }
        return cached;
      },
    });
  }
  return selectedReports;
};

const buildRunnerTracePageHref = (stepId: string): string => {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(
    url.hash.startsWith('#') ? url.hash.slice(1) : url.hash,
  );
  params.set('runner-step', stepId);
  params.set('runner-trace', 'page');
  url.hash = params.toString();
  return url.toString();
};

function RunnerAgentTraceContent({
  step,
  reports,
  renderAgentReport,
}: {
  step: TestRunReportStep;
  reports: readonly PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
}): JSX.Element {
  const agentReports = useMemo(
    () => buildAgentReports(step, reports),
    [reports, step],
  );

  return (
    <div className="runner-agent-trace-content">
      {step.agentDetailDiagnostic ? (
        <Alert type="warning" showIcon message={step.agentDetailDiagnostic} />
      ) : null}
      {agentReports.length ? (
        <div className="runner-detail-trace-view">
          {renderAgentReport(agentReports)}
        </div>
      ) : (
        <Alert
          type="error"
          showIcon
          message="The referenced Agent report group is missing."
        />
      )}
    </div>
  );
}

type RunnerInspectorTab = 'io' | 'logs';

interface RunnerStepGroup {
  label: string;
  steps: TestRunReportStep[];
}

const getCaseWorkspaceStepGroups = (
  item: RunnerCaseView,
  attempt: TestRunReportAttempt,
): RunnerStepGroup[] =>
  [
    { label: 'Document setup', steps: item.document.beforeAll },
    { label: 'Before each', steps: attempt.beforeEach },
    { label: 'Case steps', steps: attempt.steps },
    { label: 'After each', steps: attempt.afterEach },
    { label: 'Document teardown', steps: item.document.afterAll },
  ].filter((group) => group.steps.length);

const getDefaultCaseWorkspaceStep = (
  item: RunnerCaseView,
  attempt: TestRunReportAttempt,
): TestRunReportStep | undefined => {
  const attemptSteps = flattenAttemptSteps(attempt);
  return (
    attemptSteps.find((step) => step.status === 'failed') ??
    attempt.steps.find((step) => step.agentDetails?.length) ??
    attempt.steps[0] ??
    attemptSteps[0] ??
    item.document.beforeAll[0] ??
    item.document.afterAll[0]
  );
};

function RunnerStepTypeIcon({
  step,
}: { step: TestRunReportStep }): JSX.Element {
  if (step.status === 'failed') return <BugOutlined />;
  if (step.agentDetails?.length) return <ThunderboltFilled />;
  if (step.node.toLocaleLowerCase().includes('assert')) return <EyeOutlined />;
  if (step.phase !== 'steps') return <SettingOutlined />;
  return <DatabaseOutlined />;
}

function RunnerExecutionPanel({
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

function RunnerAttemptTimeline({
  attempt,
  frames,
  selectedStepId,
  previewFrameKey,
  lockedFrameKey,
  isPlaying,
  onPreview,
  onSelectFrame,
  onTogglePlay,
}: {
  attempt: TestRunReportAttempt;
  frames: readonly RunnerPositionedVisualFrame[];
  selectedStepId?: string;
  previewFrameKey?: string;
  lockedFrameKey?: string;
  isPlaying: boolean;
  onPreview(frameKey: string | undefined): void;
  onSelectFrame(frame: RunnerPositionedVisualFrame): void;
  onTogglePlay(): void;
}): JSX.Element {
  const measuredDurationMs = Math.max(
    0,
    Date.parse(attempt.endedAt) - Date.parse(attempt.startedAt),
  );
  const timelineDurationMs = Math.max(
    1,
    attempt.durationMs,
    measuredDurationMs,
    frames.at(-1)?.offsetMs ?? 0,
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => ratio * timelineDurationMs,
  );
  const previewFrame = frames.find(
    (item) => item.frame.key === previewFrameKey,
  );

  return (
    <section
      className="runner-detail-timeline-card"
      aria-label="Attempt visual timeline"
    >
      <div className="runner-detail-timeline-toolbar">
        <span>
          <PictureOutlined />
          <strong>Visual timeline</strong>
          <small>Hover to preview · click to lock</small>
        </span>
        <span>
          <small>{frames.length} captured frames</small>
          <button
            type="button"
            disabled={!frames.length}
            onClick={onTogglePlay}
          >
            {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        </span>
      </div>
      {frames.length ? (
        <div
          className="runner-detail-timeline-track"
          onMouseLeave={() => onPreview(undefined)}
        >
          <div className="runner-detail-timeline-axis" aria-hidden="true">
            {ticks.map((tick, index) => (
              <span key={`${tick}-${index}`} style={{ left: `${index * 25}%` }}>
                {formatTimelineTime(tick)}
              </span>
            ))}
          </div>
          <div className="runner-detail-timeline-lane">
            {ticks.map((tick, index) => (
              <i key={`${tick}-${index}`} style={{ left: `${index * 25}%` }} />
            ))}
            {frames.map((item, index) => {
              const isPreview = item.frame.key === previewFrameKey;
              const isLocked = item.frame.key === lockedFrameKey;
              const isSelectedStep = item.stepId === selectedStepId;
              return (
                <button
                  type="button"
                  aria-label={`${item.frame.label} at ${formatTimelineTime(
                    item.offsetMs,
                  )}`}
                  aria-pressed={isLocked}
                  className={`runner-detail-timeline-frame ${
                    isSelectedStep || isLocked ? 'is-selected' : ''
                  } ${isPreview ? 'is-preview' : ''}`}
                  key={`${item.frame.key}-${index}`}
                  style={{
                    left: `${Math.max(5, Math.min(95, item.offsetPercent))}%`,
                    zIndex: index + 2,
                  }}
                  onBlur={() => onPreview(undefined)}
                  onClick={() => onSelectFrame(item)}
                  onFocus={() => onPreview(item.frame.key)}
                  onMouseEnter={() => onPreview(item.frame.key)}
                >
                  <img
                    alt="Captured application state"
                    loading="lazy"
                    src={item.frame.screenshot.base64}
                  />
                  <span>{index + 1}</span>
                </button>
              );
            })}
            {previewFrame ? (
              <div
                className="runner-detail-timeline-preview-callout"
                style={{
                  left: `${Math.max(
                    7,
                    Math.min(78, previewFrame.offsetPercent),
                  )}%`,
                }}
              >
                <strong>{previewFrame.frame.label}</strong>
                <small>
                  {formatTimelineTime(previewFrame.offsetMs)} · click to lock
                </small>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="runner-detail-no-visual">
          <PictureOutlined />
          <span>
            No visual evidence was captured in this Attempt. The execution steps
            and runtime data are still available below.
          </span>
        </div>
      )}
    </section>
  );
}

const copyRunnerText = async (value: string): Promise<void> => {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard access is unavailable in this browser.');
  }
  await navigator.clipboard.writeText(value);
};

function RunnerEvidenceInspector({
  item,
  attempt,
  step,
  activeFrame,
  activePosition,
  tab,
  traceDrawerOpen,
  reports,
  renderAgentReport,
  onTabChange,
  onTraceDrawerOpenChange,
}: {
  item: RunnerCaseView;
  attempt: TestRunReportAttempt;
  step: TestRunReportStep;
  activeFrame?: RunnerVisualFrame;
  activePosition?: RunnerPositionedVisualFrame;
  tab: RunnerInspectorTab;
  traceDrawerOpen: boolean;
  reports: PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
  onTabChange(tab: RunnerInspectorTab): void;
  onTraceDrawerOpenChange(open: boolean): void;
}): JSX.Element {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const hasAgentTrace = Boolean(step.agentDetails?.length);
  const tracePageHref = hasAgentTrace
    ? buildRunnerTracePageHref(step.id)
    : undefined;

  useEffect(() => setCopyState('idle'), [step.id]);

  const copyError = async () => {
    try {
      await copyRunnerText(
        [step.error?.code, step.error?.name, step.error?.message]
          .filter(Boolean)
          .join(': '),
      );
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const renderInspectorTab = (): ReactNode => {
    if (tab === 'io') {
      return (
        <div className="runner-detail-io-grid">
          <section>
            <h4>Input</h4>
            {reportValue(step.input) ?? (
              <span className="runner-muted">None</span>
            )}
          </section>
          <section>
            <h4>Output</h4>
            {reportValue(step.output?.data) ?? (
              <span className="runner-muted">None</span>
            )}
            {step.output?.summary ? <p>{step.output.summary}</p> : null}
          </section>
        </div>
      );
    }
    if (tab === 'logs') {
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
    return null;
  };

  return (
    <section className="runner-detail-evidence-panel">
      <header className="runner-detail-evidence-heading">
        <div>
          <div className="runner-eyebrow">
            {step.phase} · Step {step.stepIndex + 1}
          </div>
          <h2>{step.node}</h2>
          {step.title ? <p>{step.title}</p> : null}
        </div>
        <div className="runner-detail-evidence-actions">
          {hasAgentTrace ? (
            <div className="runner-detail-trace-actions">
              <Button
                type="primary"
                size="middle"
                icon={<ThunderboltFilled />}
                className="runner-detail-trace-open"
                aria-label="Inspect AI trace in side drawer"
                onClick={() => onTraceDrawerOpenChange(true)}
              >
                Inspect AI trace
              </Button>
              <Button
                size="middle"
                icon={<ExportOutlined />}
                className="runner-detail-trace-new-page"
                aria-label="Open AI trace in new tab"
                href={tracePageHref}
                target="_blank"
                rel="noreferrer"
              >
                Open AI trace in new tab
              </Button>
            </div>
          ) : null}
          <Tag color={step.status === 'success' ? 'success' : 'error'}>
            {step.status === 'success' ? 'Passed' : 'Failed'}
          </Tag>
        </div>
      </header>
      {step.error ? (
        <div className="runner-detail-failure-summary">
          <CloseCircleFilled />
          <span>
            <strong>{step.error.code || step.error.name}</strong>
            <small>{step.error.message}</small>
          </span>
          <button type="button" onClick={copyError}>
            <CopyOutlined />
            {copyState === 'copied'
              ? 'Copied'
              : copyState === 'failed'
                ? 'Copy failed'
                : 'Copy error'}
          </button>
        </div>
      ) : null}
      <div className="runner-detail-evidence-workspace">
        <section className="runner-detail-screenshot-stage">
          <div className="runner-detail-screenshot-toolbar">
            <span>
              <PictureOutlined />
              {activeFrame?.label || 'Step screenshot'}
            </span>
            <span>
              {activePosition
                ? formatTimelineTime(activePosition.offsetMs)
                : 'No frame'}
            </span>
          </div>
          <div className="runner-detail-screenshot-canvas">
            {activeFrame ? (
              <img
                alt={`Captured evidence for ${step.node}`}
                src={activeFrame.screenshot.base64}
              />
            ) : (
              <div>
                <PictureOutlined />
                <strong>No screenshot for this Step</strong>
                <span>Inspect the Step data and runtime events instead.</span>
              </div>
            )}
          </div>
          <div className="runner-detail-screenshot-caption">
            <EyeOutlined />
            Hovering the timeline previews frames without changing the locked
            Step. Click a frame to lock it and jump to its owning Step.
          </div>
        </section>
        <section className="runner-detail-inspector">
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
                onClick={() => onTabChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="runner-detail-inspector-content">
            {renderInspectorTab()}
          </div>
          <details className="runner-detail-raw-context">
            <summary>
              <CodeOutlined /> Stable IDs and raw context
            </summary>
            <dl>
              <div>
                <dt>Project ID</dt>
                <dd title={item.project.projectId}>{item.project.projectId}</dd>
              </div>
              <div>
                <dt>Case ID</dt>
                <dd title={item.testCase.caseId}>{item.testCase.caseId}</dd>
              </div>
              <div>
                <dt>Attempt ID</dt>
                <dd title={attempt.attemptId}>{attempt.attemptId}</dd>
              </div>
              <div>
                <dt>Step ID</dt>
                <dd title={step.id}>{step.id}</dd>
              </div>
            </dl>
          </details>
        </section>
      </div>
      {hasAgentTrace ? (
        <Drawer
          title={`AI trace · ${step.node}`}
          placement="right"
          width="min(1680px, calc(100vw - 24px))"
          open={traceDrawerOpen}
          onClose={() => onTraceDrawerOpenChange(false)}
          destroyOnClose
          rootClassName="runner-detail-trace-drawer"
          extra={
            <Button
              size="small"
              icon={<ExportOutlined />}
              aria-label="Open AI trace in new tab"
              href={tracePageHref}
              target="_blank"
              rel="noreferrer"
            >
              Open AI trace in new tab
            </Button>
          }
        >
          <RunnerAgentTraceContent
            step={step}
            reports={reports}
            renderAgentReport={renderAgentReport}
          />
        </Drawer>
      ) : null}
    </section>
  );
}

function RunnerTracePage({
  item,
  attempt,
  step,
  reports,
  renderAgentReport,
  onBack,
}: {
  item: RunnerCaseView;
  attempt: TestRunReportAttempt;
  step: TestRunReportStep;
  reports: PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
  onBack(): void;
}): JSX.Element {
  return (
    <div className="runner-page runner-trace-page">
      <section className="runner-trace-page-header">
        <button type="button" className="runner-back-button" onClick={onBack}>
          <ArrowLeftOutlined />
          Case details
        </button>
        <div className="runner-trace-page-heading">
          <div>
            <div className="runner-eyebrow">
              AI trace · Attempt {attempt.attemptIndex + 1}
            </div>
            <h1>{step.node}</h1>
            <p>
              {item.project.name} · {item.testCase.name}
            </p>
          </div>
          <Tag color={step.status === 'success' ? 'success' : 'error'}>
            {step.status === 'success' ? 'Passed' : 'Failed'}
          </Tag>
        </div>
      </section>
      <section className="runner-trace-page-content">
        <RunnerAgentTraceContent
          step={step}
          reports={reports}
          renderAgentReport={renderAgentReport}
        />
      </section>
    </div>
  );
}

function CaseWorkspace({
  item,
  visualIndex,
  reports,
  initialStepId,
  tracePage,
  renderAgentReport,
  onBack,
  onCloseTracePage,
  backLabel,
}: {
  item: RunnerCaseView;
  visualIndex: RunnerVisualIndex;
  reports: PlaywrightTasks[];
  initialStepId?: string;
  tracePage: boolean;
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
  onBack(): void;
  onCloseTracePage(): void;
  backLabel: string;
}): JSX.Element {
  const initialAttempt =
    item.testCase.attempts.find((attempt) =>
      flattenAttemptSteps(attempt).some((step) => step.id === initialStepId),
    ) ?? item.finalAttempt;
  const initialWorkspaceSteps = initialAttempt
    ? getCaseWorkspaceStepGroups(item, initialAttempt).flatMap(
        (group) => group.steps,
      )
    : [];
  const initialStep =
    initialWorkspaceSteps.find((step) => step.id === initialStepId) ??
    (initialAttempt
      ? getDefaultCaseWorkspaceStep(item, initialAttempt)
      : undefined);
  const [selectedAttemptId, setSelectedAttemptId] = useState(
    initialAttempt?.attemptId,
  );
  const [selectedStepId, setSelectedStepId] = useState(initialStep?.id);
  const [previewFrameKey, setPreviewFrameKey] = useState<string>();
  const [lockedFrameKey, setLockedFrameKey] = useState<string>();
  const [inspectorTab, setInspectorTab] = useState<RunnerInspectorTab>('io');
  const [traceDrawerOpen, setTraceDrawerOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIndexRef = useRef(0);
  const [copyLinkState, setCopyLinkState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');

  useEffect(() => {
    const nextAttempt =
      item.testCase.attempts.find((attempt) =>
        flattenAttemptSteps(attempt).some((step) => step.id === initialStepId),
      ) ?? item.finalAttempt;
    const nextSteps = nextAttempt
      ? getCaseWorkspaceStepGroups(item, nextAttempt).flatMap(
          (group) => group.steps,
        )
      : [];
    const nextStep =
      nextSteps.find((step) => step.id === initialStepId) ??
      (nextAttempt
        ? getDefaultCaseWorkspaceStep(item, nextAttempt)
        : undefined);
    setSelectedAttemptId(nextAttempt?.attemptId);
    setSelectedStepId(nextStep?.id);
    setPreviewFrameKey(undefined);
    setLockedFrameKey(undefined);
    setInspectorTab('io');
    setTraceDrawerOpen(false);
    setIsPlaying(false);
    setCopyLinkState('idle');
  }, [initialStepId, item.finalAttempt, item.key, item.testCase.attempts]);

  const selectedAttempt =
    item.testCase.attempts.find(
      (attempt) => attempt.attemptId === selectedAttemptId,
    ) ?? item.finalAttempt;
  const stepGroups = useMemo(
    () =>
      selectedAttempt ? getCaseWorkspaceStepGroups(item, selectedAttempt) : [],
    [item, selectedAttempt],
  );
  const workspaceSteps = useMemo(
    () => stepGroups.flatMap((group) => group.steps),
    [stepGroups],
  );
  const attemptSteps = useMemo(
    () => (selectedAttempt ? flattenAttemptSteps(selectedAttempt) : []),
    [selectedAttempt],
  );
  const selectedStep =
    workspaceSteps.find((step) => step.id === selectedStepId) ??
    (selectedAttempt
      ? getDefaultCaseWorkspaceStep(item, selectedAttempt)
      : undefined);
  const visualFrames = useMemo(
    () => getAllAttemptVisualFrames(selectedAttempt, visualIndex),
    [selectedAttempt, visualIndex],
  );
  const positionedFrames = useMemo(
    () =>
      selectedAttempt
        ? positionAttemptVisualFrames(selectedAttempt, visualFrames)
        : [],
    [selectedAttempt, visualFrames],
  );
  const previewFrame = visualFrames.find(
    (frame) => frame.key === previewFrameKey,
  );
  const lockedFrame = visualFrames.find(
    (frame) => frame.key === lockedFrameKey,
  );
  const defaultStepFrame = selectedStep
    ? getDefaultVisualFrameForStep(selectedStep, visualFrames)
    : visualFrames[0];
  const activeFrame = previewFrame ?? lockedFrame ?? defaultStepFrame;
  const activePosition = positionedFrames.find(
    (item) => item.frame.key === activeFrame?.key,
  );

  useEffect(() => {
    if (!isPlaying || !positionedFrames.length) return;
    const advance = () => {
      const nextFrame = positionedFrames[playbackIndexRef.current];
      if (!nextFrame) {
        setIsPlaying(false);
        return;
      }
      setPreviewFrameKey(undefined);
      setLockedFrameKey(nextFrame.frame.key);
      if (nextFrame.stepId) {
        setSelectedStepId(nextFrame.stepId);
        updateRunnerStepHash(nextFrame.stepId);
      }
      setInspectorTab('io');
      setTraceDrawerOpen(false);
      playbackIndexRef.current += 1;
    };
    advance();
    const interval = window.setInterval(advance, 900);
    return () => window.clearInterval(interval);
  }, [isPlaying, positionedFrames]);

  const selectAttempt = (attempt: TestRunReportAttempt) => {
    const nextStep = getDefaultCaseWorkspaceStep(item, attempt);
    setSelectedAttemptId(attempt.attemptId);
    setSelectedStepId(nextStep?.id);
    setPreviewFrameKey(undefined);
    setLockedFrameKey(undefined);
    setInspectorTab('io');
    setTraceDrawerOpen(false);
    setIsPlaying(false);
    clearRunnerStepHash();
  };
  const selectStep = (step: TestRunReportStep) => {
    setSelectedStepId(step.id);
    setPreviewFrameKey(undefined);
    setLockedFrameKey(getDefaultVisualFrameForStep(step, visualFrames)?.key);
    setInspectorTab('io');
    setTraceDrawerOpen(false);
    setIsPlaying(false);
    updateRunnerStepHash(step.id);
  };
  const selectFrame = (item: RunnerPositionedVisualFrame) => {
    setPreviewFrameKey(undefined);
    setLockedFrameKey(item.frame.key);
    const owningStep = getStepForVisualFrame(attemptSteps, item.frame);
    if (owningStep) {
      setSelectedStepId(owningStep.id);
      updateRunnerStepHash(owningStep.id);
    }
    setInspectorTab('io');
    setTraceDrawerOpen(false);
    setIsPlaying(false);
  };
  const selectInspectorTab = (tab: RunnerInspectorTab) => {
    setInspectorTab(tab);
  };
  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    const lockedIndex = positionedFrames.findIndex(
      (item) => item.frame.key === lockedFrameKey,
    );
    playbackIndexRef.current =
      lockedIndex < 0 || lockedIndex >= positionedFrames.length - 1
        ? 0
        : lockedIndex + 1;
    if (playbackIndexRef.current === 0) setLockedFrameKey(undefined);
    setIsPlaying(true);
  };
  const copyCaseLink = async () => {
    try {
      await copyRunnerText(window.location.href);
      setCopyLinkState('copied');
    } catch {
      setCopyLinkState('failed');
    }
  };

  if (tracePage && selectedAttempt && selectedStep?.agentDetails?.length) {
    return (
      <RunnerTracePage
        item={item}
        attempt={selectedAttempt}
        step={selectedStep}
        reports={reports}
        renderAgentReport={renderAgentReport}
        onBack={onCloseTracePage}
      />
    );
  }

  return (
    <div className="runner-page runner-case-workspace">
      <section className="runner-detail-case-header">
        <button type="button" className="runner-back-button" onClick={onBack}>
          <ArrowLeftOutlined />
          {backLabel}
        </button>
        <div className="runner-detail-heading-row">
          <div>
            <CaseStatus status={item.status} />
            <h1>{item.testCase.name}</h1>
            <div className="runner-case-meta">
              <span>{item.project.name}</span>
              <span>{item.project.platform}</span>
              <span>{item.document.sourcePath}</span>
              <span>{formatDuration(item.durationMs)} total</span>
            </div>
          </div>
          <button
            type="button"
            className="runner-detail-copy-link"
            onClick={copyCaseLink}
          >
            <LinkOutlined />
            {copyLinkState === 'copied'
              ? 'Copied'
              : copyLinkState === 'failed'
                ? 'Copy failed'
                : 'Copy case link'}
          </button>
        </div>
        <section className="runner-attempt-switcher" aria-label="Attempts">
          {item.testCase.attempts.map((attempt, index) => (
            <button
              type="button"
              key={attempt.attemptId}
              className={
                selectedAttempt?.attemptId === attempt.attemptId
                  ? 'is-selected'
                  : ''
              }
              onClick={() => selectAttempt(attempt)}
            >
              <StepStatus status={attempt.status} />
              <span>
                <strong>Attempt {attempt.attemptIndex + 1}</strong>
                <small>{formatDuration(attempt.durationMs)}</small>
              </span>
              <em>
                {attempt.status === 'failed' && index === 0
                  ? 'Original failure'
                  : index === item.testCase.attempts.length - 1
                    ? 'Final result'
                    : attempt.status}
              </em>
            </button>
          ))}
          {item.testCase.attempts.length > 1 ? (
            <div className="runner-detail-attempt-reading">
              <InfoCircleOutlined />
              Compare Attempts to see whether the retry changed behavior or only
              timing.
            </div>
          ) : null}
          {!item.testCase.attempts.length ? (
            <div className="runner-not-run-message">
              <ClockCircleOutlined />
              {item.testCase.notRunReason || 'This case was not executed.'}
            </div>
          ) : null}
        </section>
      </section>

      {selectedAttempt ? (
        <>
          <RunnerAttemptTimeline
            attempt={selectedAttempt}
            frames={positionedFrames}
            selectedStepId={selectedStep?.id}
            previewFrameKey={previewFrameKey}
            lockedFrameKey={lockedFrameKey}
            isPlaying={isPlaying}
            onPreview={setPreviewFrameKey}
            onSelectFrame={selectFrame}
            onTogglePlay={togglePlayback}
          />
          <div className="runner-detail-debug-workbench">
            <RunnerExecutionPanel
              groups={stepGroups}
              selectedStepId={selectedStep?.id}
              onSelect={selectStep}
            />
            {selectedStep ? (
              <RunnerEvidenceInspector
                key={`${selectedAttempt.attemptId}:${selectedStep.id}`}
                item={item}
                attempt={selectedAttempt}
                step={selectedStep}
                activeFrame={activeFrame}
                activePosition={activePosition}
                tab={inspectorTab}
                traceDrawerOpen={traceDrawerOpen}
                reports={reports}
                renderAgentReport={renderAgentReport}
                onTabChange={selectInspectorTab}
                onTraceDrawerOpenChange={setTraceDrawerOpen}
              />
            ) : (
              <div className="runner-select-step-hint">
                <BugOutlined />
                Select a Step to inspect its evidence and runtime data.
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

interface RunnerNavigationState {
  page: RunnerPage;
  selectedProjectId?: string;
  selectedCaseKey?: string;
  caseParent: RunnerCaseParent;
  deepLinkedStepId?: string;
}

const caseContainsStep = (
  item: RunnerCaseView,
  stepId: string | undefined,
): boolean =>
  Boolean(
    stepId &&
      (item.document.beforeAll.some((step) => step.id === stepId) ||
        item.document.afterAll.some((step) => step.id === stepId) ||
        item.testCase.attempts.some((attempt) =>
          flattenAttemptSteps(attempt).some((step) => step.id === stepId),
        )),
  );

const resolveRunnerNavigation = (
  hash: string,
  cases: readonly RunnerCaseView[],
  projects: readonly RunnerProjectView[],
): RunnerNavigationState => {
  const route = runnerRouteFromHash(hash);
  const stepId = runnerStepIdFromHash(hash);

  if (route.page === 'case') {
    const selectedCase = cases.find(
      (item) =>
        item.key === route.caseKey &&
        item.project.projectId === route.projectId,
    );
    if (selectedCase) {
      return {
        page: 'case',
        selectedProjectId: selectedCase.project.projectId,
        selectedCaseKey: selectedCase.key,
        caseParent: route.parent,
        deepLinkedStepId: caseContainsStep(selectedCase, stepId)
          ? stepId
          : undefined,
      };
    }
  }

  if (route.page === 'project') {
    const selectedProject = projects.find(
      (item) => item.project.projectId === route.projectId,
    );
    if (selectedProject) {
      return {
        page: 'project',
        selectedProjectId: selectedProject.project.projectId,
        caseParent: 'project',
      };
    }
  }

  const hasExplicitPage = new URLSearchParams(
    hash.startsWith('#') ? hash.slice(1) : '',
  ).has('runner-page');
  if (!hasExplicitPage && stepId) {
    const linkedCase = cases.find((item) => caseContainsStep(item, stepId));
    if (linkedCase) {
      return {
        page: 'case',
        selectedProjectId: linkedCase.project.projectId,
        selectedCaseKey: linkedCase.key,
        caseParent: 'overview',
        deepLinkedStepId: stepId,
      };
    }
  }

  return { page: 'overview', caseParent: 'overview' };
};

export default function TestRunnerReport({
  dump,
  reports,
  renderAgentReport,
}: TestRunnerReportProps): JSX.Element {
  const { darkModeEnabled: isDarkMode, setDarkModeEnabled: setIsDarkMode } =
    useGlobalPreference();
  const cases = useMemo(() => flattenRunnerCases(dump), [dump]);
  const health = useMemo(() => getRunnerHealth(cases), [cases]);
  const projects = useMemo(
    () => groupRunnerProjects(dump, cases),
    [cases, dump],
  );
  const visualIndex = useMemo(() => buildRunnerVisualIndex(reports), [reports]);
  const [caseDisplayMode, setCaseDisplayMode] =
    useState<RunnerCaseDisplayMode>('compact');
  const [expandedProjectKeys, setExpandedProjectKeys] = useState<Set<string>>(
    () =>
      getDefaultExpandedProjectKeys(
        projects.map((item) => ({ item, cases: item.cases })),
      ),
  );
  const [navigation, setNavigation] = useState<RunnerNavigationState>(() =>
    resolveRunnerNavigation(window.location.hash, cases, projects),
  );
  const mainRef = useRef<HTMLElement>(null);
  const overviewReturnStateRef = useRef<{
    scrollTop: number;
    caseKey?: string;
  }>({ scrollTop: 0 });
  const {
    page,
    selectedProjectId,
    selectedCaseKey,
    caseParent,
    deepLinkedStepId,
  } = navigation;
  const selectedProject = projects.find(
    (item) => item.project.projectId === selectedProjectId,
  );
  const selectedCase = cases.find((item) => item.key === selectedCaseKey);
  const tracePage =
    page === 'case' &&
    new URLSearchParams(window.location.hash.slice(1)).get('runner-trace') ===
      'page';

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      isDarkMode ? 'dark' : 'light',
    );
  }, [isDarkMode]);

  useEffect(() => {
    const syncNavigationFromUrl = () => {
      setNavigation(
        resolveRunnerNavigation(window.location.hash, cases, projects),
      );
      window.requestAnimationFrame(() => {
        if (mainRef.current) mainRef.current.scrollTop = 0;
      });
    };
    window.addEventListener('popstate', syncNavigationFromUrl);
    window.addEventListener('hashchange', syncNavigationFromUrl);
    return () => {
      window.removeEventListener('popstate', syncNavigationFromUrl);
      window.removeEventListener('hashchange', syncNavigationFromUrl);
    };
  }, [cases, projects]);

  const restoreView = ({
    scrollTop = 0,
    focusCaseKey,
  }: {
    scrollTop?: number;
    focusCaseKey?: string;
  } = {}) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const main = mainRef.current;
        if (!main) return;
        main.scrollTop = scrollTop;
        const caseRow = focusCaseKey
          ? Array.from(
              main.querySelectorAll<HTMLElement>('[data-case-key]'),
            ).find((row) => row.dataset.caseKey === focusCaseKey)
          : undefined;
        const focusTarget = caseRow?.querySelector(
          '.runner-case-title-button, .runner-project-tree-case',
        ) as HTMLElement | null | undefined;
        (focusTarget ?? main).focus({ preventScroll: true });
      });
    });
  };
  const navigate = (
    route: RunnerRoute,
    viewState: { scrollTop?: number; focusCaseKey?: string } = {},
  ) => {
    const nextHash = runnerHashForRoute(route, window.location.hash);
    if (nextHash !== (window.location.hash || '#')) {
      window.history.pushState({ midsceneRunnerRoute: true }, '', nextHash);
    }
    setNavigation(resolveRunnerNavigation(nextHash, cases, projects));
    restoreView(viewState);
  };
  const openProject = (item: RunnerProjectView) => {
    navigate({ page: 'project', projectId: item.project.projectId });
  };
  const openCase = (
    item: RunnerCaseView,
    parent: RunnerCaseParent = 'overview',
    stepId?: string,
  ) => {
    if (parent === 'overview') {
      overviewReturnStateRef.current = {
        scrollTop: mainRef.current?.scrollTop ?? 0,
        caseKey: item.key,
      };
    }
    navigate({
      page: 'case',
      caseKey: item.key,
      projectId: item.project.projectId,
      parent,
      stepId,
    });
  };
  const backFromCase = () => {
    if (caseParent === 'overview') {
      navigate(
        { page: 'overview' },
        {
          scrollTop: overviewReturnStateRef.current.scrollTop,
          focusCaseKey: overviewReturnStateRef.current.caseKey,
        },
      );
    } else {
      navigate(
        selectedProject
          ? {
              page: 'project',
              projectId: selectedProject.project.projectId,
            }
          : { page: 'overview' },
      );
    }
  };
  const closeTracePage = () => {
    if (!selectedCase) return;
    navigate({
      page: 'case',
      caseKey: selectedCase.key,
      projectId: selectedCase.project.projectId,
      parent: caseParent,
      stepId: deepLinkedStepId,
    });
  };

  return (
    <ConfigProvider
      theme={{
        ...globalThemeConfig(),
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <AntdApp component={false}>
        <div
          className="test-runner-report"
          data-theme={isDarkMode ? 'dark' : 'light'}
        >
          <header className="runner-header">
            <div className="runner-header-title">
              <Logo />
              <div>
                <strong>Test Runner Report</strong>
                <span>{dump.runId}</span>
              </div>
            </div>
            <div className="runner-header-actions">
              <div className="runner-header-result">
                <span>{dump.summary.passed} passed</span>
                {health.retryPassedCount ? (
                  <span>{health.retryPassedCount} retried</span>
                ) : null}
                {dump.summary.failed ? (
                  <span>{dump.summary.failed} failed</span>
                ) : null}
              </div>
              <button
                type="button"
                className="runner-theme-toggle"
                onClick={() => setIsDarkMode(!isDarkMode)}
                aria-label="Toggle theme"
              >
                {isDarkMode ? <SunOutlined /> : <MoonOutlined />}
              </button>
            </div>
          </header>
          <main
            ref={mainRef}
            className="runner-main"
            tabIndex={-1}
            aria-label="Test Runner report content"
          >
            {page === 'overview' ? (
              <RunOverview
                dump={dump}
                cases={cases}
                health={health}
                projects={projects}
                visualIndex={visualIndex}
                caseDisplayMode={caseDisplayMode}
                onCaseDisplayModeChange={setCaseDisplayMode}
                expandedProjectKeys={expandedProjectKeys}
                onExpandedProjectKeysChange={setExpandedProjectKeys}
                onOpenCase={(item, stepId) =>
                  openCase(item, 'overview', stepId)
                }
                onOpenProject={openProject}
              />
            ) : page === 'project' && selectedProject ? (
              <ProjectWorkspace
                key={selectedProject.key}
                item={selectedProject}
                visualIndex={visualIndex}
                onBack={() => navigate({ page: 'overview' })}
                onOpenCase={(item, stepId) => openCase(item, 'project', stepId)}
              />
            ) : page === 'case' && selectedCase ? (
              <CaseWorkspace
                key={selectedCase.key}
                backLabel={
                  caseParent === 'overview'
                    ? 'Overview'
                    : selectedProject?.project.name || 'Project'
                }
                item={selectedCase}
                visualIndex={visualIndex}
                reports={reports}
                initialStepId={deepLinkedStepId}
                tracePage={tracePage}
                renderAgentReport={renderAgentReport}
                onBack={backFromCase}
                onCloseTracePage={closeTracePage}
              />
            ) : (
              <RunOverview
                dump={dump}
                cases={cases}
                health={health}
                projects={projects}
                visualIndex={visualIndex}
                caseDisplayMode={caseDisplayMode}
                onCaseDisplayModeChange={setCaseDisplayMode}
                expandedProjectKeys={expandedProjectKeys}
                onExpandedProjectKeysChange={setExpandedProjectKeys}
                onOpenCase={(item, stepId) =>
                  openCase(item, 'overview', stepId)
                }
                onOpenProject={openProject}
              />
            )}
          </main>
        </div>
      </AntdApp>
    </ConfigProvider>
  );
}
