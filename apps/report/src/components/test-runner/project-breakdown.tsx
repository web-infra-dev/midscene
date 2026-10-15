import {
  CaretDownFilled,
  CaretUpFilled,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { RunnerAttemptTimeline } from './attempt-timeline';
import { ErrorCards } from './error-card';
import {
  type RunnerCaseView,
  type RunnerVisualIndex,
  getAllAttemptVisualFrames,
  getCaseFailure,
  getCaseSearchMatch,
  positionAttemptVisualFrames,
} from './model';
import { OverviewEmptyState } from './overview-empty-state';
import {
  type FileBreakdown,
  type OverviewSort,
  type OverviewSorting,
  type ProjectBreakdown,
  fileAttention,
  fileDisplayName,
  getOverviewCaseSummary,
  getOverviewProjectSort,
  getOverviewProjectStatus,
  projectDisplayName,
} from './overview-model';
import {
  CaseStatus,
  type RunnerCaseDisplayMode,
  caseStatusLabel,
  formatDuration,
} from './view-primitives';

function SortHeading({
  label,
  value,
  sort,
  direction,
  onChange,
}: {
  label: string;
  value: OverviewSort;
  sort: OverviewSort;
  direction: OverviewSorting['direction'];
  onChange(value: OverviewSort): void;
}) {
  const active = sort === value;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        className={`runner-file-sort${active ? ' is-active' : ''}`}
        aria-label={`Sort by ${label}${active ? `, currently ${direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
        title={
          value === 'file'
            ? 'Sort files by report order. Cases retain their definition order.'
            : value === 'passed-rate'
              ? 'Passed Cases / total Cases. Unknown values stay last.'
              : undefined
        }
        onClick={() => onChange(value)}
      >
        {label}
        <span className="runner-file-sort-icon" aria-hidden="true">
          <CaretUpFilled
            className={active && direction === 'asc' ? 'is-active' : ''}
          />
          <CaretDownFilled
            className={active && direction === 'desc' ? 'is-active' : ''}
          />
        </span>
      </button>
    </th>
  );
}

function CaseRows({
  item,
  visualIndex,
  displayMode,
  query,
  onOpen,
}: {
  item: RunnerCaseView;
  visualIndex: RunnerVisualIndex;
  displayMode: RunnerCaseDisplayMode;
  query: string;
  onOpen(item: RunnerCaseView, stepId?: string): void;
}) {
  const [previewFrameKey, setPreviewFrameKey] = useState<string>();
  const failure = getCaseFailure(item.testCase);
  const summary = getOverviewCaseSummary(item);
  const frames = useMemo(
    () =>
      item.finalAttempt
        ? positionAttemptVisualFrames(
            item.finalAttempt,
            getAllAttemptVisualFrames(item.finalAttempt, visualIndex),
          )
        : [],
    [item.finalAttempt, visualIndex],
  );
  const searchMatch = query.trim()
    ? getCaseSearchMatch(item, query)
    : undefined;
  const failedAttemptCount = item.testCase.attempts.filter(
    (attempt) => attempt.status === 'failed',
  ).length;
  const attention =
    item.status === 'not-run'
      ? item.testCase.notRunReason || 'Not run'
      : item.status === 'retry-passed'
        ? `${failedAttemptCount} retried`
        : '-';
  return (
    <>
      <tr
        className={`runner-file-case-row${displayMode === 'detailed' ? ' is-detailed' : ''}`}
        data-case-key={item.key}
      >
        <th scope="row" colSpan={2}>
          <button
            type="button"
            className="runner-case-open"
            onClick={() => onOpen(item, failure?.id)}
            aria-label={`Open ${item.testCase.name} in project ${item.project.name}${failure ? ' at the failed Step' : ''} · ${caseStatusLabel(item.status)}`}
          >
            <CaseStatus status={item.status} quiet />
            <span className="runner-case-name" title={item.testCase.name}>
              {item.testCase.name}
            </span>
            {item.testCase.attempts.length > 1 ? (
              <small>{item.testCase.attempts.length} attempts</small>
            ) : null}
          </button>
          {searchMatch &&
          searchMatch.label !== 'Case name' &&
          searchMatch.label !== 'Project' ? (
            <span
              className="runner-case-search-match"
              title={searchMatch.snippet}
            >
              {searchMatch.label}: {searchMatch.snippet}
            </span>
          ) : null}
        </th>
        <td>
          <span className="runner-file-attention" title={attention}>
            {attention}
          </span>
        </td>
        <td className="runner-file-duration">
          <time>
            {item.testCase.attempts.length
              ? formatDuration(item.durationMs)
              : '—'}
          </time>
        </td>
      </tr>
      {displayMode === 'detailed' ? (
        <tr className="runner-case-evidence-row">
          <td colSpan={4}>
            {summary ? (
              <button
                type="button"
                className={`runner-case-issue-summary is-${summary.tone}`}
                onClick={() => onOpen(item, summary.stepId)}
              >
                <ExclamationCircleOutlined aria-hidden="true" />
                <span>
                  <strong>{summary.label}</strong>
                  <span title={summary.message}>{summary.message}</span>
                </span>
              </button>
            ) : null}
            <div className="runner-case-evidence-preview">
              <RunnerAttemptTimeline
                attempt={item.finalAttempt}
                frames={frames}
                variant="overview"
                previewFrameKey={previewFrameKey}
                onPreview={setPreviewFrameKey}
                onSelectFrame={(frame) => onOpen(item, frame.stepId)}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function FileRows({
  view,
  expanded,
  onToggle,
  displayMode,
  visualIndex,
  query,
  filtered,
  onOpen,
}: {
  view: FileBreakdown;
  expanded: boolean;
  onToggle(): void;
  displayMode: RunnerCaseDisplayMode;
  visualIndex: RunnerVisualIndex;
  query: string;
  filtered: boolean;
  onOpen(item: RunnerCaseView, stepId?: string): void;
}) {
  const { item, cases } = view;
  const id = useId();
  const name = fileDisplayName(item);
  const attention = fileAttention(item);
  return (
    <tbody
      className={`runner-file-group${expanded ? ' is-expanded' : ''}`}
      data-file-key={item.key}
    >
      <tr className="runner-file-row">
        <th scope="row">
          <button
            type="button"
            className="runner-file-toggle"
            aria-expanded={expanded}
            aria-controls={expanded ? id : undefined}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.sourceKind === 'agent' ? 'source report' : 'file'} ${name}`}
            onClick={onToggle}
          >
            <span
              className={`runner-file-chevron${expanded ? ' is-expanded' : ''}`}
              aria-hidden="true"
            />
            <CaseStatus status={item.status} quiet />
            <span className="runner-file-identity">
              <span className="runner-file-path" title={item.sourcePath}>
                {name}
              </span>
              {item.sourceKind === 'agent' ? (
                <small>Source report · Agent report</small>
              ) : item.totalCaseCount === undefined ? (
                <small>Case count unknown · Collection failed</small>
              ) : !item.cases.length ? (
                <small>No cases collected</small>
              ) : null}
            </span>
          </button>
        </th>
        <td className="runner-file-pass-rate">
          {item.totalCaseCount ? (
            <>
              <span>{item.passedCount}</span>
              <span className="runner-file-case-total">
                {' / '}
                {item.totalCaseCount}
              </span>
            </>
          ) : (
            '—'
          )}
        </td>
        <td>
          {item.hasScopeError ? (
            <button
              type="button"
              className="runner-file-error-toggle"
              onClick={onToggle}
              title={attention}
              aria-label={`${expanded ? 'Hide' : 'Show'} file errors for ${name}`}
              aria-expanded={expanded}
            >
              {attention}
            </button>
          ) : (
            <span className="runner-file-attention" title={attention}>
              {attention}
            </span>
          )}
        </td>
        <td className="runner-file-duration">
          {formatDuration(item.durationMs)}
        </td>
      </tr>
      {expanded ? (
        <>
          <tr className="runner-file-content-anchor" id={id}>
            <td colSpan={4}>
              {item.issues.length ? (
                <ErrorCards
                  issues={item.issues}
                  label={`File ${name} issues`}
                />
              ) : null}
              {!cases.length ? (
                <p className="runner-file-empty">
                  {filtered && item.cases.length
                    ? `No cases match these filters.${item.hasScopeError ? ' File errors are shown above.' : ''}`
                    : item.totalCaseCount === undefined
                      ? 'Cases could not be collected. File errors are shown above.'
                      : 'No cases were collected for this file.'}
                </p>
              ) : null}
            </td>
          </tr>
          {cases.map((testCase) => (
            <CaseRows
              key={testCase.key}
              item={testCase}
              visualIndex={visualIndex}
              displayMode={displayMode}
              query={query}
              onOpen={onOpen}
            />
          ))}
        </>
      ) : null}
    </tbody>
  );
}

export function ProjectBreakdownTree({
  projects,
  visualIndex,
  caseDisplayMode,
  expandedFileKeys,
  projectSorts,
  query,
  headerControls,
  onSortChange,
  onToggleFile,
  hasActiveFilters,
  onResetFilters,
  onOpenCase,
}: {
  projects: ProjectBreakdown[];
  visualIndex: RunnerVisualIndex;
  caseDisplayMode: RunnerCaseDisplayMode;
  expandedFileKeys: ReadonlySet<string>;
  projectSorts: ReadonlyMap<string, OverviewSorting>;
  query: string;
  headerControls?: ReactNode;
  onSortChange(projectKey: string, value: OverviewSort): void;
  onToggleFile(key: string): void;
  hasActiveFilters: boolean;
  onResetFilters(): void;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  if (!projects.length)
    return (
      <div className="runner-empty-results">
        <OverviewEmptyState
          title={
            hasActiveFilters
              ? 'No matching projects'
              : 'No projects in this report'
          }
          description={
            hasActiveFilters
              ? 'Try a different project, file or case name.'
              : 'This run did not collect any projects.'
          }
          onReset={hasActiveFilters ? onResetFilters : undefined}
        />
      </div>
    );
  return (
    <div className="runner-project-tables">
      {projects.map(({ item, files }) => {
        const sorting = getOverviewProjectSort({ projectSorts }, item.key);
        const name = projectDisplayName(item);
        const status = getOverviewProjectStatus(item);
        return (
          <section
            className="runner-project-section"
            key={item.key}
            aria-label={`Project ${name}`}
          >
            <header className="runner-project-heading">
              <div className="runner-project-title">
                <h2 title={name}>{name}</h2>
                <CaseStatus status={status} quiet />
                {item.project.projectId.endsWith('legacy-yaml') ? (
                  <small>
                    Legacy YAML
                    {item.project.platform ? ` · ${item.project.platform}` : ''}
                  </small>
                ) : null}
                {item.files.length > 0 &&
                item.files.every((file) => file.sourceKind === 'agent') ? (
                  <small>Agent report</small>
                ) : null}
              </div>
              {headerControls}
            </header>
            {item.issues.length ? (
              <ErrorCards
                issues={item.issues}
                label={`Project ${name} issues`}
              />
            ) : null}
            <section
              className="runner-file-table-scroll"
              aria-label={`Files in ${name}`}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll region must support horizontal keyboard scrolling.
              tabIndex={0}
            >
              <table
                className="runner-file-table"
                aria-label={`${name} files and cases`}
              >
                <colgroup>
                  <col className="runner-file-name-col" />
                  <col className="runner-file-rate-col" />
                  <col className="runner-file-attention-col" />
                  <col className="runner-file-time-col" />
                </colgroup>
                <thead>
                  <tr>
                    {(
                      [
                        ['Files', 'file'],
                        ['Passed / Case', 'passed-rate'],
                        ['Attention', 'result'],
                        ['Duration', 'duration'],
                      ] as const
                    ).map(([label, value]) => (
                      <SortHeading
                        key={value}
                        label={label}
                        value={value}
                        sort={sorting.sort}
                        direction={sorting.direction}
                        onChange={(value) => onSortChange(item.key, value)}
                      />
                    ))}
                  </tr>
                </thead>
                {files.map((file) => (
                  <FileRows
                    key={file.item.key}
                    view={file}
                    expanded={expandedFileKeys.has(file.item.key)}
                    onToggle={() => onToggleFile(file.item.key)}
                    displayMode={caseDisplayMode}
                    visualIndex={visualIndex}
                    query={query}
                    filtered={hasActiveFilters}
                    onOpen={onOpenCase}
                  />
                ))}
              </table>
              {!files.length ? (
                <OverviewEmptyState
                  title={
                    hasActiveFilters
                      ? 'No matching cases'
                      : 'No files in this project'
                  }
                  description={
                    hasActiveFilters
                      ? 'Try another status or search term.'
                      : 'This project did not collect any files.'
                  }
                  onReset={hasActiveFilters ? onResetFilters : undefined}
                />
              ) : null}
            </section>
          </section>
        );
      })}
    </div>
  );
}
