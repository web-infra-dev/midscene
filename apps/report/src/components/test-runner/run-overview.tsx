import type { TestRunReportDump } from '@midscene/core';
import { type Dispatch, type SetStateAction, useMemo, useRef } from 'react';
import { CaseDensitySwitch } from './case-density-switch';
import { CaseSearch, CaseStatusFilters } from './case-filters';
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
  getOverviewProjectStatus,
  getOverviewStatusCounts,
  getSelectedOverviewProject,
  selectOverviewProject,
  toggleOverviewFiles,
  toggleOverviewStatus,
} from './overview-model';
import { ProjectBreakdownTree } from './project-breakdown';
import { ProjectNavigation } from './project-navigation';
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
  const reports = useMemo(
    () => [...visualIndex.reportsById.values()],
    [visualIndex],
  );
  const breakdownRef = useRef<HTMLElement>(null);
  const navigationProjects = useMemo(
    () =>
      filterOverviewProjects(projects, { ...state, statuses: [] }).map(
        (view) => view.item,
      ),
    [projects, state],
  );
  const selectedProject = getSelectedOverviewProject(
    navigationProjects,
    state.selectedProjectKey,
  );
  const breakdownProjects = useMemo(() => {
    if (!selectedProject) return [];
    const filtered = filterOverviewProjects([selectedProject], state);
    return filtered.length ? filtered : [{ item: selectedProject, files: [] }];
  }, [selectedProject, state]);
  const statusCounts = useMemo(
    () =>
      getOverviewStatusCounts(
        selectedProject ? [selectedProject] : [],
        state.query,
      ),
    [selectedProject, state.query],
  );
  const visibleFileKeys = breakdownProjects.flatMap(({ files }) =>
    files.map(({ item }) => item.key),
  );
  const allFilesExpanded =
    visibleFileKeys.length > 0 &&
    visibleFileKeys.every((key) => state.expandedFileKeys.has(key));
  const expansionLabel = allFilesExpanded
    ? 'Collapse all files'
    : 'Expand all files';
  const resetFilters = () =>
    onStateChange((current) => ({ ...current, query: '', statuses: [] }));
  const hasActiveFilters = Boolean(state.query.trim() || state.statuses.length);
  const totalCaseCount = Math.max(dump.summary.total, cases.length);
  const toggleFile = (key: string) =>
    onStateChange((current) => {
      const expandedFileKeys = new Set(current.expandedFileKeys);
      if (expandedFileKeys.has(key)) expandedFileKeys.delete(key);
      else expandedFileKeys.add(key);
      return { ...current, expandedFileKeys };
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
      statuses: failed ? ['failed'] : ['passed'],
      selectedProjectKey:
        projects.find((project) =>
          failed
            ? getOverviewProjectStatus(project) === 'failed'
            : getOverviewProjectStatus(project) === 'passed',
        )?.key ?? current.selectedProjectKey,
      collapsedProjectGroups: new Set(),
      expandedFileKeys: new Set([
        ...current.expandedFileKeys,
        ...projects.flatMap((project) =>
          project.files
            .filter((file) =>
              failed
                ? file.status === 'failed' ||
                  file.hasScopeError ||
                  (project.hasScopeError && file.notRunCount > 0)
                : file.status === 'passed',
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
        reports={reports}
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
        className="runner-breakdown-panel"
        aria-label="Projects, files and cases"
      >
        <div className="runner-breakdown-controls">
          <CaseDensitySwitch
            value={caseDisplayMode}
            onChange={onCaseDisplayModeChange}
          />
          <CaseSearch
            query={state.query}
            onQueryChange={(query) =>
              onStateChange((current) => ({ ...current, query }))
            }
          />
        </div>
        {fileErrorCount || projectErrorCount ? (
          <div className="runner-sr-only" aria-live="polite">
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
        <div className="runner-overview-workspace">
          <ProjectNavigation
            projects={navigationProjects}
            selectedKey={selectedProject?.key}
            collapsedGroups={state.collapsedProjectGroups}
            onSelect={(key) =>
              onStateChange((current) => selectOverviewProject(current, key))
            }
            onToggleGroup={(status) =>
              onStateChange((current) => {
                const collapsedProjectGroups = new Set(
                  current.collapsedProjectGroups,
                );
                if (collapsedProjectGroups.has(status))
                  collapsedProjectGroups.delete(status);
                else collapsedProjectGroups.add(status);
                return { ...current, collapsedProjectGroups };
              })
            }
          />
          <div className="runner-overview-project">
            <ProjectBreakdownTree
              projects={breakdownProjects}
              visualIndex={visualIndex}
              caseDisplayMode={caseDisplayMode}
              expandedFileKeys={state.expandedFileKeys}
              projectSorts={state.projectSorts}
              query={state.query}
              headerControls={
                <div className="runner-project-header-controls">
                  <CaseStatusFilters
                    statuses={state.statuses}
                    counts={statusCounts}
                    onStatusToggle={(status) =>
                      onStateChange((current) => ({
                        ...current,
                        statuses: toggleOverviewStatus(
                          current.statuses,
                          status,
                        ),
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="runner-files-toggle"
                    aria-label={expansionLabel}
                    title={expansionLabel}
                    aria-pressed={allFilesExpanded}
                    disabled={!visibleFileKeys.length}
                    onClick={() =>
                      onStateChange((current) => ({
                        ...current,
                        expandedFileKeys: toggleOverviewFiles(
                          current.expandedFileKeys,
                          visibleFileKeys,
                        ),
                      }))
                    }
                  >
                    <span
                      className={`runner-files-icon${allFilesExpanded ? ' is-collapse' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              }
              onSortChange={(projectKey, sort) =>
                onStateChange((current) =>
                  changeOverviewSort(current, projectKey, sort),
                )
              }
              onToggleFile={toggleFile}
              hasActiveFilters={hasActiveFilters}
              onResetFilters={resetFilters}
              onOpenCase={onOpenCase}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
