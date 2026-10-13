import type { TestRunReportDump } from '@midscene/core';
import { type Dispatch, type SetStateAction, useMemo, useRef } from 'react';
import { CaseDensitySwitch } from './case-density-switch';
import { CaseFilters } from './case-filters';
import { ErrorCards } from './error-card';
import { type ReportIssues, collectReportIssues, getRunIssues } from './issues';
import type {
  RunnerCaseView,
  RunnerHealthStats,
  RunnerVisualIndex,
} from './model';
import {
  type OverviewProject,
  type OverviewState,
  changeOverviewSort,
  filterOverviewProjects,
  getOverviewStatusCounts,
  toggleOverviewStatus,
} from './overview-model';
import { ProjectBreakdownTree } from './project-breakdown';
import { RunSummary } from './run-summary';
import type { RunnerCaseDisplayMode } from './view-primitives';

export function RunOverview({
  visualIndex,
  dump,
  issues,
  cases,
  health,
  projects,
  caseDisplayMode,
  onCaseDisplayModeChange,
  state,
  onStateChange,
  onOpenCase,
}: {
  visualIndex: RunnerVisualIndex;
  dump: TestRunReportDump;
  issues?: ReportIssues;
  cases: RunnerCaseView[];
  health: RunnerHealthStats;
  projects: OverviewProject[];
  caseDisplayMode: RunnerCaseDisplayMode;
  onCaseDisplayModeChange(mode: RunnerCaseDisplayMode): void;
  state: OverviewState;
  onStateChange: Dispatch<SetStateAction<OverviewState>>;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const reportIssues = issues ?? collectReportIssues(dump);
  const breakdownRef = useRef<HTMLElement>(null);
  const breakdownProjects = useMemo(
    () => filterOverviewProjects(projects, state),
    [projects, state],
  );
  const statusCounts = useMemo(
    () => getOverviewStatusCounts(projects, state.query),
    [projects, state.query],
  );
  const resetFilters = () =>
    onStateChange((current) => ({ ...current, query: '', statuses: [] }));
  const hasActiveFilters = Boolean(state.query.trim() || state.statuses.length);
  const totalCaseCount = Math.max(dump.summary.total, cases.length);
  const toggle = (
    key: string,
    field: 'expandedProjectKeys' | 'expandedFileKeys',
  ) =>
    onStateChange((current) => {
      const next = new Set(current[field]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...current, [field]: next };
    });
  const focusOutcomeCases = () => {
    const failed =
      dump.status === 'failed' ||
      projects.some(
        (project) =>
          project.hasScopeError ||
          project.files.some((file) => file.hasScopeError),
      );
    onStateChange((current) => ({
      ...current,
      query: '',
      statuses: failed
        ? ['failed']
        : health.retryPassedCount
          ? ['retry-passed']
          : [],
      expandedProjectKeys: new Set(projects.map((project) => project.key)),
      expandedFileKeys: new Set([
        ...current.expandedFileKeys,
        ...projects.flatMap((project) =>
          project.files
            .filter((file) =>
              failed
                ? file.status === 'failed' ||
                  file.hasScopeError ||
                  (project.hasScopeError && file.notRunCount > 0)
                : file.retryPassedCount > 0,
            )
            .map((file) => file.key),
        ),
      ]),
    }));
    window.requestAnimationFrame(() =>
      breakdownRef.current?.scrollIntoView({ block: 'start' }),
    );
  };
  const files = projects.flatMap((project) => project.files);
  const fileErrorCount = files.filter((file) => file.hasScopeError).length;
  const projectErrorCount = projects.filter(
    (project) => project.hasScopeError,
  ).length;
  return (
    <div className="runner-page runner-overview">
      <RunSummary
        dump={dump}
        health={health}
        totalCaseCount={totalCaseCount}
        totalFileCount={
          files.filter((file) => file.sourceKind !== 'agent').length
        }
        onReviewOutcome={focusOutcomeCases}
      />
      <ErrorCards
        issues={getRunIssues(reportIssues)}
        label="Run issues"
        navigableStepIds={new Set(reportIssues.nodes.keys())}
      />
      <section
        ref={breakdownRef}
        className="runner-panel runner-breakdown-panel"
        aria-label="Projects, files and cases"
      >
        <div className="runner-breakdown-controls">
          <CaseDensitySwitch
            value={caseDisplayMode}
            onChange={onCaseDisplayModeChange}
          />
          <CaseFilters
            query={state.query}
            statuses={state.statuses}
            counts={statusCounts}
            onQueryChange={(query) =>
              onStateChange((current) => ({ ...current, query }))
            }
            onStatusToggle={(status) =>
              onStateChange((current) => ({
                ...current,
                statuses: toggleOverviewStatus(current.statuses, status),
              }))
            }
            onClear={resetFilters}
          />
        </div>
        {fileErrorCount || projectErrorCount ? (
          <div className="runner-overview-result-count" aria-live="polite">
            {[
              fileErrorCount &&
                `${fileErrorCount} file ${fileErrorCount === 1 ? 'error' : 'errors'}`,
              projectErrorCount &&
                `${projectErrorCount} project ${projectErrorCount === 1 ? 'error' : 'errors'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        ) : null}
        <ProjectBreakdownTree
          projects={breakdownProjects}
          visualIndex={visualIndex}
          caseDisplayMode={caseDisplayMode}
          expandedProjectKeys={state.expandedProjectKeys}
          expandedFileKeys={state.expandedFileKeys}
          projectSorts={state.projectSorts}
          query={state.query}
          onSortChange={(projectKey, sort) =>
            onStateChange((current) =>
              changeOverviewSort(current, projectKey, sort),
            )
          }
          onToggleProject={(key) => toggle(key, 'expandedProjectKeys')}
          onToggleFile={(key) => toggle(key, 'expandedFileKeys')}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          onOpenCase={onOpenCase}
        />
      </section>
    </div>
  );
}
