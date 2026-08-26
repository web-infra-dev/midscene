import './index.less';

import {
  ArrowLeftOutlined,
  BarsOutlined,
  BugOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  DashboardOutlined,
  DownOutlined,
  MoonOutlined,
  PictureOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  SunOutlined,
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
  Empty,
  Input,
  Select,
  Tag,
  Tooltip,
  theme,
} from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PlaywrightTasks } from '../../types';
import {
  type RunnerCaseFilters,
  type RunnerCaseSort,
  type RunnerRoute,
  clearRunnerStepHash,
  defaultRunnerCaseFilters,
  runnerCaseFiltersFromHash,
  runnerHashForCaseFilters,
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
  type RunnerCaseStatus,
  type RunnerCaseView,
  type RunnerHealthStats,
  type RunnerProjectView,
  type RunnerVisualFrame,
  type RunnerVisualIndex,
  type RunnerVisualStoryItem,
  buildRunnerVisualIndex,
  flattenAttemptSteps,
  flattenRunnerCases,
  getAllAttemptVisualFrames,
  getAttemptVisualStory,
  getCaseFailure,
  getCaseSearchMatch,
  getCaseStory,
  getRunnerHealth,
  getStepDisplayName,
  groupRunnerProjects,
  statusSortWeight,
} from './model';

interface TestRunnerReportProps {
  dump: TestRunReportDump;
  reports: PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
}

type RunnerPage = RunnerRoute['page'];
type RunnerCaseParent = 'project' | 'cases';

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
      {meta.label}
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

function AttemptVisualStory({
  items,
}: {
  items: readonly RunnerVisualStoryItem[];
}): JSX.Element {
  if (!items.length) {
    return (
      <div className="runner-no-visual">
        <PictureOutlined />
        <span>No executed steps for this attempt</span>
      </div>
    );
  }

  return (
    <div className="runner-attempt-story-grid" aria-label="Visual step story">
      {items.map((item, index) => (
        <article className={item.frame ? '' : 'has-no-visual'} key={item.key}>
          <div className="runner-attempt-story-label">
            <span>{index + 1}</span>
            <Tooltip
              title={item.label}
              mouseEnterDelay={0.25}
              overlayStyle={{ maxWidth: 480 }}
            >
              <strong>{item.label}</strong>
            </Tooltip>
          </div>
          <div className="runner-attempt-story-media">
            {item.frame ? (
              <img
                alt={`${item.label} · ${item.frame.label}`}
                loading="lazy"
                src={item.frame.screenshot.base64}
              />
            ) : (
              <div>
                <PictureOutlined />
                <span>No visual captured</span>
              </div>
            )}
          </div>
          <footer>
            <span>{item.frame?.label ?? item.step.node}</span>
            {item.frame?.capturedAt !== undefined ? (
              <time>
                {formatTimestamp(new Date(item.frame.capturedAt).toISOString())}
              </time>
            ) : null}
          </footer>
        </article>
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

function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}): JSX.Element {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const index = text.toLocaleLowerCase().indexOf(normalizedQuery);
  if (!normalizedQuery || index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + normalizedQuery.length)}</mark>
      {text.slice(index + normalizedQuery.length)}
    </>
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
  density = 'default',
  searchMatch,
  query = '',
  onOpen,
}: {
  item: RunnerCaseView;
  visualIndex: RunnerVisualIndex;
  frames?: RunnerVisualFrame[];
  density?: 'default' | 'overview';
  searchMatch?: ReturnType<typeof getCaseSearchMatch>;
  query?: string;
  onOpen(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const story = getCaseStory(item.testCase);
  const frames =
    providedFrames ?? getAllAttemptVisualFrames(item.finalAttempt, visualIndex);
  const failure = getCaseFailure(item.testCase);
  return (
    <article
      className={`runner-case-row${
        density === 'overview' ? ' is-overview' : ''
      }`}
      data-case-key={item.key}
    >
      <div className="runner-case-main">
        <div className="runner-case-title-row">
          <CaseStatus status={item.status} />
          <button
            type="button"
            className="runner-case-title-button"
            aria-label={`Open ${item.testCase.name} in project ${
              item.project.name
            }${density === 'overview' && failure ? ' at the failed Step' : ''}`}
            onClick={() =>
              onOpen(item, density === 'overview' ? failure?.id : undefined)
            }
          >
            <h3>{item.testCase.name}</h3>
          </button>
        </div>
        <div className="runner-case-meta">
          <span>{item.project.name}</span>
          {density === 'default' ? <span>{item.project.platform}</span> : null}
          {density === 'default' ? (
            <span>{item.document.sourcePath}</span>
          ) : null}
          <span>{formatDuration(item.durationMs)}</span>
          {density === 'default' ? (
            <span>
              {item.testCase.attempts.length}{' '}
              {item.testCase.attempts.length === 1 ? 'attempt' : 'attempts'}
            </span>
          ) : null}
        </div>
        {searchMatch ? (
          <div className="runner-case-search-match">
            <SearchOutlined />
            <span>{searchMatch.label}:</span>
            <strong>
              <HighlightedText text={searchMatch.snippet} query={query} />
            </strong>
          </div>
        ) : null}
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
        {density === 'default' ? <StorySteps steps={story} /> : null}
      </div>
      <VisualTimeline
        frames={frames}
        durationMs={item.finalAttempt?.durationMs ?? item.durationMs}
      />
      <button
        type="button"
        className="runner-case-open-button"
        onClick={() =>
          onOpen(item, density === 'overview' ? failure?.id : undefined)
        }
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
  onOpen,
}: {
  item: RunnerCaseView;
  onOpen(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const failure = getCaseFailure(item.testCase);
  return (
    <li className="runner-project-tree-case-item">
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
          <div className="runner-project-tree-case-heading">
            <CaseStatus status={item.status} />
            <Tooltip title={item.testCase.name} mouseEnterDelay={0.25}>
              <h3>{item.testCase.name}</h3>
            </Tooltip>
          </div>
          <div className="runner-project-tree-case-meta">
            <span>{item.document.sourcePath}</span>
            <span>{formatDuration(item.durationMs)}</span>
            <span>
              {item.testCase.attempts.length}{' '}
              {item.testCase.attempts.length === 1 ? 'attempt' : 'attempts'}
            </span>
          </div>
          {failure ? (
            <div className="runner-project-tree-case-failure">
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
            </div>
          ) : null}
        </div>
        <RightOutlined className="runner-project-tree-case-chevron" />
      </button>
    </li>
  );
}

function ProjectBreakdownNode({
  item,
  expanded,
  onToggle,
  onOpenProject,
  onOpenCase,
}: {
  item: RunnerProjectView;
  expanded: boolean;
  onToggle(): void;
  onOpenProject(item: RunnerProjectView): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const childGroupId = useId();
  const cases = useMemo(
    () =>
      [...item.cases].sort(
        (a, b) =>
          statusSortWeight[a.status] - statusSortWeight[b.status] ||
          b.durationMs - a.durationMs,
      ),
    [item.cases],
  );

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
              {item.project.platform} · {item.project.documents.length}{' '}
              {item.project.documents.length === 1 ? 'document' : 'documents'}
            </span>
          </span>
        </button>
        <div
          className="runner-project-tree-stats"
          aria-label={`${item.project.name} overview`}
        >
          <span>
            <strong>{formatPercent(item.health.finalPassRate)}</strong>
            <small>final pass</small>
          </span>
          <span>
            <strong>
              {item.passedCount}/{item.cases.length}
            </strong>
            <small>passed</small>
          </span>
          <span>
            <strong>{item.retryPassedCount}</strong>
            <small>retried</small>
          </span>
          <span>
            <strong>{formatDuration(item.durationMs)}</strong>
            <small>duration</small>
          </span>
        </div>
        <button
          type="button"
          className="runner-project-tree-overview"
          onClick={() => onOpenProject(item)}
          aria-label={`Open project overview ${item.project.name}`}
        >
          Project overview
          <RightOutlined />
        </button>
      </div>
      {expanded ? (
        <ul className="runner-project-tree-children" id={childGroupId}>
          {cases.length ? (
            cases.map((caseItem) => (
              <ProjectBreakdownCase
                item={caseItem}
                key={caseItem.key}
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
  onOpenProject,
  onOpenCase,
}: {
  projects: RunnerProjectView[];
  onOpenProject(item: RunnerProjectView): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const [expandedProjectKeys, setExpandedProjectKeys] = useState<Set<string>>(
    () => {
      const firstProjectWithCases = projects.find((item) => item.cases.length);
      return new Set(
        firstProjectWithCases
          ? [firstProjectWithCases.key]
          : projects[0]
            ? [projects[0].key]
            : [],
      );
    },
  );
  const toggleProject = (key: string) => {
    setExpandedProjectKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!projects.length) {
    return (
      <div className="runner-empty-results">
        <Empty description="No projects were collected for this run" />
      </div>
    );
  }

  return (
    <ul className="runner-project-tree" aria-label="Project and case breakdown">
      {projects.map((item) => (
        <ProjectBreakdownNode
          item={item}
          key={item.key}
          expanded={expandedProjectKeys.has(item.key)}
          onToggle={() => toggleProject(item.key)}
          onOpenProject={onOpenProject}
          onOpenCase={onOpenCase}
        />
      ))}
    </ul>
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
  onViewCases,
  onOpenCase,
  onOpenProject,
}: {
  dump: TestRunReportDump;
  cases: RunnerCaseView[];
  health: RunnerHealthStats;
  projects: RunnerProjectView[];
  visualIndex: RunnerVisualIndex;
  onViewCases(): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
  onOpenProject(item: RunnerProjectView): void;
}): JSX.Element {
  const attentionCases = useMemo(
    () =>
      cases
        .filter((item) => item.status !== 'passed')
        .sort((a, b) => statusSortWeight[a.status] - statusSortWeight[b.status])
        .slice(0, 3),
    [cases],
  );
  const visualProbeCases = useMemo(
    () => (attentionCases.length ? attentionCases : cases.slice(0, 1)),
    [attentionCases, cases],
  );
  const attentionFrames = useMemo(
    () =>
      new Map(
        visualProbeCases.map((item) => [
          item.key,
          getAllAttemptVisualFrames(item.finalAttempt, visualIndex),
        ]),
      ),
    [visualIndex, visualProbeCases],
  );
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
            <h2>Projects</h2>
            <p className="runner-section-description">
              Expand a project to inspect its cases, or open its full overview.
            </p>
          </div>
        </div>
        <ProjectBreakdownTree
          projects={projects}
          onOpenProject={onOpenProject}
          onOpenCase={onOpenCase}
        />
      </section>

      <section className="runner-panel runner-attention-panel">
        <div className="runner-section-heading">
          <div>
            <div className="runner-eyebrow">Prioritized</div>
            <h2>
              {attentionCases.length ? 'Needs attention' : 'Case results'}
            </h2>
          </div>
          <Button onClick={onViewCases}>View all {cases.length} cases</Button>
        </div>
        {attentionCases.length ? (
          <div className="runner-case-list">
            {attentionCases.map((item) => (
              <CasePreview
                key={item.key}
                item={item}
                visualIndex={visualIndex}
                frames={attentionFrames.get(item.key)}
                density="overview"
                onOpen={onOpenCase}
              />
            ))}
          </div>
        ) : (
          <div className="runner-all-clear">
            <CheckCircleFilled />
            <div>
              <strong>Every executed case passed on the first attempt</strong>
              <span>Open the case list to review visual evidence.</span>
            </div>
          </div>
        )}
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

function CasesView({
  cases,
  visualIndex,
  filters,
  onFiltersChange,
  onOpenCase,
}: {
  cases: RunnerCaseView[];
  visualIndex: RunnerVisualIndex;
  filters: RunnerCaseFilters;
  onFiltersChange(filters: RunnerCaseFilters): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const [visibleLimit, setVisibleLimit] = useState(25);
  const { projectId, query, sort, status } = filters;
  const updateFilters = (next: Partial<RunnerCaseFilters>) =>
    onFiltersChange({ ...filters, ...next });
  const resetFilters = () => onFiltersChange(defaultRunnerCaseFilters);
  const statusCounts = useMemo(
    () => ({
      all: cases.length,
      failed: cases.filter((item) => item.status === 'failed').length,
      'retry-passed': cases.filter((item) => item.status === 'retry-passed')
        .length,
      passed: cases.filter((item) => item.status === 'passed').length,
      'not-run': cases.filter((item) => item.status === 'not-run').length,
    }),
    [cases],
  );
  const projectOptions = useMemo(
    () => [
      { label: `All projects (${cases.length})`, value: 'all' },
      ...Array.from(
        new Map(
          cases.map((item) => [
            item.project.projectId,
            {
              label: `${item.project.name} (${
                cases.filter(
                  (candidate) =>
                    candidate.project.projectId === item.project.projectId,
                ).length
              })`,
              value: item.project.projectId,
            },
          ]),
        ).values(),
      ),
    ],
    [cases],
  );
  const filteredCases = useMemo(() => {
    return cases
      .filter((item) => status === 'all' || item.status === status)
      .filter(
        (item) => projectId === 'all' || item.project.projectId === projectId,
      )
      .map((item) => ({
        item,
        match: query.trim() ? getCaseSearchMatch(item, query) : undefined,
      }))
      .filter(({ match }) => !query.trim() || Boolean(match))
      .sort((a, b) => {
        if (sort === 'duration') return b.item.durationMs - a.item.durationMs;
        if (sort === 'retries') {
          return (
            b.item.retryCount - a.item.retryCount ||
            statusSortWeight[a.item.status] - statusSortWeight[b.item.status]
          );
        }
        if (sort === 'name') {
          return a.item.testCase.name.localeCompare(b.item.testCase.name);
        }
        return (
          statusSortWeight[a.item.status] - statusSortWeight[b.item.status] ||
          b.item.durationMs - a.item.durationMs
        );
      });
  }, [cases, projectId, query, sort, status]);

  useEffect(() => setVisibleLimit(25), [projectId, query, sort, status]);

  const visibleCases = filteredCases.slice(0, visibleLimit);
  const hasActiveFilters =
    query.trim() ||
    status !== 'all' ||
    projectId !== 'all' ||
    sort !== 'attention';

  return (
    <div className="runner-page runner-cases-page">
      <div className="runner-page-heading">
        <div>
          <div className="runner-eyebrow">All cases</div>
          <h1>What happened in this run</h1>
          <p>Failures and retry-passed cases are shown first.</p>
        </div>
        <span className="runner-result-count">
          {filteredCases.length} of {cases.length}
        </span>
      </div>
      <div className="runner-case-toolbar">
        <Input
          prefix={<SearchOutlined />}
          suffix={
            <button
              type="button"
              className={`runner-search-clear${query ? '' : ' is-hidden'}`}
              aria-label="Clear case search"
              aria-hidden={!query}
              disabled={!query}
              onClick={() => updateFilters({ query: '' })}
            >
              <CloseCircleFilled />
            </button>
          }
          placeholder="Search cases, errors, IDs, inputs, or steps"
          value={query}
          onChange={(event) => updateFilters({ query: event.target.value })}
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(value) => updateFilters({ status: value })}
          options={[
            { label: `All statuses (${statusCounts.all})`, value: 'all' },
            { label: `Failed (${statusCounts.failed})`, value: 'failed' },
            {
              label: `Passed after retry (${statusCounts['retry-passed']})`,
              value: 'retry-passed',
            },
            { label: `Passed (${statusCounts.passed})`, value: 'passed' },
            {
              label: `Not run (${statusCounts['not-run']})`,
              value: 'not-run',
            },
          ]}
        />
        <Select
          aria-label="Filter by project"
          value={projectId}
          onChange={(value) => updateFilters({ projectId: value })}
          options={projectOptions}
        />
        <Select
          aria-label="Sort cases"
          value={sort}
          onChange={(value: RunnerCaseSort) => updateFilters({ sort: value })}
          options={[
            { label: 'Attention first', value: 'attention' },
            { label: 'Longest duration', value: 'duration' },
            { label: 'Most retries', value: 'retries' },
            { label: 'Case name', value: 'name' },
          ]}
        />
        <div className="runner-filter-shortcuts">
          <span>Quick filters</span>
          <button
            type="button"
            className={status === 'failed' ? 'is-selected' : ''}
            onClick={() => updateFilters({ status: 'failed' })}
          >
            Failed {statusCounts.failed}
          </button>
          <button
            type="button"
            className={status === 'retry-passed' ? 'is-selected' : ''}
            onClick={() => updateFilters({ status: 'retry-passed' })}
          >
            Retried {statusCounts['retry-passed']}
          </button>
          <button
            type="button"
            disabled={!hasActiveFilters}
            onClick={resetFilters}
          >
            Reset all
          </button>
          <small>
            Search covers every attempt, error code/message, input/output, and
            trace ID.
          </small>
        </div>
      </div>
      {filteredCases.length ? (
        <div className="runner-case-list runner-all-cases-list">
          {visibleCases.map(({ item, match }) => (
            <CasePreview
              key={item.key}
              item={item}
              visualIndex={visualIndex}
              searchMatch={match}
              query={query}
              onOpen={onOpenCase}
            />
          ))}
          {visibleLimit < filteredCases.length ? (
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
          <Empty
            description={
              <div className="runner-empty-search-copy">
                <span>No cases match these filters</span>
                <Button onClick={resetFilters}>Reset all filters</Button>
              </div>
            }
          />
        </div>
      )}
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

function DebugStepGroup({
  label,
  steps,
  selectedStepId,
  onSelect,
}: {
  label: string;
  steps: TestRunReportStep[];
  selectedStepId?: string;
  onSelect(step: TestRunReportStep): void;
}): JSX.Element | null {
  if (!steps.length) return null;
  return (
    <section className="runner-debug-step-group">
      <h3>{label}</h3>
      <div>
        {steps.map((step) => (
          <button
            type="button"
            className={selectedStepId === step.id ? 'is-selected' : ''}
            key={step.id}
            onClick={() => onSelect(step)}
          >
            <StepStatus status={step.status} />
            <span>
              <strong>{step.node}</strong>
              <small>{getStepDisplayName(step)}</small>
            </span>
            <time>{formatDuration(step.durationMs)}</time>
          </button>
        ))}
      </div>
    </section>
  );
}

function StepInspector({
  step,
  reports,
  renderAgentReport,
}: {
  step: TestRunReportStep;
  reports: PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
}): JSX.Element {
  const [showTrace, setShowTrace] = useState(false);
  const agentReports = useMemo(
    () => buildAgentReports(step, reports),
    [reports, step],
  );
  const hasAgentDetails = Boolean(step.agentDetails?.length);

  useEffect(() => setShowTrace(false), [step.id]);

  return (
    <section
      id="runner-step-inspector"
      className="runner-step-inspector"
      tabIndex={-1}
    >
      <div className="runner-section-heading">
        <div>
          <div className="runner-eyebrow">
            {step.phase} · Step {step.stepIndex + 1}
          </div>
          <h2>{step.node}</h2>
          {step.title ? <p>{step.title}</p> : null}
        </div>
        <Tag color={step.status === 'success' ? 'success' : 'error'}>
          {step.status}
        </Tag>
      </div>
      <div className="runner-step-facts">
        <span>Duration {formatDuration(step.durationMs)}</span>
        <span>
          Continue on error: {step.continuedAfterError ? 'yes' : 'no'}
        </span>
      </div>
      {step.agentDetailDiagnostic ? (
        <Alert type="warning" showIcon message={step.agentDetailDiagnostic} />
      ) : null}
      {step.error ? (
        <Alert
          type="error"
          showIcon
          message={step.error.message}
          description={step.error.code}
        />
      ) : null}
      {step.output?.summary ? (
        <div className="runner-summary-text">{step.output.summary}</div>
      ) : null}
      <div className="runner-step-data-grid">
        <section>
          <h3>Input</h3>
          {reportValue(step.input) ?? (
            <span className="runner-muted">None</span>
          )}
        </section>
        <section>
          <h3>Output data</h3>
          {reportValue(step.output?.data) ?? (
            <span className="runner-muted">None</span>
          )}
        </section>
      </div>
      {hasAgentDetails ? (
        <details
          className="runner-trace-details"
          open={showTrace}
          onToggle={(event) => setShowTrace(event.currentTarget.open)}
        >
          <summary>
            <span>
              <BugOutlined />
              Full AI trace
            </span>
            <small>
              Planning, locate, actions, screenshots, model calls, and tokens
            </small>
          </summary>
          {showTrace ? (
            <div className="runner-trace-content">
              {agentReports.length ? (
                <div className="runner-agent-detail">
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
          ) : null}
        </details>
      ) : null}
    </section>
  );
}

function CaseWorkspace({
  item,
  visualIndex,
  reports,
  initialStepId,
  renderAgentReport,
  onBack,
  backLabel,
}: {
  item: RunnerCaseView;
  visualIndex: RunnerVisualIndex;
  reports: PlaywrightTasks[];
  initialStepId?: string;
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
  onBack(): void;
  backLabel: string;
}): JSX.Element {
  const initialAttempt =
    item.testCase.attempts.find((attempt) =>
      flattenAttemptSteps(attempt).some((step) => step.id === initialStepId),
    ) ?? item.finalAttempt;
  const [selectedAttemptId, setSelectedAttemptId] = useState(
    initialAttempt?.attemptId,
  );
  const [selectedStepId, setSelectedStepId] = useState(initialStepId);
  const [debugOpen, setDebugOpen] = useState(Boolean(initialStepId));

  useEffect(() => {
    const nextAttempt =
      item.testCase.attempts.find((attempt) =>
        flattenAttemptSteps(attempt).some((step) => step.id === initialStepId),
      ) ?? item.finalAttempt;
    setSelectedAttemptId(nextAttempt?.attemptId);
    setSelectedStepId(initialStepId);
    setDebugOpen(Boolean(initialStepId));
  }, [initialStepId, item.finalAttempt, item.key, item.testCase.attempts]);

  useEffect(() => {
    if (!selectedStepId) return;
    const animationFrame = window.requestAnimationFrame(() => {
      const inspector = document.getElementById('runner-step-inspector');
      inspector?.scrollIntoView({ block: 'start' });
      inspector?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedStepId]);

  const selectedAttempt =
    item.testCase.attempts.find(
      (attempt) => attempt.attemptId === selectedAttemptId,
    ) ?? item.finalAttempt;
  const attemptSteps = selectedAttempt
    ? flattenAttemptSteps(selectedAttempt)
    : [];
  const selectedStep = attemptSteps.find((step) => step.id === selectedStepId);
  const visualStory = getAttemptVisualStory(selectedAttempt, visualIndex, 5);
  const failedStep = selectedAttempt
    ? attemptSteps.find((step) => step.status === 'failed')
    : undefined;

  const selectAttempt = (attempt: TestRunReportAttempt) => {
    setSelectedAttemptId(attempt.attemptId);
    setSelectedStepId(undefined);
    clearRunnerStepHash();
  };
  const selectStep = (step: TestRunReportStep) => {
    setSelectedStepId(step.id);
    setDebugOpen(true);
    updateRunnerStepHash(step.id);
  };

  return (
    <div className="runner-page runner-case-workspace">
      <button type="button" className="runner-back-button" onClick={onBack}>
        <ArrowLeftOutlined />
        {backLabel}
      </button>
      <div className="runner-case-workspace-heading">
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
      </div>

      <section className="runner-attempt-switcher" aria-label="Attempts">
        {item.testCase.attempts.map((attempt) => (
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
          </button>
        ))}
        {!item.testCase.attempts.length ? (
          <div className="runner-not-run-message">
            <ClockCircleOutlined />
            {item.testCase.notRunReason || 'This case was not executed.'}
          </div>
        ) : null}
      </section>

      {selectedAttempt ? (
        <>
          {failedStep ? (
            <Alert
              className="runner-failure-alert"
              type="error"
              showIcon
              message={`${failedStep.node} failed`}
              description={failedStep.error?.message || 'The Step failed.'}
              action={
                <Button size="small" onClick={() => selectStep(failedStep)}>
                  Inspect Step
                </Button>
              }
            />
          ) : null}

          <section className="runner-panel runner-visual-story">
            <div className="runner-section-heading">
              <div>
                <div className="runner-eyebrow">Visual story</div>
                <h2>What this attempt did</h2>
              </div>
              <Tag>
                Attempt {selectedAttempt.attemptIndex + 1} ·{' '}
                {selectedAttempt.status}
              </Tag>
            </div>
            <AttemptVisualStory items={visualStory} />
            {!visualStory.some((item) => item.frame) ? (
              <div className="runner-visual-gap-explanation">
                The attempt duration is still included in Total runner time.
                Visual evidence starts only when an Agent Step captures the
                device or page.
              </div>
            ) : null}
          </section>

          <details
            className="runner-debug-details"
            open={debugOpen}
            onToggle={(event) => setDebugOpen(event.currentTarget.open)}
          >
            <summary>
              <span>
                <BugOutlined />
                Debug details
              </span>
              <small>Hooks, custom Nodes, and AI Steps</small>
            </summary>
            {debugOpen ? (
              <div className="runner-debug-drawer-content">
                <div className="runner-debug-layout">
                  <DebugStepGroup
                    label="Document setup"
                    steps={item.document.beforeAll}
                    selectedStepId={selectedStepId}
                    onSelect={selectStep}
                  />
                  <DebugStepGroup
                    label="Before each"
                    steps={selectedAttempt.beforeEach}
                    selectedStepId={selectedStepId}
                    onSelect={selectStep}
                  />
                  <DebugStepGroup
                    label="Case steps"
                    steps={selectedAttempt.steps}
                    selectedStepId={selectedStepId}
                    onSelect={selectStep}
                  />
                  <DebugStepGroup
                    label="After each"
                    steps={selectedAttempt.afterEach}
                    selectedStepId={selectedStepId}
                    onSelect={selectStep}
                  />
                  <DebugStepGroup
                    label="Document teardown"
                    steps={item.document.afterAll}
                    selectedStepId={selectedStepId}
                    onSelect={selectStep}
                  />
                </div>
                {selectedStep ? (
                  <StepInspector
                    key={selectedStep.id}
                    step={selectedStep}
                    reports={reports}
                    renderAgentReport={renderAgentReport}
                  />
                ) : (
                  <div className="runner-select-step-hint">
                    <BugOutlined />
                    Select a Step to inspect its input, output, error, or full
                    AI trace.
                  </div>
                )}
              </div>
            ) : null}
          </details>
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
      item.testCase.attempts.some((attempt) =>
        flattenAttemptSteps(attempt).some((step) => step.id === stepId),
      ),
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

  if (route.page === 'cases') {
    return { page: 'cases', caseParent: 'cases' };
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
        caseParent: 'project',
        deepLinkedStepId: stepId,
      };
    }
  }

  return { page: 'overview', caseParent: 'project' };
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
  const [navigation, setNavigation] = useState<RunnerNavigationState>(() =>
    resolveRunnerNavigation(window.location.hash, cases, projects),
  );
  const [caseFilters, setCaseFilters] = useState<RunnerCaseFilters>(() =>
    runnerCaseFiltersFromHash(window.location.hash),
  );
  const mainRef = useRef<HTMLElement>(null);
  const casesReturnStateRef = useRef<{
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
      setCaseFilters(runnerCaseFiltersFromHash(window.location.hash));
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
          '.runner-case-title-button',
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
  const selectPage = (nextPage: 'overview' | 'cases') => {
    navigate({ page: nextPage });
  };
  const openProject = (item: RunnerProjectView) => {
    navigate({ page: 'project', projectId: item.project.projectId });
  };
  const openCase = (
    item: RunnerCaseView,
    parent: RunnerCaseParent = 'project',
    stepId?: string,
  ) => {
    if (parent === 'cases') {
      casesReturnStateRef.current = {
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
    if (caseParent === 'cases') {
      navigate(
        { page: 'cases' },
        {
          scrollTop: casesReturnStateRef.current.scrollTop,
          focusCaseKey: casesReturnStateRef.current.caseKey,
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
  const updateCaseFilters = (filters: RunnerCaseFilters) => {
    const nextHash = runnerHashForCaseFilters(filters, window.location.hash);
    window.history.replaceState({ midsceneRunnerFilters: true }, '', nextHash);
    setCaseFilters(filters);
    if (mainRef.current) mainRef.current.scrollTop = 0;
  };

  const overviewSectionSelected =
    page === 'overview' ||
    page === 'project' ||
    (page === 'case' && caseParent === 'project');
  const casesSectionSelected =
    page === 'cases' || (page === 'case' && caseParent === 'cases');

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
            <nav aria-label="Report sections">
              <button
                type="button"
                className={overviewSectionSelected ? 'is-selected' : ''}
                onClick={() => selectPage('overview')}
              >
                <DashboardOutlined />
                Overview
              </button>
              <button
                type="button"
                className={casesSectionSelected ? 'is-selected' : ''}
                onClick={() => selectPage('cases')}
              >
                <BarsOutlined />
                Cases
                <span>{cases.length}</span>
              </button>
            </nav>
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
                onViewCases={() => selectPage('cases')}
                onOpenCase={(item, stepId) => openCase(item, 'project', stepId)}
                onOpenProject={openProject}
              />
            ) : page === 'project' && selectedProject ? (
              <ProjectWorkspace
                key={selectedProject.key}
                item={selectedProject}
                visualIndex={visualIndex}
                onBack={() => selectPage('overview')}
                onOpenCase={(item, stepId) => openCase(item, 'project', stepId)}
              />
            ) : page === 'cases' ? (
              <CasesView
                cases={cases}
                visualIndex={visualIndex}
                filters={caseFilters}
                onFiltersChange={updateCaseFilters}
                onOpenCase={(item, stepId) => openCase(item, 'cases', stepId)}
              />
            ) : page === 'case' && selectedCase ? (
              <CaseWorkspace
                key={selectedCase.key}
                backLabel={
                  caseParent === 'cases'
                    ? 'All cases'
                    : selectedProject?.project.name || 'Project'
                }
                item={selectedCase}
                visualIndex={visualIndex}
                reports={reports}
                initialStepId={deepLinkedStepId}
                renderAgentReport={renderAgentReport}
                onBack={backFromCase}
              />
            ) : (
              <RunOverview
                dump={dump}
                cases={cases}
                health={health}
                projects={projects}
                visualIndex={visualIndex}
                onViewCases={() => selectPage('cases')}
                onOpenCase={(item, stepId) => openCase(item, 'project', stepId)}
                onOpenProject={openProject}
              />
            )}
          </main>
        </div>
      </AntdApp>
    </ConfigProvider>
  );
}
